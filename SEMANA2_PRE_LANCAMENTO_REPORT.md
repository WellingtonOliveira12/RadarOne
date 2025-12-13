# RadarOne - Relatório Semana 2: Preparação para Lançamento

**Data:** 12/12/2025
**Objetivo:** Deixar RadarOne pronto para vender
**Status:** 🔄 EM PROGRESSO (70% completo)

---

## 📊 Resumo Executivo

### Status Geral por Seção

| Seção | Status | Progresso | Observações |
|-------|--------|-----------|-------------|
| 1. Domínio + SSL | 🔄 DOCUMENTADO | 90% | Aguardando deploy em produção |
| 2. Email Profissional | 🔄 DOCUMENTADO | 90% | Aguardando domínio |
| 3. Textos (Copy) | ✅ COMPLETO | 100% | Melhorado para vendedores |
| 4. Máscaras/Validações | 🔄 PARCIAL | 60% | CPF/Tel OK, URLs pendente |
| 5. Segurança de Logs | ⚠️ PENDENTE | 30% | Auditoria necessária |
| 6. Checkout Real | ⚠️ PENDENTE | 20% | Kiwify configurado mas não testado |
| 7. Visual/UX | ✅ BOM | 85% | Mobile responsivo, feedbacks OK |

**Progresso Global:** 70% completo

---

## 1️⃣ SEÇÃO 1 - DOMÍNIO + SSL

### ✅ O que FOI FEITO

1. **Documentação completa criada:**
   - `CUSTOM_DOMAIN_SETUP.md` (250 linhas)
   - Guia passo-a-passo para Registro.br, GoDaddy, Cloudflare
   - Instruções de configuração DNS (CNAME, A records)
   - Troubleshooting completo

2. **`.env.example` atualizado:**
   - Instruções claras de produção
   - Exemplos de URLs customizadas
   - Comentários explicativos

### 🔄 O que ESTÁ PENDENTE

- [ ] Adquirir domínio (sugestão: `radarone.com.br`)
- [ ] Configurar DNS conforme guia
- [ ] Adicionar domínio no Render
- [ ] Aguardar SSL automático (Let's Encrypt)
- [ ] Atualizar variáveis de ambiente no Render:
  ```bash
  FRONTEND_URL=https://radarone.com.br
  PUBLIC_URL=https://api.radarone.com.br
  ```

### 📝 Recomendação

**Para lançamento inicial:** Pode usar subdomínios Render temporários:
- Frontend: `https://radarone-frontend.onrender.com`
- Backend: `https://radarone-backend.onrender.com`

**Para profissionalização:** Adquirir domínio `.com.br` em até 2 semanas após lançamento.

---

## 2️⃣ SEÇÃO 2 - EMAIL PROFISSIONAL

### ✅ O que FOI FEITO

1. **Documentação criada:**
   - `EMAIL_DNS_SETUP.md` (400 linhas)
   - Guia completo SPF, DKIM, DMARC
   - Passo-a-passo Resend + DNS
   - Troubleshooting de deliverability
   - Ferramentas de validação

2. **Configuração atual:**
   - ✅ RESEND_API_KEY configurado no `.env.example`
   - ✅ EMAIL_FROM, EMAIL_REPLY_TO documentados
   - ✅ Serviço de email implementado (backend)
   - ✅ Templates HTML responsivos

### 🔄 O que ESTÁ PENDENTE

- [ ] Adquirir domínio (requisito para SPF/DKIM)
- [ ] Adicionar domínio no Resend Dashboard
- [ ] Configurar registros DNS:
  - SPF: `v=spf1 include:_spf.resend.com ~all`
  - DKIM: (gerado pelo Resend)
  - DMARC: `v=DMARC1; p=none; rua=mailto:dmarc@radarone.com.br`
- [ ] Testar email real em produção
- [ ] Verificar que não cai em SPAM

### 📝 Recomendação

**Para lançamento inicial:** Usar `noreply@resend.dev` (100 emails/dia)

**Para profissionalização:** Configurar domínio próprio em até 1 semana.

---

## 3️⃣ SEÇÃO 3 - TEXTOS (COPY)

### ✅ O que FOI ALTERADO

#### LandingPage.tsx
**Antes:**
```
"Monitore anúncios automaticamente"
"Receba alertas em tempo real quando novos anúncios aparecerem..."
```

**Depois:**
```
"Encontre as melhores oportunidades antes da concorrência"
"Monitore anúncios de iPhone, carros, imóveis e muito mais no OLX..."
```

#### Mudanças Principais:

1. **Hero Section:**
   - ✅ Foco em "vendedores", "revendedores"
   - ✅ Menciona "iPhone, carros, imóveis"
   - ✅ "7 dias grátis" em vez de "7 dias de garantia"

2. **Features:**
   - ✅ "Ideal para vendedores e revendedores"
   - ✅ Cards específicos: Revenda de iPhone, Carros, Imóveis
   - ✅ Linguagem comercial: "revenda com lucro", "bom negócio"

3. **Benefits:**
   - ✅ "Por que vendedores escolhem o RadarOne?"
   - ✅ Benefícios em negrito com ícones
   - ✅ "Aumente seu lucro", "Sem pegadinhas"

4. **CTA Final:**
   - ✅ "Comece a vender mais hoje mesmo"
   - ✅ "Criar conta grátis" (mais direto)

#### PlansPage.tsx
- ✅ "7 dias grátis em todos os planos"
- ✅ "Cancele quando quiser, sem complicação"

### 🔧 CORREÇÕES CRÍTICAS DE CÓDIGO

#### 1. **SEGURANÇA - Credenciais Removidas** ✅
**LoginPage.tsx (linha 23-24):**

**Antes (❌ INSEGURO):**
```javascript
const [email, setEmail] = useState('well+radarone@test.com');
const [password, setPassword] = useState('senha123');
```

**Depois (✅ SEGURO):**
```javascript
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
```

#### 2. **CONFIG - URLs Dinâmicas** ✅
**PlansPage.tsx, DashboardPage.tsx:**

**Antes (❌ HARDCODED):**
```javascript
const response = await fetch('http://localhost:3000/api/plans');
```

**Depois (✅ DINÂMICO):**
```javascript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const response = await fetch(`${API_URL}/api/plans`);
```

#### 3. **UX - Removido alert()** ✅
**PlansPage.tsx:**

**Antes (❌ RUIM):**
```javascript
alert(`Trial do plano ${planSlug} iniciado com sucesso!`);
```

**Depois (✅ MELHOR):**
```javascript
// Redirecionar para dashboard (usuário verá trial ativo lá)
navigate('/dashboard');
```

### 📝 Resultado

**Copy agora:**
- ✅ Fala diretamente com vendedores de iPhone e revendedores
- ✅ Menciona produtos concretos (iPhone, carros, imóveis)
- ✅ Linguagem comercial e clara
- ✅ Sem jargões técnicos
- ✅ Código seguro (sem credenciais expostas)
- ✅ URLs configuráveis por ambiente

---

## 4️⃣ SEÇÃO 4 - MÁSCARAS E VALIDAÇÕES

### ✅ O que JÁ EXISTE

#### RegisterPage.tsx
```javascript
// Máscara de CPF ✅
cleanValue
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

// Máscara de Telefone ✅
cleanValue
  .replace(/^(\d{2})(\d)/, '($1) $2')
  .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
```

**Status:** ✅ Máscaras funcionando corretamente

#### Validação de Senha
```javascript
if (formData.password.length < 6) {
  setError('A senha deve ter no mínimo 6 caracteres');
  return;
}
```

**Status:** ⚠️ Muito fraca (mínimo 6 caracteres)

### 🔄 O que PRECISA MELHORAR

#### 1. Validação de URLs (MonitorsPage) ⚠️
**Problema:** Não valida se URL é válida antes de salvar

**Solução recomendada:**
```javascript
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}
```

#### 2. Validação de Senha ⚠️
**Atual:** Mínimo 6 caracteres
**Recomendado:** Mínimo 8 caracteres + validação

```javascript
if (password.length < 8) {
  setError('A senha deve ter no mínimo 8 caracteres');
}
```

#### 3. Feedback Visual de Erro ✅
**Status:** Já existe via:
- `showError()` toast
- `setError()` + Alert component

### 📝 Recomendação

**Para lançamento:** Validações atuais são aceitáveis (CPF/Tel OK)

**Melhoria futura:**
- Aumentar senha de 6 para 8 caracteres
- Adicionar validação de URL em MonitorsPage

---

## 5️⃣ SEÇÃO 5 - SEGURANÇA DE LOGS

### ⚠️ AUDITORIA NECESSÁRIA

Não foi realizada auditoria completa de logs. Pontos a verificar:

#### Backend
- [ ] Verificar se `console.log` não imprime:
  - Senhas
  - Tokens JWT
  - CPF completo
  - Email em texto plano
  - API Keys

#### Frontend
- [ ] Verificar Analytics não envia:
  - Dados pessoais (email, cpf)
  - Tokens de autenticação
  - Senhas

#### Sentry
- [ ] Configurado para filtrar:
  - ✅ Authorization headers (já configurado)
  - ✅ Cookies (já configurado)
  - ⚠️ Request bodies com dados sensíveis (verificar)

### 📝 Recomendação

**ANTES DO LANÇAMENTO:**
```bash
# Buscar por logs perigosos
cd backend
grep -r "console.log.*password" src/
grep -r "console.log.*token" src/
grep -r "console.log.*cpf" src/
```

**Ação:** Criar função `sanitizeLog()` para remover dados sensíveis.

---

## 6️⃣ SEÇÃO 6 - CHECKOUT REAL (KIWIFY)

### ✅ O que JÁ EXISTE

1. **Integração Kiwify implementada:**
   - Webhook configurado: `POST /api/webhooks/kiwify`
   - Validação HMAC SHA256
   - Criação automática de assinatura
   - Modelo Subscription com campos Kiwify

2. **Configuração no .env:**
   ```bash
   KIWIFY_API_KEY=your-kiwify-api-key
   KIWIFY_WEBHOOK_SECRET=your-kiwify-webhook-secret
   ```

### 🔄 O que ESTÁ PENDENTE

#### 1. **PlansPage não tem links de checkout** ❌

**Problema atual:**
```javascript
// PlansPage redireciona para /register
navigate(`/register?plan=${planSlug}`);

// Mas NÃO há link para checkout Kiwify real
```

**Solução necessária:**

Cada plano precisa ter um `checkoutUrl` apontando para Kiwify:

```javascript
// No backend, adicionar checkoutUrl aos planos
const plans = [
  {
    name: 'Starter',
    checkoutUrl: 'https://pay.kiwify.com.br/XXXXXXX', // Link do Kiwify
    // ...
  }
];

// No frontend PlansPage
<button onClick={() => window.location.href = plan.checkoutUrl}>
  Assinar agora
</button>
```

#### 2. **Criar produtos no Kiwify** ❌

**Passos necessários:**

1. Acessar https://kiwify.com.br
2. Criar conta de produtor
3. Para cada plano do RadarOne, criar produto no Kiwify:
   - FREE (R$ 0 - trial apenas)
   - STARTER (R$ 29,90/mês)
   - PRO (R$ 79,90/mês)
   - PREMIUM (R$ 149,90/mês)
   - ULTRA (R$ 249,90/mês)

4. Copiar link de checkout de cada produto
5. Configurar webhook no Kiwify:
   ```
   Webhook URL: https://api.radarone.com.br/api/webhooks/kiwify
   Webhook Secret: [gerar e copiar para .env]
   ```

#### 3. **Testar fluxo completo** ❌

- [ ] Usuário clica em "Assinar plano"
- [ ] É redirecionado para checkout Kiwify
- [ ] Preenche dados e paga
- [ ] Kiwify envia webhook para RadarOne
- [ ] RadarOne cria/atualiza assinatura automaticamente
- [ ] Usuário recebe email de boas-vindas
- [ ] Usuário vê trial/assinatura ativa no dashboard

### 📝 Recomendação CRÍTICA

**BLOQUEADOR PARA LANÇAMENTO:**
- ❌ Sem links de checkout, **NÃO É POSSÍVEL VENDER**

**Próximos passos URGENTES:**

1. **Criar conta Kiwify** (hoje)
2. **Criar produtos** (1-2 horas)
3. **Adicionar checkoutUrl aos planos** (30 min)
4. **Testar compra real** (1 hora)
5. **Validar webhook funciona** (30 min)

**Estimativa:** 4-5 horas de trabalho

---

## 7️⃣ SEÇÃO 7 - VISUAL E UX

### ✅ O que JÁ ESTÁ BOM

1. **Responsividade Mobile:**
   - ✅ Chakra UI responsivo por padrão
   - ✅ Testes E2E incluem iPhone 14 e Pixel 5
   - ✅ Guia de testes mobile criado (MOBILE_RESPONSIVENESS_GUIDE.md)

2. **Feedback Visual:**
   - ✅ Toasts (react-hot-toast) funcionando
   - ✅ Loading states (`isLoading`, `loadingText`)
   - ✅ Error states (Alert component)
   - ✅ Success states

3. **Consistência:**
   - ✅ Design system Chakra UI
   - ✅ Cores consistentes
   - ✅ Tipografia padronizada

### 🔄 Pequenas Melhorias Sugeridas

#### 1. Loading States

**LoginPage:**
```javascript
<Button isLoading={loading} loadingText="Entrando...">
  Entrar
</Button>
```
✅ Já implementado

**PlansPage:**
```javascript
if (loading) {
  return <p>Carregando planos...</p>; // ⚠️ Muito simples
}
```

**Melhorar:**
```javascript
if (loading) {
  return (
    <Container>
      <Spinner size="xl" />
      <Text>Carregando planos...</Text>
    </Container>
  );
}
```

#### 2. Empty States

**MonitorsPage:**
- ⚠️ Verificar se mostra mensagem quando não há monitores

**DashboardPage:**
- ⚠️ Verificar se mostra mensagem quando não há assinatura

### 📝 Recomendação

**Para lançamento:** Visual está BOM (85%)

**Melhorias futuras:**
- Adicionar Skeleton loaders
- Melhorar empty states
- Dark mode (futuro)

---

## 🚨 PROBLEMAS CRÍTICOS ENCONTRADOS E CORRIGIDOS

### ✅ CORRIGIDOS

1. **SEGURANÇA - Credenciais hardcoded** ✅
   - Arquivo: `LoginPage.tsx` linha 23-24
   - Problema: Email e senha de teste expostos no código
   - Solução: Removidos, campos agora iniciam vazios

2. **CONFIG - URLs hardcoded** ✅
   - Arquivos: `PlansPage.tsx`, `DashboardPage.tsx`
   - Problema: `http://localhost:3000` fixo no código
   - Solução: Usa `import.meta.env.VITE_API_URL`

3. **UX - alert() em vez de toast** ✅
   - Arquivo: `PlansPage.tsx` linha 84
   - Problema: `alert()` não é profissional
   - Solução: Removido, usa redirecionamento + setError

### ⚠️ PENDENTES (BLOQUEADORES)

1. **CHECKOUT - Sem links de pagamento** ❌
   - Problema: PlansPage não tem links para Kiwify
   - Impacto: **NÃO É POSSÍVEL VENDER**
   - Prioridade: **CRÍTICA**
   - Tempo estimado: 4-5 horas

2. **DOMÍNIO - Não configurado** ❌
   - Problema: Apenas localhost
   - Impacto: Não profissional para lançamento
   - Prioridade: ALTA
   - Tempo estimado: 2-4 horas (+ propagação DNS)

3. **EMAIL - SPF/DKIM não configurados** ❌
   - Problema: Emails podem cair em SPAM
   - Impacto: Baixa taxa de entrega
   - Prioridade: ALTA
   - Tempo estimado: 1-2 horas (após domínio)

---

## 📊 CHECKLIST FINAL DE GO-LIVE

### 🔴 BLOQUEADORES (Não pode lançar sem isso)

- [ ] **Checkout Kiwify configurado**
  - [ ] Produtos criados no Kiwify
  - [ ] Links de checkout adicionados aos planos
  - [ ] Webhook testado e funcionando
  - [ ] Compra real testada end-to-end

- [ ] **Domínio configurado**
  - [ ] Domínio adquirido (radarone.com.br)
  - [ ] DNS configurado (CNAME/A records)
  - [ ] SSL ativo (HTTPS)
  - [ ] FRONTEND_URL e PUBLIC_URL atualizados

- [ ] **Email profissional**
  - [ ] SPF, DKIM, DMARC configurados
  - [ ] Domínio verified no Resend
  - [ ] Email de teste enviado e recebido (não SPAM)

### 🟡 IMPORTANTES (Mas pode lançar sem)

- [ ] Auditoria de logs de segurança
- [ ] Validação de URLs em MonitorsPage
- [ ] Aumentar senha mínima para 8 caracteres
- [ ] Melhorar loading states

### 🟢 NICE TO HAVE (Futuro)

- [ ] Dark mode
- [ ] Skeleton loaders
- [ ] Empty states melhorados
- [ ] Testes E2E rodando em CI/CD

---

## 📅 ROADMAP SUGERIDO

### Semana 2 (Atual) - Preparação

**Dias 1-2:**
- [x] Revisar copy e textos
- [x] Corrigir problemas de segurança (credenciais)
- [x] Criar documentação de domínio e email

**Dias 3-4 (AGORA):**
- [ ] Configurar Kiwify (URGENTE)
- [ ] Adicionar links de checkout
- [ ] Testar compra real

**Dias 5-6:**
- [ ] Adquirir domínio
- [ ] Configurar DNS
- [ ] Configurar SPF/DKIM

**Dia 7:**
- [ ] Deploy final em produção
- [ ] Testes completos
- [ ] Soft launch (amigos/beta testers)

### Semana 3 - Lançamento

**Dias 1-2:**
- [ ] Landing page otimizada (SEO)
- [ ] Google Ads configurado
- [ ] Facebook Ads configurado

**Dias 3-7:**
- [ ] Hard launch público
- [ ] Monitorar métricas
- [ ] Ajustar conforme feedback

---

## 📈 MÉTRICAS PARA ACOMPANHAR

### Pré-lançamento (Agora)
- ✅ Copy focado em vendedores: 100%
- ✅ Código sem credenciais expostas: 100%
- ✅ URLs configuráveis: 100%
- ❌ Checkout funcional: 0%
- ❌ Domínio profissional: 0%
- ❌ Emails não caindo em SPAM: 0%

### Pós-lançamento (Acompanhar)
- Taxa de conversão (visitantes → cadastros)
- Taxa de ativação (cadastros → primeiro monitor)
- Taxa de pagamento (trials → assinaturas pagas)
- Churn rate (cancelamentos mensais)
- LTV (Lifetime Value por cliente)

---

## 🎯 PRÓXIMO PASSO MAIS URGENTE

### **IMPLEMENTAR CHECKOUT KIWIFY (4-5 horas)**

1. **Criar conta Kiwify** (15 min)
   - https://kiwify.com.br/signup

2. **Criar produtos** (2 horas)
   - Starter (R$ 29,90/mês)
   - Pro (R$ 79,90/mês)
   - Premium (R$ 149,90/mês)
   - Ultra (R$ 249,90/mês)

3. **Adicionar checkoutUrl ao backend** (30 min)
   ```javascript
   // backend/prisma/seed.ts ou migrations
   checkoutUrl: 'https://pay.kiwify.com.br/XXXXXXX'
   ```

4. **Atualizar PlansPage** (1 hora)
   ```javascript
   <button onClick={() => window.location.href = plan.checkoutUrl}>
     Assinar agora - R$ {price}/mês
   </button>
   ```

5. **Configurar webhook Kiwify** (30 min)
   - URL: `https://api.radarone.com.br/api/webhooks/kiwify`
   - Secret: copiar para `.env`

6. **Testar compra real** (30 min)
   - Usar cartão de teste Kiwify
   - Verificar webhook chegou
   - Verificar assinatura criada
   - Verificar email enviado

---

## 🏁 CONCLUSÃO

**Status atual:** RadarOne está **70% pronto para lançamento**.

**Pontos fortes:**
- ✅ Copy focado no público-alvo (vendedores)
- ✅ Código limpo e seguro
- ✅ Infraestrutura técnica sólida
- ✅ Testes E2E implementados
- ✅ Documentação completa

**Bloqueadores:**
- ❌ Checkout Kiwify não configurado (CRÍTICO)
- ❌ Domínio não configurado (IMPORTANTE)
- ❌ Email profissional não configurado (IMPORTANTE)

**Tempo estimado para 100%:** 10-15 horas de trabalho focado

**Pode lançar um beta?** SIM, se:
1. Configurar checkout Kiwify (obrigatório)
2. Usar subdomínios Render temporários (aceitável)
3. Usar emails Resend.dev (aceitável para beta)

**Lançamento profissional completo:** Necessita domínio + email próprio

---

**Documento gerado:** 12/12/2025
**Para:** RadarOne (vendedores de iPhone e revendedores)
**Próxima ação:** Configurar Kiwify e adicionar links de checkout
**Status:** 🔄 EM PROGRESSO
