import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../server';
import { validateCpf, encryptCpf } from '../utils/crypto';
import { startTrialForUser } from '../services/billingService';
import { sendWelcomeEmail } from '../services/emailService';

/**
 * Controller de Autenticação
 * TODO: Implementar validações completas
 */

export class AuthController {
  /**
   * Registro de novo usuário
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, phone, cpf, telegramUsername } = req.body;

      // Validações básicas
      if (!email || !password || !name) {
        res.status(400).json({ error: 'Campos obrigatórios faltando (email, password, name)' });
        return;
      }

      // Validar CPF se fornecido
      if (cpf) {
        if (!validateCpf(cpf)) {
          res.status(400).json({ error: 'CPF inválido' });
          return;
        }
      }

      // Verifica se usuário já existe
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        res.status(409).json({ error: 'Email já cadastrado' });
        return;
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criptografar CPF se fornecido
      let cpfEncrypted: string | undefined;
      let cpfLast4: string | undefined;

      if (cpf) {
        const encrypted = encryptCpf(cpf);
        cpfEncrypted = encrypted.encrypted;
        cpfLast4 = encrypted.last4;
      }

      // Cria usuário
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          name,
          phone,
          cpfEncrypted,
          cpfLast4
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          cpfLast4: true,
          role: true,
          createdAt: true
        }
      });

      // Enviar e-mail de boas-vindas (não bloqueia o registro se falhar)
      sendWelcomeEmail(user.email, user.name).catch((err) => {
        console.error('Erro ao enviar e-mail de boas-vindas:', err);
      });

      // Criar assinatura trial automática (plano FREE por padrão)
      try {
        await startTrialForUser(user.id, 'free');
      } catch (trialError) {
        console.error('Erro ao criar trial automático:', trialError);
        // Continua mesmo se falhar o trial (usuário já foi criado)
      }

      // Se tiver telegramUsername, criar TelegramAccount (precisa de chatId, então só cria placeholder)
      // A vinculação real acontece quando o usuário conecta no bot do Telegram
      if (telegramUsername) {
        try {
          // Por enquanto não criamos TelegramAccount sem chatId
          // O usuário precisará conectar no bot do Telegram para vincular
          console.log(`Telegram username fornecido: ${telegramUsername}, aguardando vinculação com bot`);
        } catch (telegramError) {
          console.error('Erro ao processar Telegram:', telegramError);
        }
      }

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user
      });
    } catch (error) {
      console.error('Erro ao registrar usuário:', error);
      res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  }

  /**
   * Login de usuário
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      // Busca usuário
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          subscriptions: {
            where: {
              status: 'ACTIVE'
            },
            include: {
              plan: true
            }
          }
        }
      });

      if (!user) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Verifica senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Verifica se usuário está ativo e não bloqueado
      if (!user.isActive || user.blocked) {
        res.status(403).json({ error: 'Usuário bloqueado. Entre em contato com o suporte' });
        return;
      }

      // Gera token JWT
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;
      const options: SignOptions = {
        expiresIn
      };

      const token = jwt.sign(
        { userId: user.id },
        secret,
        options
      );

      // Remove senha do objeto
      const { passwordHash: _, ...userWithoutPassword } = user;

      res.json({
        message: 'Login realizado com sucesso',
        token,
        user: userWithoutPassword
      });
    } catch (error) {
      console.error('Erro ao fazer login:', error);
      res.status(500).json({ error: 'Erro ao fazer login' });
    }
  }

  /**
   * Retorna dados do usuário autenticado
   */
  static async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          blocked: true,
          createdAt: true,
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'TRIAL'] }
            },
            include: {
              plan: true
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      res.json({ user });
    } catch (error) {
      console.error('Erro ao buscar dados do usuário:', error);
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  }
}
