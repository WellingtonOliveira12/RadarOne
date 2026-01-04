import { Page } from 'playwright';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Screenshot Helper - Captura screenshots para debug de erros
 *
 * Features:
 * - Screenshots em caso de erro durante scraping
 * - Organização por data e monitor
 * - Limpeza automática de screenshots antigos
 * - Preparado para upload em storage (S3, Cloudinary, etc)
 */

export interface ScreenshotOptions {
  monitorId: string;
  monitorName: string;
  site: string;
  errorMessage?: string;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

class ScreenshotHelper {
  private baseDir: string;
  private enabled: boolean;
  private maxAge: number; // dias

  constructor() {
    // Diretório base para screenshots
    this.baseDir = process.env.SCREENSHOT_DIR || '/tmp/radarone-screenshots';

    // Ativar/desativar screenshots
    this.enabled = process.env.ENABLE_SCREENSHOTS !== 'false';

    // Idade máxima dos screenshots (default: 7 dias)
    this.maxAge = parseInt(process.env.SCREENSHOT_MAX_AGE_DAYS || '7');

    // Criar diretório se não existir
    this.ensureDirectoryExists();

    // Agendar limpeza diária
    this.scheduleCleanup();
  }

  /**
   * Captura screenshot de uma página com erro
   */
  async captureError(page: Page, options: ScreenshotOptions): Promise<ScreenshotResult> {
    if (!this.enabled) {
      return { success: false, error: 'Screenshots desabilitados' };
    }

    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `${options.site}_${options.monitorId}_${timestamp}.png`;
      const dateDir = this.getDateDirectory();
      const fullPath = path.join(dateDir, filename);

      // Garante que o diretório da data existe
      if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
      }

      // Captura screenshot
      await page.screenshot({
        path: fullPath,
        fullPage: options.fullPage !== false, // default: true
      });

      logger.info({
        monitorId: options.monitorId,
        site: options.site,
        path: fullPath,
      }, '📸 Screenshot capturado com sucesso');

      // Opcional: Upload para storage externo
      const uploadUrl = await this.uploadToStorage(fullPath, filename);

      return {
        success: true,
        path: fullPath,
        url: uploadUrl,
      };
    } catch (error: any) {
      logger.error({
        monitorId: options.monitorId,
        error: error.message,
      }, '❌ Erro ao capturar screenshot');

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Captura screenshot para debug (não necessariamente erro)
   */
  async captureDebug(page: Page, name: string): Promise<ScreenshotResult> {
    if (!this.enabled) {
      return { success: false, error: 'Screenshots desabilitados' };
    }

    try {
      const timestamp = Date.now();
      const filename = `debug_${name}_${timestamp}.png`;
      const fullPath = path.join(this.baseDir, 'debug', filename);

      // Garante que o diretório existe
      const debugDir = path.join(this.baseDir, 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      await page.screenshot({ path: fullPath });

      return {
        success: true,
        path: fullPath,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Upload para storage externo (S3, Cloudinary, etc)
   */
  private async uploadToStorage(localPath: string, filename: string): Promise<string | undefined> {
    // TODO: Implementar upload para S3/Cloudinary se configurado
    // Exemplo com S3:
    // if (process.env.AWS_S3_BUCKET) {
    //   const s3Url = await uploadToS3(localPath, filename);
    //   return s3Url;
    // }

    return undefined;
  }

  /**
   * Obtém diretório organizado por data (YYYY-MM-DD)
   */
  private getDateDirectory(): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.baseDir, today);
  }

  /**
   * Garante que o diretório base existe
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info({ dir: this.baseDir }, '📁 Diretório de screenshots criado');
    }
  }

  /**
   * Remove screenshots antigos
   */
  private cleanup(): void {
    try {
      const now = Date.now();
      const maxAgeMs = this.maxAge * 24 * 60 * 60 * 1000;

      if (!fs.existsSync(this.baseDir)) return;

      // Listar diretórios de data
      const dateDirs = fs.readdirSync(this.baseDir).filter((name) => {
        const fullPath = path.join(this.baseDir, name);
        return fs.statSync(fullPath).isDirectory() && name !== 'debug';
      });

      let deletedCount = 0;

      for (const dateDir of dateDirs) {
        const fullPath = path.join(this.baseDir, dateDir);
        const stats = fs.statSync(fullPath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          // Remover diretório e todos os arquivos
          fs.rmSync(fullPath, { recursive: true, force: true });
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info({ deletedCount, maxAge: this.maxAge }, '🧹 Screenshots antigos removidos');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Erro ao limpar screenshots');
    }
  }

  /**
   * Agenda limpeza diária de screenshots antigos
   */
  private scheduleCleanup(): void {
    // Executar limpeza a cada 24 horas
    setInterval(() => {
      this.cleanup();
    }, 24 * 60 * 60 * 1000);

    // Executar limpeza inicial após 1 minuto
    setTimeout(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Verifica se screenshots estão habilitados
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Obtém estatísticas de uso
   */
  getStats(): { total: number; sizeBytes: number; oldestDate: string | null } {
    try {
      let total = 0;
      let sizeBytes = 0;
      let oldestDate: string | null = null;

      if (!fs.existsSync(this.baseDir)) {
        return { total, sizeBytes, oldestDate };
      }

      const dateDirs = fs.readdirSync(this.baseDir).filter((name) => {
        const fullPath = path.join(this.baseDir, name);
        return fs.statSync(fullPath).isDirectory() && name !== 'debug';
      });

      for (const dateDir of dateDirs) {
        const fullPath = path.join(this.baseDir, dateDir);
        const files = fs.readdirSync(fullPath);

        total += files.length;

        for (const file of files) {
          const filePath = path.join(fullPath, file);
          const stats = fs.statSync(filePath);
          sizeBytes += stats.size;
        }

        if (!oldestDate || dateDir < oldestDate) {
          oldestDate = dateDir;
        }
      }

      return { total, sizeBytes, oldestDate };
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Erro ao obter estatísticas de screenshots');
      return { total: 0, sizeBytes: 0, oldestDate: null };
    }
  }
}

// Singleton
export const screenshotHelper = new ScreenshotHelper();
