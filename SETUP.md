# 🚀 Setup Rápido - RadarOne

## Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 20+ (para desenvolvimento local)
- PostgreSQL (se não usar Docker)

## Opção 1: Docker (Recomendado para produção)

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e adicione suas credenciais:

```env
JWT_SECRET=sua-chave-secreta-jwt
KIWIFY_API_KEY=sua-api-key-kiwify
KIWIFY_WEBHOOK_SECRET=seu-webhook-secret
TELEGRAM_BOT_TOKEN=seu-bot-token
```

### 2. Subir todos os serviços

```bash
docker-compose up -d
```

### 3. Verificar se está funcionando

- Frontend: http://localhost
- Backend: http://localhost:3000
- Backend Health Check: http://localhost:3000/health

### 4. Ver logs

```bash
# Todos os serviços
docker-compose logs -f

# Serviço específico
docker-compose logs -f backend
docker-compose logs -f worker
```

### 5. Parar serviços

```bash
docker-compose down
```

### 6. Limpar tudo (incluindo volumes)

```bash
docker-compose down -v
```

---

## Opção 2: Desenvolvimento Local

### 1. Setup do Backend

```bash
cd backend
npm install
cp .env.example .env
# Edite o .env com suas configurações

# Executar migrações
npm run prisma:migrate

# Gerar Prisma Client
npm run prisma:generate

# Iniciar servidor
npm run dev
```

Backend rodando em: http://localhost:3000

### 2. Setup do Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Configurar VITE_API_URL=http://localhost:3000

# Iniciar dev server
npm run dev
```

Frontend rodando em: http://localhost:5173

### 3. Setup do Worker

```bash
cd worker
npm install
npm run playwright:install
cp .env.example .env
# Configurar DATABASE_URL e TELEGRAM_BOT_TOKEN

# Gerar Prisma Client
npm run prisma:generate

# Iniciar worker
npm run dev
```

---

## Comandos Úteis

### Backend

```bash
# Desenvolvimento
npm run dev

# Build
npm run build

# Produção
npm start

# Prisma Studio (visualizar banco)
npm run prisma:studio

# Criar migração
npm run prisma:migrate
```

### Frontend

```bash
# Desenvolvimento
npm run dev

# Build
npm run build

# Preview build
npm run preview
```

### Worker

```bash
# Desenvolvimento
npm run dev

# Build
npm run build

# Produção
npm start

# Instalar browsers Playwright
npm run playwright:install
```

---

## Configuração do Telegram Bot

### 1. Criar Bot

1. Abra o Telegram e busque por `@BotFather`
2. Envie `/newbot`
3. Siga as instruções e copie o token
4. Adicione o token no `.env` como `TELEGRAM_BOT_TOKEN`

### 2. Obter Chat ID

1. Inicie conversa com seu bot
2. Acesse: `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`
3. Procure por `"chat":{"id":123456789}`
4. Use esse ID no campo `telegramChatId` do usuário

---

## Configuração da Kiwify

### 1. Obter API Key

1. Acesse o painel da Kiwify
2. Vá em Configurações > Integrações
3. Copie sua API Key
4. Adicione no `.env` como `KIWIFY_API_KEY`

### 2. Configurar Webhook

1. No painel Kiwify, vá em Webhooks
2. Adicione a URL: `https://seu-dominio.com/api/webhooks/kiwify`
3. Configure o secret e adicione no `.env` como `KIWIFY_WEBHOOK_SECRET`
4. Selecione os eventos desejados

---

## Banco de Dados

### PostgreSQL Local

```bash
# Instalar PostgreSQL (macOS)
brew install postgresql@16
brew services start postgresql@16

# Criar banco
createdb radarone

# Configurar no .env
DATABASE_URL="postgresql://seu-usuario:sua-senha@localhost:5432/radarone?schema=public"
```

### PostgreSQL Docker (alternativa)

```bash
docker run --name radarone-postgres \
  -e POSTGRES_USER=radarone \
  -e POSTGRES_PASSWORD=radarone123 \
  -e POSTGRES_DB=radarone \
  -p 5432:5432 \
  -d postgres:16-alpine
```

---

## Troubleshooting

### Erro: "Prisma Client not generated"

```bash
npm run prisma:generate
```

### Erro: "Port already in use"

```bash
# Encontrar processo usando a porta
lsof -i :3000

# Matar processo
kill -9 <PID>
```

### Erro: "Cannot connect to database"

- Verifique se o PostgreSQL está rodando
- Confirme credenciais no `.env`
- Teste conexão: `psql -U usuario -d radarone`

### Erro: Worker não encontra anúncios

- Scrapers ainda não estão implementados completamente
- Precisa adaptar seletores CSS para cada site
- Ver logs do worker para detalhes

---

## Próximos Passos

1. Criar conta de usuário via `/register`
2. Fazer login
3. Configurar Telegram Chat ID no perfil
4. Criar seu primeiro monitor
5. Aguardar worker executar (intervalo padrão: 5 min)

---

## Suporte

Se encontrar problemas, verifique:

1. Logs dos serviços
2. Variáveis de ambiente configuradas
3. Dependências instaladas
4. Portas disponíveis

Para mais detalhes, consulte o README principal.
