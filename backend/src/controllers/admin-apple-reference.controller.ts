import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as XLSX from 'xlsx';

/**
 * Admin controller for Apple Price References (V3).
 * Manages the reference table used to evaluate Apple product pricing.
 */
export class AdminAppleReferenceController {
  /**
   * GET /admin/apple-references
   * List all Apple price references.
   */
  static async list(req: Request, res: Response) {
    try {
      const refs = await prisma.applePriceReference.findMany({
        orderBy: [{ model: 'asc' }, { storage: 'asc' }],
      });
      res.json(refs);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list Apple references', details: error.message });
    }
  }

  /**
   * POST /admin/apple-references
   * Create a single Apple price reference.
   */
  static async create(req: Request, res: Response) {
    try {
      const { model, storage, referencePrice } = req.body;

      if (!model || !storage || !referencePrice) {
        return res.status(400).json({ error: 'model, storage, and referencePrice are required' });
      }

      const ref = await prisma.applePriceReference.upsert({
        where: { model_storage: { model, storage } },
        update: { referencePrice: Number(referencePrice) },
        create: { model, storage, referencePrice: Number(referencePrice) },
      });

      res.status(201).json(ref);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create Apple reference', details: error.message });
    }
  }

  /**
   * PUT /admin/apple-references/:id
   * Update an Apple price reference.
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { model, storage, referencePrice } = req.body;

      const ref = await prisma.applePriceReference.update({
        where: { id },
        data: {
          ...(model && { model }),
          ...(storage && { storage }),
          ...(referencePrice !== undefined && { referencePrice: Number(referencePrice) }),
        },
      });

      res.json(ref);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update Apple reference', details: error.message });
    }
  }

  /**
   * DELETE /admin/apple-references/:id
   * Delete an Apple price reference.
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.applePriceReference.delete({ where: { id } });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete Apple reference', details: error.message });
    }
  }

  /**
   * POST /admin/apple-references/upload
   * Upload an Excel file to replace/update all Apple price references.
   * Expected columns: Modelo | Armazenamento | Preço Bom (R$)
   */
  static async upload(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ error: 'Excel file has no sheets' });
      }

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Excel sheet is empty' });
      }

      // Parse rows — flexible column matching
      const parsed: { model: string; storage: string; referencePrice: number }[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const modelo = row['Modelo'] || row['modelo'] || row['Model'] || row['model'] || '';
        const armazenamento = row['Armazenamento'] || row['armazenamento'] || row['Storage'] || row['storage'] || '';
        const preco = row['Preço Bom (R$)'] || row['Preco Bom (R$)'] || row['Preço'] || row['preco'] || row['Price'] || row['price'] || row['referencePrice'] || 0;

        if (!modelo || !armazenamento) {
          errors.push(`Row ${i + 2}: missing modelo or armazenamento`);
          continue;
        }

        const price = Number(preco);
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${i + 2}: invalid price "${preco}"`);
          continue;
        }

        parsed.push({
          model: String(modelo).trim(),
          storage: String(armazenamento).trim(),
          referencePrice: price,
        });
      }

      if (parsed.length === 0) {
        return res.status(400).json({ error: 'No valid rows found', errors });
      }

      // Upsert all (within a transaction)
      let created = 0;
      let updated = 0;

      await prisma.$transaction(async (tx) => {
        for (const item of parsed) {
          const existing = await tx.applePriceReference.findUnique({
            where: { model_storage: { model: item.model, storage: item.storage } },
          });

          if (existing) {
            await tx.applePriceReference.update({
              where: { id: existing.id },
              data: { referencePrice: item.referencePrice },
            });
            updated++;
          } else {
            await tx.applePriceReference.create({ data: item });
            created++;
          }
        }
      });

      res.json({
        success: true,
        totalRows: rows.length,
        parsed: parsed.length,
        created,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to process upload', details: error.message });
    }
  }
}
