import { prisma } from '../server';
import { sendEmail } from './emailService';

interface CreateSupportTicketData {
  userId?: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  attachmentUrl?: string;
}

/**
 * Cria um ticket de suporte e envia e-mail para contato@radarone.com.br
 */
export async function createSupportTicket(data: CreateSupportTicketData): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  try {
    // Criar ticket no banco
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: data.userId || null,
        email: data.email,
        category: data.category,
        subject: data.subject,
        message: data.message,
        attachmentUrl: data.attachmentUrl || null,
        status: 'OPEN'
      }
    });

    // Enviar e-mail para contato@radarone.com.br
    const emailHtml = `
      <h2>Novo Ticket de Suporte - RadarOne</h2>
      <p><strong>Ticket ID:</strong> ${ticket.id}</p>
      <p><strong>Categoria:</strong> ${data.category}</p>
      <p><strong>Assunto:</strong> ${data.subject}</p>
      <p><strong>E-mail do usuário:</strong> ${data.email}</p>
      ${data.userId ? `<p><strong>User ID:</strong> ${data.userId}</p>` : ''}
      <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>

      <h3>Mensagem:</h3>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; white-space: pre-wrap;">
${data.message}
      </div>

      ${data.attachmentUrl ? `<p><strong>Anexo:</strong> <a href="${data.attachmentUrl}">${data.attachmentUrl}</a></p>` : ''}

      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="font-size: 12px; color: #6b7280;">
        Este é um e-mail automático do sistema RadarOne.
      </p>
    `;

    await sendEmail({
      to: 'contato@radarone.com.br',
      subject: `[RadarOne Suporte] ${data.category} - ${data.subject}`,
      html: emailHtml
    });

    console.log('[SupportService] Ticket criado e e-mail enviado', { ticketId: ticket.id, category: data.category });

    return {
      success: true,
      ticketId: ticket.id
    };
  } catch (error: any) {
    console.error('[SupportService] Erro ao criar ticket', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Busca tickets de um usuário
 */
export async function getUserTickets(userId: string): Promise<any[]> {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return tickets;
  } catch (error: any) {
    console.error('[SupportService] Erro ao buscar tickets', { userId, error: error.message });
    return [];
  }
}
