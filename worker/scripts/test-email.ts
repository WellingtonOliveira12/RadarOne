#!/usr/bin/env npx ts-node
/**
 * ============================================================
 * TEST EMAIL - Testa configuracao do Resend
 * ============================================================
 *
 * USO:
 *   npx ts-node scripts/test-email.ts <email-destino>
 *
 * EXEMPLO:
 *   npx ts-node scripts/test-email.ts meuemail@gmail.com
 *
 * VARIAVEIS NECESSARIAS:
 *   RESEND_API_KEY - API key do Resend (obter em resend.com)
 *   EMAIL_FROM (opcional) - Remetente (default: onboarding@resend.dev)
 */

// Carrega .env
import * as dotenv from 'dotenv';
dotenv.config();

async function testEmail(to: string): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('  TESTE DE EMAIL - RESEND');
  console.log('='.repeat(60));
  console.log('');

  // Verifica variaveis
  const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'RadarOne <onboarding@resend.dev>';

  console.log('Configuracao:');
  console.log(`  RESEND_API_KEY: ${apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'NAO CONFIGURADO'}`);
  console.log(`  EMAIL_FROM: ${fromEmail}`);
  console.log(`  Destino: ${to}`);
  console.log('');

  if (!apiKey) {
    console.log('ERRO: RESEND_API_KEY nao configurado!');
    console.log('');
    console.log('Para configurar:');
    console.log('  1. Acesse https://resend.com');
    console.log('  2. Crie uma conta e gere uma API key');
    console.log('  3. Adicione ao .env ou variaveis de ambiente');
    console.log('');
    process.exit(1);
  }

  console.log('Enviando email de teste...');
  console.log('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: 'RadarOne - Teste de Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #667eea;">Email Configurado!</h2>
            <p>Parabens! O servico de email do RadarOne esta funcionando corretamente.</p>
            <p>Voce recebera alertas neste endereco quando novos anuncios forem encontrados.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #999999; font-size: 12px;">
              Teste realizado em: ${new Date().toISOString()}
            </p>
          </div>
        `,
        text: `
Email Configurado!

Parabens! O servico de email do RadarOne esta funcionando corretamente.
Voce recebera alertas neste endereco quando novos anuncios forem encontrados.

Teste realizado em: ${new Date().toISOString()}
        `.trim(),
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('SUCESSO!');
      console.log('');
      console.log(`  Message ID: ${data.id}`);
      console.log(`  Destino: ${to}`);
      console.log('');
      console.log('Verifique sua caixa de entrada (e spam).');
      console.log('');
    } else {
      console.log('ERRO!');
      console.log('');
      console.log(`  Status: ${response.status}`);
      console.log(`  Erro: ${data.message || JSON.stringify(data)}`);
      console.log('');

      // Dicas de erro
      if (data.message?.toLowerCase().includes('api key')) {
        console.log('DICA: A API key esta invalida ou expirada.');
        console.log('      Gere uma nova em https://resend.com/api-keys');
      }

      if (data.message?.toLowerCase().includes('verified') || data.message?.toLowerCase().includes('domain')) {
        console.log('DICA: O dominio do remetente nao esta verificado.');
        console.log('      Use EMAIL_FROM=onboarding@resend.dev para testes');
        console.log('      ou verifique seu dominio em https://resend.com/domains');
      }

      console.log('');
      process.exit(1);
    }
  } catch (error: any) {
    console.log('ERRO DE CONEXAO!');
    console.log('');
    console.log(`  ${error.message}`);
    console.log('');
    process.exit(1);
  }
}

// Main
const email = process.argv[2];

if (!email) {
  console.log('');
  console.log('USO: npx ts-node scripts/test-email.ts <email-destino>');
  console.log('');
  console.log('EXEMPLO:');
  console.log('  npx ts-node scripts/test-email.ts meuemail@gmail.com');
  console.log('');
  process.exit(1);
}

testEmail(email);
