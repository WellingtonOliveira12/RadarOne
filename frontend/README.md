# RadarOne Frontend

Interface web do RadarOne - Plataforma de monitoramento de anúncios com alertas inteligentes.

## 🚀 Tecnologias

- **React 18** + **TypeScript**
- **Vite** - Build tool
- **React Router** - Roteamento
- **Axios** - Cliente HTTP
- **Context API** - Gerenciamento de estado

## 📁 Estrutura

```
frontend/
├── src/
│   ├── components/        # Componentes reutilizáveis
│   ├── pages/             # Páginas da aplicação
│   ├── context/           # Context providers
│   ├── services/          # Serviços e API
│   ├── hooks/             # Custom hooks
│   ├── types/             # TypeScript types
│   └── utils/             # Funções utilitárias
└── package.json
```

## ⚙️ Configuração

1. Instalar dependências: `npm install`
2. Configurar `.env`: `cp .env.example .env`
3. Executar: `npm run dev`

### 📊 Google Analytics (Opcional)

Para habilitar analytics em produção:

1. Crie uma propriedade GA4 em [Google Analytics](https://analytics.google.com)
2. Copie o ID de medição (formato: `G-XXXXXXXXXX`)
3. Configure no `.env`:
   ```bash
   VITE_ANALYTICS_ID=G-XXXXXXXXXX
   ```

**Eventos rastreados:**
- ✅ Navegação de páginas (automático)
- ✅ Login e registro
- ✅ Criação/edição/exclusão de monitores
- ✅ Interações com menu Ajuda
- ✅ Assinaturas e planos
- ✅ Trial expirado

**Desenvolvimento:** Analytics desabilitado por padrão (apenas console.log)

**Privacidade:** Implementado com `anonymize_ip: true` (LGPD compliance)

## 📱 Páginas

- `/login` - Login
- `/register` - Cadastro
- `/dashboard` - Dashboard (protegida)

## 🧪 Testes E2E (Playwright)

### Pré-requisitos

1. **Backend rodando** - Os testes E2E fazem requisições reais ao backend
2. **Seed E2E** - Banco de dados com dados de teste

```bash
# No backend, rodar seed E2E para criar usuários de teste
cd ../backend
npm run seed:e2e
```

### Executar Testes

```bash
# Rodar todos os testes E2E
npm run test:e2e

# Modo UI interativo (debug)
npm run test:e2e:ui

# Ver testes rodando (headed mode)
npm run test:e2e:headed

# Rodar apenas no Chromium
npm run test:e2e:chromium

# Ver relatório HTML
npm run test:e2e:report
```

### Estrutura de Testes

```
frontend/tests/e2e/
├── helpers.ts                      # Helpers compartilhados
├── authenticated-user.spec.ts      # Testes de usuário autenticado
├── login.spec.ts                   # Testes de login
├── create-monitor.spec.ts          # Testes de criação de monitores
├── subscription-flow.spec.ts       # Testes de assinatura (smoke)
├── trial-flow.spec.ts             # Testes de trial
├── admin-jobs.spec.ts             # Testes de admin
├── forgot-password.spec.ts        # Testes de recuperação de senha
└── reset-password.spec.ts         # Testes de reset de senha
```

### Usuários de Teste (E2E)

Os usuários abaixo são criados automaticamente pelo seed E2E:

| Tipo  | Email                      | Senha          | Uso                    |
|-------|----------------------------|----------------|------------------------|
| USER  | e2e-test@radarone.com      | Test123456!    | Testes gerais          |
| ADMIN | e2e-admin@radarone.com     | Admin123456!   | Testes de admin        |
| TRIAL | e2e-trial@radarone.com     | Trial123456!   | Testes de trial        |

### Configuração do Playwright

Arquivo: `playwright.config.ts`

- **baseURL**: `http://localhost:5173` (Vite dev server)
- **Navegador**: Chromium
- **Paralelização**: Habilitada em dev, 1 worker em CI
- **Retries**: 2x em CI, 0x em dev
- **Screenshots**: Apenas em falhas
- **Vídeos**: Apenas em falhas

### Estratégia de Testes

✅ **Backend REAL** - Todos os requests vão para o backend real
✅ **Login REAL** - Cada teste faz login via UI (sem mocks)
✅ **Sem storageState** - Máxima cobertura de autenticação
✅ **Seed E2E** - Dados consistentes entre execuções

### Troubleshooting

**Testes falhando com timeout:**
- Verificar se backend está rodando (`npm run dev` no backend)
- Verificar se seed E2E foi executado
- Verificar porta 5173 disponível

**Usuário não encontrado:**
```bash
# Recriar usuários de teste
cd ../backend
npm run seed:e2e
```

**Banco de dados em estado inconsistente:**
```bash
# Reset completo do banco (CUIDADO: apaga todos os dados)
cd ../backend
npx prisma migrate reset
npm run seed:e2e
```

## 🚧 TODO

- ✅ Testes E2E com Playwright
- ✅ UI com Chakra UI
- Melhorar cobertura de testes unitários
- Otimizar performance de bundle

