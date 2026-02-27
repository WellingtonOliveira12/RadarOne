import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// HOISTED MOCKS
// ============================================================

const { mockCreateSupportTicket, mockGetUserTickets } = vi.hoisted(() => ({
  mockCreateSupportTicket: vi.fn(),
  mockGetUserTickets: vi.fn(),
}));

vi.mock('../../src/services/supportService', () => ({
  createSupportTicket: mockCreateSupportTicket,
  getUserTickets: mockGetUserTickets,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { SupportController } from '../../src/controllers/support.controller';

// ============================================================
// HELPERS
// ============================================================

function makeReq(overrides: Partial<any> = {}): any {
  return {
    userId: 'user-1',
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const validTicketBody = {
  email: 'user@example.com',
  category: 'Suporte',
  subject: 'Problema com o monitor',
  message: 'Meu monitor não está funcionando corretamente.',
};

// ============================================================
// TESTS
// ============================================================

describe('SupportController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // createTicket
  // ----------------------------------------------------------
  describe('createTicket', () => {
    it('returns 400 when email is missing', async () => {
      const req = makeReq({ body: { ...validTicketBody, email: undefined } });
      const res = makeRes();

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Campos obrigatórios: email, category, subject, message',
      });
    });

    it('returns 400 when category is missing', async () => {
      const req = makeReq({ body: { ...validTicketBody, category: undefined } });
      const res = makeRes();

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Campos obrigatórios: email, category, subject, message',
      });
    });

    it('returns 400 when subject is missing', async () => {
      const req = makeReq({ body: { ...validTicketBody, subject: undefined } });
      const res = makeRes();

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when message is missing', async () => {
      const req = makeReq({ body: { ...validTicketBody, message: undefined } });
      const res = makeRes();

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when category is invalid', async () => {
      const req = makeReq({ body: { ...validTicketBody, category: 'InvalidCategory' } });
      const res = makeRes();

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Categoria inválida' });
    });

    it('accepts all valid categories', async () => {
      const validCategories = ['Suporte', 'Sugestão', 'Crítica', 'Financeiro', 'Outro'];
      mockCreateSupportTicket.mockResolvedValue({ success: true, ticketId: 'ticket-1' });

      for (const category of validCategories) {
        const req = makeReq({ body: { ...validTicketBody, category } });
        const res = makeRes();

        await SupportController.createTicket(req, res);

        expect(res.status).not.toHaveBeenCalledWith(400);
      }
    });

    it('creates ticket successfully and returns ticketId', async () => {
      const req = makeReq({ body: validTicketBody });
      const res = makeRes();
      mockCreateSupportTicket.mockResolvedValue({ success: true, ticketId: 'ticket-abc123' });

      await SupportController.createTicket(req, res);

      expect(mockCreateSupportTicket).toHaveBeenCalledWith({
        userId: 'user-1',
        email: validTicketBody.email,
        category: validTicketBody.category,
        subject: validTicketBody.subject,
        message: validTicketBody.message,
        attachmentUrl: undefined,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ticketId: 'ticket-abc123',
        message: 'Ticket criado com sucesso. Retornaremos em breve.',
      });
    });

    it('passes attachmentUrl when provided', async () => {
      const req = makeReq({
        body: { ...validTicketBody, attachmentUrl: 'https://storage.example.com/file.png' },
      });
      const res = makeRes();
      mockCreateSupportTicket.mockResolvedValue({ success: true, ticketId: 'ticket-1' });

      await SupportController.createTicket(req, res);

      expect(mockCreateSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentUrl: 'https://storage.example.com/file.png' })
      );
    });

    it('allows unauthenticated ticket creation (userId optional)', async () => {
      const req = makeReq({ userId: undefined, body: validTicketBody });
      const res = makeRes();
      mockCreateSupportTicket.mockResolvedValue({ success: true, ticketId: 'ticket-1' });

      await SupportController.createTicket(req, res);

      expect(mockCreateSupportTicket).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('returns 500 when service returns error', async () => {
      const req = makeReq({ body: validTicketBody });
      const res = makeRes();
      mockCreateSupportTicket.mockResolvedValue({ success: false, error: 'Database unavailable' });

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database unavailable' });
    });

    it('returns generic error when service returns no error message', async () => {
      const req = makeReq({ body: validTicketBody });
      const res = makeRes();
      mockCreateSupportTicket.mockResolvedValue({ success: false });

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao criar ticket' });
    });

    it('returns 500 on service exception', async () => {
      const req = makeReq({ body: validTicketBody });
      const res = makeRes();
      mockCreateSupportTicket.mockRejectedValue(new Error('Unexpected error'));

      await SupportController.createTicket(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao criar ticket de suporte' });
    });
  });

  // ----------------------------------------------------------
  // getTickets
  // ----------------------------------------------------------
  describe('getTickets', () => {
    it('returns 401 when userId is missing', async () => {
      const req = makeReq({ userId: undefined });
      const res = makeRes();

      await SupportController.getTickets(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    });

    it('returns empty array when user has no tickets', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetUserTickets.mockResolvedValue([]);

      await SupportController.getTickets(req, res);

      expect(mockGetUserTickets).toHaveBeenCalledWith('user-1');
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns user tickets successfully', async () => {
      const req = makeReq();
      const res = makeRes();
      const tickets = [
        {
          id: 'ticket-1',
          userId: 'user-1',
          email: 'user@example.com',
          category: 'Suporte',
          subject: 'Monitor não funciona',
          message: 'Problema com o monitor.',
          status: 'OPEN',
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'ticket-2',
          userId: 'user-1',
          email: 'user@example.com',
          category: 'Financeiro',
          subject: 'Cobrança incorreta',
          message: 'Fui cobrado duas vezes.',
          status: 'CLOSED',
          createdAt: new Date('2026-01-10'),
        },
      ];
      mockGetUserTickets.mockResolvedValue(tickets);

      await SupportController.getTickets(req, res);

      expect(res.json).toHaveBeenCalledWith(tickets);
    });

    it('returns 500 on service exception', async () => {
      const req = makeReq();
      const res = makeRes();
      mockGetUserTickets.mockRejectedValue(new Error('DB crash'));

      await SupportController.getTickets(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao buscar tickets' });
    });
  });
});
