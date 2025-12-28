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

### 📊 Google Analytics 4 - Configuração Completa

O RadarOne utiliza **Google Analytics 4 (GA4)** para rastrear eventos importantes da aplicação. Analytics é **opcional** e pode ser habilitado em produção.

#### 🎯 Passo 1: Criar Propriedade GA4

1. Acesse [Google Analytics](https://analytics.google.com)
2. Clique em **Admin** (engrenagem no canto inferior esquerdo)
3. Clique em **Criar Propriedade**
4. Preencha os dados:
   - **Nome da propriedade:** RadarOne Produção
   - **Fuso horário:** America/Sao_Paulo
   - **Moeda:** Real brasileiro (BRL)
5. Clique em **Avançar** e configure os detalhes do negócio
6. Em **Configuração de coleta de dados**, selecione **Web**
7. Configure o fluxo de dados:
   - **URL do site:** https://seu-dominio.com
   - **Nome do fluxo:** RadarOne Web
8. **Copie o Measurement ID** (formato: `G-XXXXXXXXXX`)

#### 🔧 Passo 2: Configurar em Desenvolvimento (Local)

**Arquivo:** `.env`

```bash
# Google Analytics 4 - Measurement ID
VITE_ANALYTICS_ID=G-XXXXXXXXXX
```

**Comportamento em desenvolvimento:**
- ✅ Analytics **desabilitado por padrão** (VITE_ANALYTICS_ID vazio)
- ✅ Eventos aparecem apenas em `console.log` para debug
- ✅ Script do GA4 **não é carregado** (sem impacto em performance)

#### 🚀 Passo 3: Configurar em Produção (Render.com)

1. Acesse o **Dashboard do Render.com**
2. Selecione seu serviço de frontend
3. Vá em **Environment** → **Environment Variables**
4. Clique em **Add Environment Variable**
5. Adicione:
   - **Key:** `VITE_ANALYTICS_ID`
   - **Value:** `G-XXXXXXXXXX` (seu Measurement ID real)
6. Clique em **Save Changes**
7. **Redeploy** o serviço para aplicar as mudanças

**Importante:**
- ⚠️ Variáveis de ambiente do Vite (`VITE_*`) são incluídas no build
- ⚠️ **Sempre redeploy** após adicionar/alterar VITE_ANALYTICS_ID
- ✅ Mudanças aplicam apenas no próximo deploy

#### 📋 Checklist de Validação

Após configurar em produção, valide que analytics está funcionando:

##### ✅ 1. Verificar se Script GA4 Carregou

1. Abra a aplicação em produção
2. Abra **DevTools** (F12) → aba **Network**
3. Filtre por `googletagmanager`
4. **Deve aparecer:** `gtag/js?id=G-XXXXXXXXXX`

##### ✅ 2. Testar Eventos em Tempo Real

1. Acesse [Google Analytics](https://analytics.google.com)
2. Vá em **Relatórios** → **Tempo real**
3. Na aplicação em produção:
   - Faça login
   - Navegue entre páginas
   - Clique no menu Ajuda
   - Crie um monitor
4. **Validar:** Eventos devem aparecer em "Tempo real" (delay ~5 segundos)

**Eventos rastreados:**
- ✅ `page_view` - Navegação de páginas
- ✅ `login` - Login bem-sucedido
- ✅ `sign_up` - Registro de usuário
- ✅ `monitor_created` - Criação de monitor
- ✅ `monitor_deleted` - Exclusão de monitor
- ✅ `help_menu_interaction` - Clique no menu Ajuda
- ✅ `help_page_view` - Visualização de páginas de ajuda
- ✅ `view_plans` - Visualização de planos
- ✅ `select_plan` - Seleção de plano
- ✅ `subscription_created` - Criação de assinatura
- ✅ `trial_expired` - Trial expirado

##### ✅ 3. Validar Privacidade (LGPD Compliance)

**Verificar anonymize_ip:**
1. Abra **DevTools** → aba **Console**
2. Digite: `dataLayer`
3. **Validar:** Deve ter `anonymize_ip: true` nos eventos

**Verificar ausência de PII:**
1. Em **GA4 Tempo Real** → clique em um evento
2. **Validar:** Nenhum parâmetro deve conter:
   - ❌ Emails
   - ❌ Nomes completos
   - ❌ CPF/CNPJ
   - ❌ IDs de usuário
   - ✅ OK: IDs de plano, nomes de sites, ações genéricas

**Parâmetros seguros (exemplos):**
- `site: "MERCADO_LIVRE"` ✅
- `action: "open"` ✅
- `plan_name: "PRO"` ✅
- `email: "user@example.com"` ❌ (nunca enviado)

##### ✅ 4. Usar Google Tag Assistant (Debug)

1. Instale a extensão: [Tag Assistant](https://tagassistant.google.com/)
2. Abra a aplicação em produção
3. Clique na extensão → **Connect**
4. Navegue pela aplicação
5. **Validar:**
   - Tag GA4 está disparando ✅
   - Eventos estão sendo enviados ✅
   - Sem erros de configuração ✅

#### 🛠️ Troubleshooting

**Eventos não aparecem em Tempo Real:**
- Verificar se `VITE_ANALYTICS_ID` está configurado corretamente
- Verificar se fez redeploy após adicionar variável
- Abrir DevTools → Network e verificar se script GA4 carregou
- Esperar 5-10 segundos (delay normal do GA4)

**Script GA4 não carrega:**
- Verificar se variável `VITE_ANALYTICS_ID` tem prefixo `VITE_`
- Verificar se fez redeploy (variáveis Vite são build-time)
- Testar em aba anônima (extensões podem bloquear)

**Eventos duplicados:**
- Verificar se `initAnalytics()` é chamado apenas uma vez
- Verificar `console.log` para mensagem "Já foi inicializado"

**Dados de produção vs desenvolvimento:**
- Em desenvolvimento: apenas `console.log` (sem envio ao GA4)
- Em produção: eventos enviados ao GA4 se `VITE_ANALYTICS_ID` configurado

#### 📚 Documentação Adicional

- [Google Analytics 4 - Documentação Oficial](https://developers.google.com/analytics/devguides/collection/ga4)
- [Eventos Recomendados GA4](https://support.google.com/analytics/answer/9267735)
- [LGPD e Google Analytics](https://support.google.com/analytics/answer/9019185)

#### 🧪 Testes Unitários

Os testes unitários de `analytics.ts` cobrem:
- ✅ 51 testes
- ✅ 95.45% de cobertura de funções
- ✅ Validação de payloads sem PII
- ✅ Comportamento quando desabilitado

Rodar testes: `npm test -- src/lib/__tests__/analytics.test.ts`

### 🔍 Monitoramento Externo - UptimeRobot

O RadarOne utiliza **UptimeRobot** para monitoramento externo 24/7 da aplicação em produção. Monitora uptime, performance e disponibilidade.

#### Por que UptimeRobot?

- ✅ **Gratuito** até 50 monitores (plano free)
- ✅ **Monitoramento 24/7** com verificações a cada 5 minutos
- ✅ **Alertas instantâneos** via Email, SMS, Telegram, Slack
- ✅ **Status page público** para compartilhar com usuários
- ✅ **Histórico de uptime** e relatórios mensais
- ✅ **Integração com endpoint /health** do backend

#### 🎯 Configuração Rápida

**1. Criar conta:** [UptimeRobot](https://uptimerobot.com)

**2. Adicionar monitores:**
- **Frontend:** `https://seu-dominio.com` (HTTP/HTTPS)
- **Backend:** `https://api.seu-dominio.com/health` (HTTP/HTTPS + Keyword)
- **Status:** Verificar resposta `"status": "ok"`

**3. Configurar alertas:**
- Email do time de operações
- Telegram bot para notificações imediatas
- Slack webhook (opcional)

**4. Configurar intervalo:**
- Plano free: 5 minutos
- Plano pago: 1 minuto (recomendado para produção)

#### 📊 Monitores Recomendados

| Monitor | Tipo | URL | Keyword | Intervalo |
|---------|------|-----|---------|-----------|
| Frontend | HTTPS | https://seu-dominio.com | - | 5 min |
| Backend Health | HTTPS | https://api/health | "ok" | 5 min |
| Backend API | HTTPS | https://api/api/monitors | - | 5 min |

#### ⚠️ Playbook de Downtime

Quando UptimeRobot detectar downtime:

**1. Verificação inicial (1 min):**
- Acessar aplicação manualmente
- Verificar se erro é real ou falso positivo

**2. Se downtime confirmado:**
- Verificar logs no Render Dashboard
- Verificar status do PostgreSQL
- Verificar últimos deploys

**3. Ações imediatas:**
- Redeploy manual se necessário
- Verificar variáveis de ambiente
- Escalar para plano superior se necessário

**4. Comunicação:**
- Atualizar status page
- Notificar usuários afetados
- Documentar incidente

#### 📋 Documentação Completa

Para guia detalhado de setup e playbook operacional completo:
- [UptimeRobot Setup Guide](./docs/UPTIMEROBOT_SETUP.md)

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

