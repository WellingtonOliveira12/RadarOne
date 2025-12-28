# Documentação Técnica - Conexão do Telegram via Deep Link

## Sumário

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Fluxo de Conexão](#fluxo-de-conexão)
4. [Backend](#backend)
5. [Frontend](#frontend)
6. [Segurança](#segurança)
7. [Troubleshooting](#troubleshooting)

## Visão Geral

Este documento descreve a implementação do sistema de conexão do Telegram via deep link para o RadarOne.

### Por que não usar busca do Telegram?

**Problema:** Quando usuários pesquisam "RadarOne" no Telegram, podem cair em bots parecidos com nomes em outros idiomas (ex: "Радар ONE Бот" em russo), conectando no bot errado e não recebendo alertas.

**Solução:** Fornecer sempre um link oficial direto (`https://t.me/RadarOneAlertaBot?start=connect_<TOKEN>`) via botão, QR code ou deep link, eliminando a necessidade de busca manual.

### Link Oficial do Bot

- **Username:** `@RadarOneAlertaBot`
- **Link base:** `https://t.me/RadarOneAlertaBot`
- **Deep link format:** `https://t.me/RadarOneAlertaBot?start=connect_<TOKEN>`

## Arquitetura

### Componentes

1. **Backend (Node.js + TypeScript + Prisma)**
   - `TelegramConnectToken` - Tabela Prisma para tokens
   - `SupportTicket` - Tabela Prisma para tickets de suporte
   - `telegramService.ts` - Lógica de negócio
   - `telegram.controller.ts` - Endpoints REST
   - Webhook handler - Processa mensagens do bot

2. **Frontend (React + TypeScript)**
   - `TelegramConnectionPage.tsx` - Página principal de conexão
   - `ManualPage.tsx` - Manual do usuário
   - `FAQPage.tsx` - Perguntas frequentes
   - `ContactPage.tsx` - Formulário de suporte

### Banco de Dados (Prisma)

```prisma
model TelegramConnectToken {
  id        String      @id @default(cuid())
  userId    String      @map("user_id")
  token     String      @unique
  status    TokenStatus @default(PENDING)
  expiresAt DateTime    @map("expires_at")
  usedAt    DateTime?   @map("used_at")
  createdAt DateTime    @default(now()) @map("created_at")
}

enum TokenStatus {
  PENDING
  USED
  EXPIRED
}

model SupportTicket {
  id            String       @id @default(cuid())
  userId        String?      @map("user_id")
  email         String
  category      String
  subject       String
  message       String       @db.Text
  attachmentUrl String?      @map("attachment_url")
  status        TicketStatus @default(OPEN)
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

## Fluxo de Conexão

### 1. Geração do Token

**Frontend:**
```typescript
// POST /api/telegram/connect-token
const response = await api.post('/api/telegram/connect-token', {});
// Retorna: { connectUrl, token, expiresAt, botUsername }
```

**Backend:**
```typescript
export async function generateConnectToken(userId: string) {
  const token = /* gerado aleatoriamente (32+ chars) */;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await prisma.telegramConnectToken.create({
    data: { userId, token, status: 'PENDING', expiresAt }
  });

  return {
    connectUrl: `https://t.me/RadarOneAlertaBot?start=connect_${token}`,
    token,
    expiresAt
  };
}
```

### 2. Usuário Abre o Link

Três formas:
1. **Botão "Abrir bot":** Abre diretamente no Telegram (mobile/desktop)
2. **QR Code:** Escaneado com Telegram (desktop)
3. **Copiar link:** Colar manualmente

### 3. Telegram Envia Webhook

Quando usuário clica em "START" no bot:

```json
{
  "update_id": 123456,
  "message": {
    "text": "/start connect_abc123def456...",
    "from": {
      "id": 987654321,
      "username": "usuario",
      "first_name": "Nome"
    },
    "chat": {
      "id": 987654321
    }
  }
}
```

### 4. Backend Processa Webhook

**Webhook Handler:**
```typescript
// POST /api/telegram/webhook
if (text.startsWith('/start ')) {
  const startParam = text.replace('/start ', '');
  await processStartCommand(chatId, startParam, telegramUserId, username);
}
```

**processStartCommand:**
```typescript
export async function processStartCommand(
  chatId: string,
  startParam: string,
  telegramUserId: number,
  username?: string
) {
  // 1. Extrair token
  const token = startParam.replace('connect_', '');

  // 2. Buscar no banco
  const tokenRecord = await prisma.telegramConnectToken.findUnique({
    where: { token }
  });

  // 3. Validar (existe? não expirado? não usado?)
  if (!tokenRecord || tokenRecord.status === 'USED' || tokenRecord.expiresAt < new Date()) {
    // Enviar mensagem de erro
    return;
  }

  // 4. Vincular conta
  await prisma.telegramAccount.upsert({
    where: { userId: tokenRecord.userId },
    create: { userId, chatId, username, active: true },
    update: { chatId, username, active: true }
  });

  await prisma.notificationSettings.upsert({
    where: { userId: tokenRecord.userId },
    create: { userId, telegramEnabled: true, telegramChatId: chatId },
    update: { telegramEnabled: true, telegramChatId: chatId }
  });

  // 5. Marcar token como usado
  await prisma.telegramConnectToken.update({
    where: { id: tokenRecord.id },
    data: { status: 'USED', usedAt: new Date() }
  });

  // 6. Enviar confirmação
  await sendTelegramMessage({
    chatId,
    text: '✅ Telegram conectado ao RadarOne com sucesso!'
  });
}
```

### 5. Frontend Atualiza Status

```typescript
// GET /api/telegram/status
const status = await api.get('/api/telegram/status');
// Retorna: { connected: true, chatId, username, connectedAt }
```

## Backend

### Endpoints

#### POST `/api/telegram/connect-token`
- **Auth:** Requerida (JWT)
- **Retorna:** Token de conexão e deep link
- **Rate limit:** Sim

#### GET `/api/telegram/status`
- **Auth:** Requerida (JWT)
- **Retorna:** Status da conexão do Telegram

#### POST `/api/telegram/disconnect`
- **Auth:** Requerida (JWT)
- **Efeito:** Desvincula conta do Telegram

#### POST `/api/telegram/webhook`
- **Auth:** Secret via query string ou header
- **Efeito:** Processa mensagens do bot

#### POST `/api/support/ticket`
- **Auth:** Opcional
- **Efeito:** Cria ticket e envia e-mail para contato@radarone.com.br

## Frontend

### Componentes Principais

#### TelegramConnectionPage

Página principal de conexão com:
- Botão "Gerar link de conexão"
- QR Code (biblioteca `qrcode.react`)
- Deep link clicável
- Botão "Copiar link"
- Status de conexão
- Modal de correção "Bot errado"

#### ManualPage

Manual completo com seções:
- Primeiros passos
- Conectar Telegram (passo a passo)
- Criar monitores
- Como chegam os alertas
- Problemas comuns
- Boas práticas

#### FAQPage

Perguntas e respostas organizadas por categoria:
- Telegram
- Monitores
- Conta e Planos
- Alertas
- Suporte

#### ContactPage

Formulário de suporte com:
- Categoria (Suporte/Sugestão/Crítica/Financeiro/Outro)
- E-mail
- Assunto
- Mensagem
- Envio para contato@radarone.com.br

## Segurança

### Token de Conexão

1. **Geração:**
   - Token aleatório de 32+ caracteres
   - Combinação de Math.random() + timestamp
   - Único no banco (constraint unique)

2. **Expiração:**
   - Tempo de vida: 15 minutos
   - Verificado antes do uso
   - Marcado como EXPIRED após expiração

3. **Uso único:**
   - Status muda de PENDING → USED após uso
   - Tentativas de reutilização são rejeitadas

4. **Rate limiting:**
   - Endpoint de geração de token tem rate limit
   - Previne abuso

### Webhook

1. **Validação de secret:**
   - Query string: `?secret=...`
   - Header: `x-telegram-secret`
   - Deve corresponder a `TELEGRAM_WEBHOOK_SECRET` no .env

2. **HTTPS obrigatório:**
   - Telegram só envia webhooks para HTTPS

## Troubleshooting

### Bot Errado (Problema Comum)

**Sintoma:** Usuário não recebe alertas.

**Causa:** Pesquisou "RadarOne" no Telegram e caiu em bot falso.

**Solução:**
1. Verificar username: deve ser `@RadarOneAlertaBot`
2. Gerar novo link no painel
3. Usar link oficial (não pesquisar)

**Prevenção:** UI avisa "Não pesquise no Telegram"

### Token Expirado

**Sintoma:** Erro "Token expirado" no Telegram.

**Solução:** Gerar novo token no painel.

### Webhook Não Recebe Mensagens

**Diagnóstico:**
```bash
# Ver logs do webhook
grep "TelegramWebhook" logs/app.log

# Testar webhook manualmente
curl -X POST "https://api.radarone.com.br/api/telegram/webhook?secret=..." \
  -H "Content-Type: application/json" \
  -d '{"message":{"text":"/start connect_test","from":{"id":123},"chat":{"id":123}}}'
```

**Causas comuns:**
- Secret incorreto
- URL do webhook não configurada no BotFather
- HTTPS inválido

### Migração de Dados

Se houver usuários usando sistema antigo (RADAR-XXXXXX link code):

```sql
-- Verificar usuários com link code ativo
SELECT * FROM notification_settings
WHERE telegram_link_code IS NOT NULL
  AND telegram_link_expires_at > NOW();

-- Limpar códigos antigos expirados
UPDATE notification_settings
SET telegram_link_code = NULL,
    telegram_link_expires_at = NULL
WHERE telegram_link_expires_at < NOW();
```

## Testes

### Teste Manual - Fluxo Completo

1. Login no RadarOne
2. Acessar /telegram/connect
3. Clicar em "Gerar link de conexão"
4. Copiar o link gerado
5. Abrir no Telegram (ou escanear QR)
6. Verificar username: @RadarOneAlertaBot
7. Clicar em START
8. Ver mensagem "✅ Telegram conectado"
9. Verificar status no painel: "Telegram conectado"

### Teste de Expiração

1. Gerar link
2. Aguardar 15 minutos
3. Tentar usar link → Deve retornar "Token expirado"

### Teste de Reutilização

1. Gerar link
2. Usar link (conectar)
3. Tentar usar mesmo link novamente → Deve retornar "Token já utilizado"

## Logs e Monitoramento

### Eventos Auditados

- `telegram_connect_token_created` - Token gerado
- `telegram_connected` - Conta conectada com sucesso
- `telegram_disconnected` - Conta desconectada
- `telegram_connect_failed_invalid_token` - Token inválido
- `telegram_connect_failed_expired` - Token expirado
- `telegram_connect_failed_used` - Token já usado

### Métricas Sugeridas

- Taxa de sucesso de conexão
- Tempo médio entre geração e uso do token
- Tokens expirados vs usados
- Tickets de suporte por categoria

## Referências

- [Telegram Bot API - Deep Linking](https://core.telegram.org/bots#deep-linking)
- [Telegram Webhooks](https://core.telegram.org/bots/api#setwebhook)
- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
