import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email('Informe um e-mail válido'),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string().min(8, 'A confirmação deve ter pelo menos 8 caracteres'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido'),
  password: z.string().min(1, 'A senha é obrigatória'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
