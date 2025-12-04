# RadarOne 🔍

Sistema SaaS completo para monitoramento e alerta de anúncios em múltiplas plataformas.

## 📋 Sobre

RadarOne é uma plataforma que permite aos usuários criar monitores personalizados para rastrear anúncios em sites como OLX, Mercado Livre, Imóveis, e mais. Quando novos anúncios correspondentes são encontrados, alertas são enviados automaticamente via Telegram.

## 🏗️ Arquitetura

### Monorepo com 4 componentes principais:

- **Backend**: API REST (Node.js + Express + Prisma + PostgreSQL)
- **Frontend**: Interface web (React + TypeScript + Vite)
- **Worker**: Serviço de scraping (Node.js + Playwright)
- **Shared**: Tipos e utilitários compartilhados

## 🚀 Tecnologias

### Backend
- Node.js + TypeScript
- Express.js
- Prisma ORM
- PostgreSQL
- JWT Authentication
- Integração Kiwify (pagamentos)

### Frontend
- React 18 + TypeScript
- Vite
- React Router
- Axios
- Context API

### Worker
- Node.js + TypeScript
- Playwright (automação de browser)
- Telegram Bot API
- Sistema de filas (futuro)

## 📊 Modelo de Dados

### Principais entidades:
- **Users**: Usuários do sistema
- **Plans**: Planos disponíveis (Starter, Standard, Pro, Master, Ultra, Vitalício)
- **Subscriptions**: Assinaturas ativas
- **Monitors**: Monitores configurados pelos usuários
- **AdsSeen**: Histórico de anúncios encontrados
- **Coupons**: Sistema de cupons de desconto
- **MonitorLogs**: Logs de execução
- **UsageLogs**: Histórico de uso

## 💰 Planos

1. **Starter**: Plano básico
2. **Standard**: Plano intermediário
3. **Pro**: Plano profissional
4. **Master**: Plano avançado
5. **Ultra**: Plano premium
6. **Vitalício**: Acesso permanente (via cupom especial)

Cada plano possui:
- Limite de consultas mensais
- Número máximo de monitores
- Intervalo de verificação customizável

## ⚙️ Configuração

### 1. Clone o repositório

```bash
git clone <repo-url>
cd RadarOne
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

### 3. Opção A: Docker (Recomendado)

```bash
# Build e start de todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar serviços
docker-compose down
```

Serviços disponíveis em:
- Frontend: http://localhost
- Backend API: http://localhost:3000
- PostgreSQL: localhost:5432

### 3. Opção B: Desenvolvimento local

#### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:migrate
npm run prisma:generate
npm run dev
```

#### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

#### Worker

```bash
cd worker
npm install
npm run playwright:install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## 📁 Estrutura do Projeto

```
RadarOne/
├── backend/              # API REST
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── services/
│   │   └── server.ts
│   ├── prisma/
│   │   └── schema.prisma
│   └── Dockerfile
│
├── frontend/             # Interface web
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── services/
│   │   └── App.tsx
│   └── Dockerfile
│
├── worker/               # Worker de scraping
│   ├── src/
│   │   ├── scrapers/
│   │   ├── services/
│   │   └── index.ts
│   └── Dockerfile
│
├── shared/               # Código compartilhado
│   └── types/
│
├── docker-compose.yml    # Orquestração Docker
└── README.md
```

## 🔧 Funcionalidades Implementadas

### ✅ Infraestrutura Base
- [x] Estrutura de monorepo
- [x] Schema Prisma completo
- [x] Configuração Docker
- [x] Autenticação JWT
- [x] CRUD básico de usuários

### 🚧 Em Desenvolvimento

#### Backend
- [ ] CRUD de Monitores
- [ ] Sistema de Planos e Assinaturas
- [ ] Integração completa Kiwify
- [ ] Webhook handler Kiwify
- [ ] Sistema de Cupons
- [ ] Dashboard de estatísticas
- [ ] Controle de uso/consultas

#### Frontend
- [ ] Página de Monitores
- [ ] Página de Planos
- [ ] Checkout e pagamento
- [ ] Aplicação de cupons
- [ ] Dashboard com gráficos
- [ ] Configurações de perfil
- [ ] Painel admin

#### Worker
- [ ] Scraper OLX completo
- [ ] Scraper Mercado Livre (ou API)
- [ ] Scrapers adicionais (Imóveis, Carros)
- [ ] Rate limiting robusto
- [ ] Retry com backoff exponencial
- [ ] Sistema de filas (Bull/BullMQ)
- [ ] Detecção e tratamento de captchas
- [ ] Rotação de proxies

## 🎯 Próximos Passos

1. **Implementar scrapers completos**
   - Analisar estrutura HTML de cada site
   - Criar seletores robustos
   - Testar com diferentes tipos de busca

2. **Sistema de pagamentos Kiwify**
   - Configurar webhooks
   - Testar fluxo completo de compra
   - Implementar gestão de assinaturas

3. **UI/UX do frontend**
   - Adicionar biblioteca de componentes (MUI/Chakra)
   - Implementar dark mode
   - Tornar responsivo

4. **Monitoramento e logs**
   - Adicionar Sentry para erros
   - Implementar logs estruturados (Winston/Pino)
   - Dashboard de métricas

5. **Testes**
   - Testes unitários (Jest/Vitest)
   - Testes de integração
   - Testes E2E (Playwright/Cypress)

## 🔐 Segurança

- Senhas hash com bcrypt
- Autenticação JWT
- Validação de inputs
- Rate limiting (a implementar)
- CORS configurado
- Variáveis de ambiente

## 📝 Integração Kiwify

### Webhooks suportados (a implementar):
- `order.paid` - Pagamento confirmado
- `order.refunded` - Reembolso
- `subscription.started` - Assinatura iniciada
- `subscription.cancelled` - Assinatura cancelada

### Cupons
- Desconto percentual
- Desconto fixo
- Teste grátis
- Acesso vitalício

## 🤝 Contribuição

Este é um projeto privado. Para contribuir:

1. Crie uma branch: `git checkout -b feature/nova-feature`
2. Commit suas mudanças: `git commit -m 'Add nova feature'`
3. Push para a branch: `git push origin feature/nova-feature`
4. Abra um Pull Request

## 📄 Licença

Proprietário - RadarOne © 2025

## 📞 Suporte

Para dúvidas ou suporte, entre em contato via:
- Email: suporte@radarone.com (configurar)
- Telegram: @RadarOneSupport (configurar)

---

**Status do Projeto**: 🟡 Em Desenvolvimento Ativo

Última atualização: 2025
