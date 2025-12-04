# RadarOne - Backend

Backend do sistema RadarOne - API REST para gerenciamento de monitores de anúncios.

## 🚀 Tecnologias

- **Node.js** + **TypeScript**
- **Express** - Framework web
- **Prisma** - ORM para PostgreSQL
- **PostgreSQL** - Banco de dados
- **JWT** - Autenticação
- **Bcrypt** - Hash de senhas

## 📁 Estrutura

```
backend/
├── prisma/
│   ├── schema.prisma      # Modelo de dados
│   └── migrations/        # Migrações do banco
├── src/
│   ├── controllers/       # Lógica de negócio
│   ├── routes/            # Rotas da API
│   ├── middlewares/       # Middlewares (auth, etc)
│   ├── services/          # Serviços auxiliares
│   ├── utils/             # Funções utilitárias
│   └── server.ts          # Configuração do servidor
├── .env.example           # Exemplo de variáveis de ambiente
├── tsconfig.json          # Configuração TypeScript
└── package.json
```

## ⚙️ Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

- `DATABASE_URL`: URL do PostgreSQL
- `JWT_SECRET`: Chave secreta para JWT
- `KIWIFY_API_KEY`: Chave da API Kiwify
- `TELEGRAM_BOT_TOKEN`: Token do bot Telegram

> **ℹ️ Prisma 7**: Este projeto usa Prisma 7. A URL de conexão com o banco de dados agora é configurada no arquivo `prisma.config.ts` (na raiz do backend) ao invés de diretamente no `schema.prisma`. O comando `npm run prisma:generate` continua funcionando normalmente.

### 3. Executar migrações do banco

```bash
npm run prisma:migrate
```

### 4. Gerar Prisma Client

```bash
npm run prisma:generate
```

## 🏃 Executar

### Desenvolvimento

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000`

### Produção

```bash
npm run build
npm start
```

## 📊 Prisma Studio

Para visualizar e editar dados do banco:

```bash
npm run prisma:studio
```

## 🔐 Rotas da API

### Autenticação

- `POST /api/auth/register` - Criar conta
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Dados do usuário (requer autenticação)

### Usuários (TODO)

- `GET /api/users/:id` - Obter usuário
- `PUT /api/users/:id` - Atualizar usuário
- `DELETE /api/users/:id` - Deletar usuário

### Planos (TODO)

- `GET /api/plans` - Listar planos
- `GET /api/plans/:id` - Obter plano
- `POST /api/plans` - Criar plano (admin)

### Monitores ✅

**CRUD completo implementado com validações de plano**

- `GET /api/monitors` - Listar monitores do usuário autenticado
- `GET /api/monitors/:id` - Buscar monitor específico
- `POST /api/monitors` - Criar novo monitor (com validação de limites)
- `PUT /api/monitors/:id` - Atualizar monitor
- `DELETE /api/monitors/:id` - Deletar monitor
- `PATCH /api/monitors/:id/toggle-active` - Ativar/desativar monitor

#### Exemplo de criação de monitor:

```bash
curl -X POST http://localhost:3000/api/monitors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -d '{
    "name": "Notebooks Dell",
    "site": "MERCADO_LIVRE",
    "searchUrl": "https://lista.mercadolivre.com.br/notebook-dell",
    "priceMin": 1500,
    "priceMax": 3000
  }'
```

#### Sites suportados:
- `MERCADO_LIVRE` - Marketplace geral
- `OLX` - Classificados gerais
- `LEILAO` - Leilões
- `WEBMOTORS` - Portal de veículos
- `ICARROS` - Portal de veículos
- `ZAP_IMOVEIS` - Portal de imóveis
- `VIVA_REAL` - Portal de imóveis
- `IMOVELWEB` - Portal de imóveis

> **⚠️ Nota**: Os scrapers concretos ainda precisam ser implementados no worker. Por enquanto, apenas placeholders básicos existem para MERCADO_LIVRE e OLX.

### Assinaturas (TODO)

- `GET /api/subscriptions` - Listar assinaturas do usuário
- `POST /api/subscriptions` - Criar assinatura
- `PUT /api/subscriptions/:id` - Atualizar assinatura

### Cupons (TODO)

- `POST /api/coupons/validate` - Validar cupom
- `POST /api/coupons` - Criar cupom (admin)

### Webhooks (TODO)

- `POST /api/webhooks/kiwify` - Webhook da Kiwify

## 🎯 Regras de Plano para Monitores

O sistema implementa validações automáticas baseadas no plano do usuário:

| Plano | Monitores Ativos | Múltiplos Sites |
|-------|------------------|-----------------|
| **Starter** | 1 | ❌ Não (apenas 1 site) |
| **Standard** | 5 | ❌ Não (apenas 1 site) |
| **Pro** | 10 | ❌ Não (apenas 1 site) |
| **Master** | ♾️ Ilimitado | ❌ Não (apenas 1 site) |
| **Ultra** | ♾️ Ilimitado | ✅ Sim (múltiplos sites) |
| **Lifetime** | ♾️ Ilimitado | ✅ Sim (múltiplos sites) |

### Validações Aplicadas:

1. **Limite de monitores ativos**: Ao criar ou ativar um monitor, o sistema verifica se o usuário já atingiu o limite do seu plano.

2. **Restrição de site único**: Planos Starter, Standard, Pro e Master só permitem monitores em **um único site**. Por exemplo:
   - ✅ Pode criar múltiplos monitores na OLX
   - ❌ Não pode criar monitores na OLX **e** no Mercado Livre ao mesmo tempo
   - Para usar múltiplos sites, é necessário upgrade para Ultra ou Lifetime

3. **Mensagens de erro claras**: Quando o limite é atingido, o usuário recebe mensagem explicativa sugerindo upgrade.

## 🔄 Migrações do Banco

### Após clonar/atualizar o código:

```bash
# 1. Gerar Prisma Client
npm run prisma:generate

# 2. Criar e executar migração
npx prisma migrate dev --name add_monitor_updates

# Ou, se preferir nome automático:
npm run prisma:migrate
```

### Em produção:

```bash
# Executar migrações pendentes (não cria novas)
npx prisma migrate deploy
```

### Resetar banco (desenvolvimento):

```bash
# ⚠️ CUIDADO: Apaga todos os dados
npx prisma migrate reset
```

## 📝 TODO

### Controllers pendentes:
- [ ] UserController
- [ ] PlanController
- [x] **MonitorController** ✅ Implementado
- [ ] SubscriptionController
- [ ] CouponController
- [ ] WebhookController (Kiwify)
- [ ] StatisticsController (Dashboard)

### Serviços implementados:
- [x] **planService** ✅ - Validação de limites de planos
- [x] **monitorService** ✅ - CRUD completo de monitores

### Serviços pendentes:
- [ ] KiwifyService - Integração com API Kiwify
- [ ] TelegramService - Envio de alertas
- [ ] EmailService - Envio de emails
- [ ] SubscriptionService - Lógica de assinaturas
- [ ] UsageService - Contagem de consultas

### Middlewares pendentes:
- [ ] Validação de requisições (Joi/Zod)
- [ ] Rate limiting
- [ ] Logger (Winston/Pino)

### Funcionalidades pendentes:
- [ ] Sistema de pagamentos Kiwify
- [ ] Webhook handler para eventos Kiwify
- [ ] Gestão de cupons
- [ ] Controle de uso/consultas
- [ ] Seed do banco (planos iniciais)

## 🐳 Docker

Para rodar com Docker, veja o arquivo `docker-compose.yml` na raiz do projeto.

## 📄 Licença

Proprietário - RadarOne
