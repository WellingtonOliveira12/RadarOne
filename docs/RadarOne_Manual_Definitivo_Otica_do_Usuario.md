# RadarOne: Manual Definitivo (Ótica do Usuário)

**Versão do Documento:** 1.0
**Data:** 24 de Janeiro de 2026
**Versão do Sistema:** 1.1.0
**Status:** Em Produção

---

## Sumário

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Guia Rápido - Primeiros 10 Minutos](#2-guia-rápido---primeiros-10-minutos)
3. [Fluxos do Usuário](#3-fluxos-do-usuário)
   - 3.1 [Criar Conta / Login / Logout](#31-criar-conta--login--logout)
   - 3.2 [Autenticação de Dois Fatores (2FA)](#32-autenticação-de-dois-fatores-2fa)
   - 3.3 [Dashboard](#33-dashboard)
   - 3.4 [Monitores](#34-monitores)
   - 3.5 [Alertas e Notificações](#35-alertas-e-notificações)
   - 3.6 [Conexões](#36-conexões)
   - 3.7 [Planos e Assinaturas](#37-planos-e-assinaturas)
4. [Painel Administrativo](#4-painel-administrativo)
5. [Arquitetura Explicada](#5-arquitetura-explicada)
6. [Jobs e Processamento em Segundo Plano](#6-jobs-e-processamento-em-segundo-plano)
7. [Segurança e Confiabilidade](#7-segurança-e-confiabilidade)
8. [Integrações Externas](#8-integrações-externas)
9. [Problemas Comuns e Troubleshooting](#9-problemas-comuns-e-troubleshooting)
10. [FAQ](#10-faq)
11. [Glossário](#11-glossário)
12. [Apêndice Técnico](#12-apêndice-técnico)

---

## 1. Visão Geral do Produto

### O que é o RadarOne?

O **RadarOne** é uma plataforma SaaS (Software as a Service) de monitoramento automatizado de anúncios em marketplaces e sites de classificados. O sistema verifica periodicamente diversas plataformas em busca de novos anúncios que correspondam aos critérios definidos pelo usuário, enviando alertas instantâneos via Telegram ou e-mail quando encontra resultados relevantes.

### Para quem é (Persona)

O RadarOne é ideal para:

- **Compradores de veículos** que buscam carros, motos ou caminhões em bom preço
- **Investidores imobiliários** que monitoram imóveis em leilão ou classificados
- **Revendedores** que precisam estar atentos a oportunidades de compra
- **Colecionadores** que buscam itens específicos em marketplaces
- **Pequenos empresários** que querem monitorar concorrência ou estoque de fornecedores

### Principais Dores que Resolve

| Dor | Solução RadarOne |
|-----|------------------|
| Passar horas procurando anúncios manualmente | Monitoramento automático 24/7 |
| Perder oportunidades por não ver a tempo | Alertas instantâneos via Telegram/Email |
| Dificuldade em acompanhar múltiplas plataformas | 8+ sites suportados em um só lugar |
| Filtrar manualmente anúncios fora do orçamento | Filtros de preço integrados |
| Não saber quando surgem novos anúncios | Verificação a cada 5-60 minutos (conforme plano) |

### Sites Suportados

| Site | Categoria | Status |
|------|-----------|--------|
| **Mercado Livre** | Geral/Veículos/Imóveis | ✅ Completo |
| **OLX** | Geral/Veículos/Imóveis | ✅ Completo |
| **Webmotors** | Veículos | ✅ Completo |
| **iCarros** | Veículos | ✅ Completo |
| **Zap Imóveis** | Imóveis | ✅ Completo |
| **Viva Real** | Imóveis | ✅ Completo |
| **ImovelWeb** | Imóveis | ✅ Completo |
| **Leilões** | Diversos (Superbid, VIP, etc.) | ✅ Completo |

---

## 2. Guia Rápido - Primeiros 10 Minutos

### Checklist de Início

```
[ ] 1. Criar conta em https://radarone.com.br/register
[ ] 2. Verificar email de boas-vindas
[ ] 3. Fazer login
[ ] 4. Conectar Telegram (recomendado)
[ ] 5. Criar seu primeiro monitor
[ ] 6. Aguardar alertas!
```

### Passo 1: Criar Conta (2 minutos)

1. Acesse **https://radarone.com.br/register**
2. Preencha:
   - Nome completo
   - Email (será usado para login e notificações)
   - Senha (mínimo 6 caracteres)
   - CPF (opcional, para validação)
3. Clique em **"Criar conta"**
4. Você receberá automaticamente um **trial de 7 dias** com acesso completo

### Passo 2: Conectar Telegram (3 minutos)

1. Vá em **Configurações → Notificações** ou acesse `/settings/notifications`
2. Clique em **"Vincular Telegram"**
3. Um código será gerado (ex: `RADAR-A1B2C3`)
4. Abra o Telegram e procure por **@RadarOneAlertaBot**
5. Envie `/start` para o bot
6. Cole o código gerado
7. Pronto! Você receberá uma confirmação: "✅ Conta vinculada com sucesso!"

### Passo 3: Criar Primeiro Monitor (5 minutos)

1. Vá em **Monitores** ou acesse `/monitors`
2. Clique em **"Criar Monitor"**
3. Preencha:
   - **Nome:** Ex: "Carros até 50k"
   - **Site:** Escolha (Mercado Livre, OLX, etc.)
   - **URL de Busca:** Cole a URL de uma busca no site escolhido
   - **Preço Mínimo:** (opcional) Ex: 20000
   - **Preço Máximo:** (opcional) Ex: 50000
4. Clique em **"Salvar"**
5. O monitor começará a verificar automaticamente

### Exemplo de URL de Busca

```
# Mercado Livre (veículos até 50 mil)
https://veiculos.mercadolivre.com.br/carros/ate-50000-reais/

# OLX (apartamentos em São Paulo)
https://sp.olx.com.br/sao-paulo-e-regiao/imoveis/venda/apartamentos

# Webmotors (Honda Civic)
https://www.webmotors.com.br/carros/estoque?marca1=HONDA&modelo1=CIVIC
```

---

## 3. Fluxos do Usuário

### 3.1 Criar Conta / Login / Logout

#### Criação de Conta

**Tela:** `/register`

| Campo | Obrigatório | Validação |
|-------|-------------|-----------|
| Nome | Sim | Mínimo 2 caracteres |
| Email | Sim | Formato válido, único no sistema |
| Senha | Sim | Mínimo 6 caracteres |
| CPF | Não | Validado se preenchido |

**Regras:**
- Email é case-insensitive (TESTE@email.com = teste@email.com)
- CPF é criptografado e usado para evitar duplicatas
- Ao criar conta, um trial de 7 dias é ativado automaticamente
- Email de boas-vindas é enviado (se serviço configurado)

**Possíveis Erros:**
| Erro | Causa | Solução |
|------|-------|---------|
| "Email já cadastrado" | Email já existe | Use outro email ou recupere senha |
| "CPF já cadastrado" | CPF vinculado a outra conta | Entre em contato com suporte |
| "Erro ao criar conta" | Erro interno | Tente novamente em alguns minutos |

#### Login

**Tela:** `/login`

**Fluxo Normal:**
```
1. Digita email + senha
2. Clica "Entrar"
3. Se 2FA habilitado → Tela de verificação 2FA
4. Se 2FA desabilitado → Dashboard
```

**Comportamento de Retry:**
- Se o servidor estiver em "cold start" (Render free tier), a requisição pode demorar até 30 segundos
- O sistema faz até 3 tentativas automáticas com backoff (1.5s, 3s, 6s)
- Mensagem: "Servidor iniciando, aguarde..."

**Possíveis Erros:**
| Erro | Causa | Solução |
|------|-------|---------|
| "Credenciais inválidas" | Email ou senha incorretos | Verifique os dados |
| "Conta bloqueada" | Administrador bloqueou | Entre em contato |
| "Servidor não respondeu" | Backend offline/cold start | Aguarde e tente novamente |

#### Logout

**Ações:**
- Clique no ícone de usuário → "Sair"
- Ou acesso direto a `/logout`

**O que acontece:**
1. Token JWT é removido do navegador
2. Sessão é invalidada
3. Usuário é redirecionado para `/login`

**Logout Automático:**
- Após 30 minutos de inatividade
- Se token JWT expirar (7 dias)
- Se administrador bloquear a conta

---

### 3.2 Autenticação de Dois Fatores (2FA)

O 2FA adiciona uma camada extra de segurança usando aplicativos como Google Authenticator ou Authy.

#### Ativar 2FA

**Tela:** `/settings/security` ou Menu → Segurança

**Passo a passo:**
1. Clique em **"Ativar 2FA"**
2. Um QR Code será exibido
3. Escaneie com seu app autenticador (Google Authenticator, Authy, etc.)
4. Digite o código de 6 dígitos mostrado no app
5. Clique em **"Confirmar"**
6. **IMPORTANTE:** Salve os códigos de backup exibidos!

**Códigos de Backup:**
- 10 códigos de uso único
- Use se perder acesso ao app autenticador
- Cada código pode ser usado apenas UMA vez
- Guarde em local seguro (offline)

#### Fazer Login com 2FA

```
1. Digite email + senha normalmente
2. Tela de verificação aparece
3. Abra seu app autenticador
4. Digite o código de 6 dígitos
5. OU use um código de backup se não tiver o app
6. Clique "Verificar"
```

#### Desativar 2FA

1. Vá em **Configurações → Segurança**
2. Clique em **"Desativar 2FA"**
3. Confirme com sua senha atual
4. 2FA é removido

**Nota:** Desativar 2FA NÃO faz logout. Você continua logado.

#### Recuperar Acesso sem 2FA

Se perdeu acesso ao app E aos códigos de backup:
1. Entre em contato com suporte
2. Será necessário verificação de identidade
3. Admin pode desativar 2FA manualmente

---

### 3.3 Dashboard

**Tela:** `/dashboard`

O Dashboard é a página principal após login, mostrando um resumo do seu uso.

#### Informações Exibidas

| Seção | Descrição |
|-------|-----------|
| **Status da Assinatura** | Trial/Ativo/Expirado + dias restantes |
| **Monitores Ativos** | Quantos monitores você tem / limite do plano |
| **Consultas Usadas** | Quantas verificações foram feitas este mês |
| **Últimos Alertas** | Anúncios recentes encontrados |

#### Estados de Assinatura

| Status | Badge | Significado |
|--------|-------|-------------|
| TRIAL | 🎁 Período de teste | 7 dias grátis, funcionalidade completa |
| ACTIVE | ✅ Ativo | Assinatura paga válida |
| EXPIRED | ❌ Expirado | Trial ou assinatura venceu |
| CANCELLED | ⚠️ Cancelado | Usuário cancelou assinatura |

#### Alertas no Dashboard

- **Trial expirando (≤5 dias):** Banner amarelo com "Seu trial expira em X dias"
- **Trial expirado:** Banner vermelho com botão "Ver Planos"
- **Assinatura expirando:** Aviso para renovar

---

### 3.4 Monitores

**Tela:** `/monitors`

Monitores são as "buscas salvas" que o sistema verifica automaticamente.

#### Criar Monitor

1. Clique em **"+ Novo Monitor"**
2. Preencha o formulário:

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| Nome | Sim | Nome para identificar (ex: "Civic 2020+") |
| Site | Sim | Escolha da lista de sites suportados |
| URL de Busca | Sim | URL completa de uma busca no site |
| Preço Mínimo | Não | Ignora anúncios abaixo deste valor |
| Preço Máximo | Não | Ignora anúncios acima deste valor |

3. Clique em **"Salvar"**

**Dica:** A URL de busca deve ser uma página de resultados do site, não a homepage.

#### Exemplo: Criar Monitor Mercado Livre

```
Nome: "Gol G5 até 35k"
Site: Mercado Livre
URL: https://carros.mercadolivre.com.br/volkswagen/gol/gol-g5/_PriceRange_20000-35000
Preço Mínimo: 20000
Preço Máximo: 35000
```

#### Editar Monitor

1. Na lista de monitores, clique no ícone de edição (lápis)
2. Altere os campos desejados
3. Clique em **"Salvar"**

#### Excluir Monitor

1. Clique no ícone de lixeira
2. Confirme a exclusão

**Atenção:** Ao excluir um monitor, todo o histórico de anúncios vistos é perdido.

#### Ativar/Desativar Monitor

- Toggle no card do monitor
- Monitores desativados não consomem consultas
- Útil para pausar temporariamente sem excluir

#### Limites por Plano

| Plano | Máx. Monitores | Intervalo de Verificação |
|-------|----------------|-------------------------|
| FREE/Trial | 2 | 60 min |
| Starter | 5 | 30 min |
| Pro | 10 | 15 min |
| Premium | 20 | 10 min |
| Ultra | Ilimitado | 5 min |

---

### 3.5 Alertas e Notificações

#### Como um Alerta é Gerado

```
1. Worker verifica monitor a cada X minutos (conforme plano)
2. Scraper busca anúncios na URL configurada
3. Compara com anúncios já vistos
4. Se encontrar NOVO anúncio:
   a. Salva no banco de dados
   b. Verifica filtros de preço
   c. Se passar filtros → Envia alerta
```

#### Canais de Notificação

| Canal | Configuração | Quando Usar |
|-------|-------------|-------------|
| **Telegram** | Opcional (recomendado) | Alertas instantâneos no celular |
| **Email** | Automático | Backup se Telegram falhar |

#### Configurar Notificações

**Tela:** `/settings/notifications`

1. **Email:** Sempre ativo (não pode desabilitar)
2. **Telegram:**
   - Clique em "Vincular Telegram"
   - Siga o fluxo com código
   - Após vincular, toggle para ativar/desativar

#### Formato do Alerta Telegram

```
🚨 Novo anúncio detectado!

📌 Monitor: Gol G5 até 35k

Volkswagen Gol 1.0 2018

💰 R$ 32.500,00
📍 São Paulo - SP

🔗 Ver anúncio
```

#### Histórico de Notificações

**Tela:** `/notifications`

Lista todas as notificações enviadas:
- Canal (Email/Telegram)
- Status (Sucesso/Falha)
- Data/hora
- Conteúdo resumido

---

### 3.6 Conexões

**Tela:** `/settings/connections`

Para alguns sites (como Mercado Livre), é necessário fornecer credenciais de sessão para acessar conteúdo restrito.

#### O que é "Conexão"?

Uma conexão é o estado de login salvo de um site. Permite que o RadarOne acesse o site como se fosse você, vendo anúncios que requerem autenticação.

#### Sites que Requerem Conexão

- **Mercado Livre:** Para buscas autenticadas
- **Leilões (Superbid, etc.):** Para ver detalhes de lotes

#### Como Conectar Mercado Livre

1. Vá em **Conexões** (`/settings/connections`)
2. Clique em **"Conectar Mercado Livre"**
3. Siga as instruções para exportar sua sessão:
   - Faça login no Mercado Livre no navegador
   - Use extensão ou método indicado para exportar cookies
   - Faça upload do arquivo JSON
4. Sistema valida e criptografa a sessão

**Validade:** 30 dias (você será notificado quando estiver expirando)

#### Estados da Conexão

| Estado | Ícone | Significado |
|--------|-------|-------------|
| Conectado | 🟢 | Sessão válida e funcionando |
| Expirando | 🟡 | Sessão expira em ≤3 dias |
| Expirado | 🔴 | Precisa reconectar |
| Reautenticação | ⚠️ | Site pediu novo login |

#### Desconectar

1. Clique em "Desconectar" no card do site
2. Confirme a ação
3. Monitores deste site serão pulados (não farão scraping)

---

### 3.7 Planos e Assinaturas

**Tela:** `/plans`

#### Planos Disponíveis

| Plano | Preço/mês | Monitores | Intervalo | Recursos |
|-------|-----------|-----------|-----------|----------|
| **FREE/Trial** | Grátis (7 dias) | 2 | 60 min | Básico |
| **Starter** | R$ 29,90 | 5 | 30 min | Email + Telegram |
| **Pro** | R$ 49,90 | 10 | 15 min | Todos os recursos |
| **Premium** | R$ 79,90 | 20 | 10 min | Prioridade |
| **Ultra** | R$ 149,90 | Ilimitado | 5 min | Máximo |
| **Vitalício** | Único | Ilimitado | 5 min | Acesso permanente |

#### Como Assinar

1. Vá em **Planos** (`/plans`)
2. Escolha o plano desejado
3. Clique em **"Assinar"**
4. Você será redirecionado para o checkout (Kiwify)
5. Complete o pagamento
6. Assinatura ativada automaticamente via webhook

#### Aplicar Cupom

1. Na página de planos, há um campo "Cupom de desconto"
2. Digite o código (ex: `DESCONTO20`)
3. Clique em "Aplicar"
4. Se válido, desconto aparece no resumo
5. Continue para checkout

#### Tipos de Cupom

| Tipo | Efeito |
|------|--------|
| **Desconto %** | Ex: 20% off no valor |
| **Desconto Fixo** | Ex: R$ 10 off |
| **Trial Upgrade** | Libera plano premium por X dias grátis |
| **Vitalício** | Acesso permanente (cupom especial) |

#### Cancelar Assinatura

1. Vá em **Configurações → Assinatura** (`/settings/subscription`)
2. Clique em **"Cancelar Assinatura"**
3. Confirme a ação
4. Você mantém acesso até o fim do período pago

---

## 4. Painel Administrativo

**Acesso:** `/admin` (requer role ADMIN)

### Visão Geral

O painel admin permite gerenciar todo o sistema:

| Seção | Rota | Função |
|-------|------|--------|
| **Dashboard** | `/admin/stats` | Métricas e estatísticas |
| **Usuários** | `/admin/users` | Gerenciar contas |
| **Assinaturas** | `/admin/subscriptions` | Gerenciar planos |
| **Monitores** | `/admin/monitors` | Ver todos os monitores |
| **Jobs** | `/admin/jobs` | Histórico de jobs |
| **Audit Logs** | `/admin/audit-logs` | Registro de ações admin |
| **Cupons** | `/admin/coupons` | Criar/gerenciar cupons |
| **Alertas** | `/admin/alerts` | Alertas do sistema |
| **Configurações** | `/admin/settings` | Configurações globais |
| **Segurança** | `/admin/security` | 2FA para admins |

### Roles de Admin

| Role | Permissões |
|------|------------|
| **ADMIN_SUPER** | Acesso total |
| **ADMIN_SUPPORT** | Visualização + ações básicas |
| **ADMIN_FINANCE** | Assinaturas + cupons |
| **ADMIN_READ** | Apenas leitura |

### Gestão de Usuários

**Tela:** `/admin/users`

**Ações disponíveis:**
- Visualizar detalhes do usuário
- Bloquear/Desbloquear conta
- Ver assinatura ativa
- Exportar lista (CSV)

**Bloquear usuário:**
1. Encontre o usuário na lista
2. Clique em "Bloquear"
3. Confirme com sua senha
4. Usuário não conseguirá mais fazer login

### Gestão de Cupons

**Tela:** `/admin/coupons`

**Criar cupom:**
1. Clique em "Novo Cupom"
2. Preencha:
   - Código (único, sem espaços)
   - Tipo: Desconto % ou Fixo ou Trial Upgrade
   - Valor: Porcentagem ou centavos
   - Máximo de usos (opcional)
   - Data de expiração (opcional)
   - Plano específico (opcional)
3. Salvar

**Analytics de cupons:**
- Cupons mais validados
- Taxa de conversão (validado → usado)
- Cupons abandonados

### Jobs (Tarefas Agendadas)

**Tela:** `/admin/jobs`

Visualize o histórico de execução dos jobs:

| Job | Última Execução | Status | Processados |
|-----|-----------------|--------|-------------|
| checkTrialExpiring | 2026-01-24 09:00 | SUCCESS | 15 |
| resetMonthlyQueries | 2026-01-01 03:00 | SUCCESS | 234 |
| ... | ... | ... | ... |

### Audit Logs

**Tela:** `/admin/audit-logs`

Registro de todas as ações administrativas:
- Quem fez (admin email)
- O que fez (ação)
- Quando (timestamp)
- Dados antes/depois

---

## 5. Arquitetura Explicada

### Diagrama de Alto Nível

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   NAVEGADOR     │────▶│   FRONTEND      │────▶│    BACKEND      │
│   (Usuário)     │     │   (React)       │     │    (Node.js)    │
│                 │     │   radarone.     │     │    api.radarone │
│                 │     │   com.br        │     │    .com.br      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┴────────────────────────────────┐
                        │                                                                 │
                        ▼                                                                 ▼
          ┌─────────────────────────┐                               ┌─────────────────────────┐
          │                         │                               │                         │
          │      WORKER             │                               │     POSTGRESQL          │
          │      (Playwright)       │◀─────────────────────────────▶│     (Neon)              │
          │      Scraping           │                               │     Banco de Dados      │
          │                         │                               │                         │
          └───────────┬─────────────┘                               └─────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│   TELEGRAM    │           │    RESEND     │
│   Bot API     │           │    (Email)    │
│   Notifica    │           │   Notifica    │
└───────────────┘           └───────────────┘
```

### Componentes

| Componente | Tecnologia | Função |
|------------|------------|--------|
| **Frontend** | React + Vite | Interface do usuário |
| **Backend** | Node.js + Express | API REST |
| **Worker** | Node.js + Playwright | Scraping de sites |
| **Banco** | PostgreSQL (Neon) | Persistência de dados |
| **Cache/Fila** | Redis (opcional) | Fila de jobs distribuída |

### Fluxo de uma Requisição

```
1. Usuário acessa radarone.com.br
2. Frontend carrega (hospedado no Render)
3. Frontend faz requisição à API (api.radarone.com.br)
4. Backend valida JWT, processa requisição
5. Backend consulta/atualiza banco PostgreSQL
6. Resposta retorna ao frontend
7. Frontend exibe resultado ao usuário
```

### Fluxo de Monitoramento

```
1. Worker inicia (a cada 1 minuto)
2. Busca monitores elegíveis no banco
3. Para cada monitor:
   a. Verifica rate limit
   b. Lança Playwright (browser headless)
   c. Navega para URL do monitor
   d. Extrai anúncios da página
   e. Compara com anúncios já vistos
   f. Se novo → envia notificação
   g. Salva no banco
4. Atualiza lastCheckedAt
5. Aguarda próximo ciclo
```

---

## 6. Jobs e Processamento em Segundo Plano

### Lista de Jobs

| Job | Frequência | Horário | O que faz |
|-----|------------|---------|-----------|
| **warmupPing** | 10 min | - | Mantém servidor ativo (evita cold start) |
| **checkTrialExpiring** | Diário | 09:00 | Notifica trials expirando em 3 dias |
| **checkSubscriptionExpired** | Diário | 10:00 | Marca assinaturas expiradas |
| **checkCouponAlerts** | Diário | 11:00 | Cria alertas sobre cupons |
| **checkTrialUpgradeExpiring** | Diário | 12:00 | Notifica trial upgrades expirando |
| **checkAbandonedCoupons** | Diário | 13:00 | Lembra sobre cupons não usados |
| **checkSessionExpiring** | Diário | 14:00 | Notifica sessões ML expirando |
| **resetMonthlyQueries** | 1º dia/mês | 03:00 | Reseta contadores de uso |

### Impacto para o Usuário

| Job | O que o usuário percebe |
|-----|-------------------------|
| warmupPing | Login mais rápido (menos cold start) |
| checkTrialExpiring | Email/notificação lembrando do trial |
| checkSubscriptionExpired | Acesso bloqueado se não renovar |
| checkCouponAlerts | Admin vê alertas sobre cupons |
| checkTrialUpgradeExpiring | Email sobre cupom expirando |
| checkAbandonedCoupons | Email lembrando de usar cupom |
| checkSessionExpiring | Notificação para reconectar Mercado Livre |
| resetMonthlyQueries | Contador de consultas volta a zero |

### Onde Ver Jobs (Admin)

**Tela:** `/admin/jobs`

Mostra:
- Nome do job
- Última execução
- Status (SUCCESS/FAILED/PARTIAL)
- Quantos registros processados
- Erros (se houver)

---

## 7. Segurança e Confiabilidade

### Autenticação

| Mecanismo | Detalhes |
|-----------|----------|
| **JWT** | Token válido por 7 dias |
| **2FA** | TOTP (Google Authenticator) |
| **bcrypt** | Senhas hasheadas com salt |
| **Rate Limit** | 10 tentativas de login / 15 min |

### Proteção de Dados

| Dado | Proteção |
|------|----------|
| Senha | bcrypt (10 salt rounds) |
| CPF | AES-256-GCM + hash SHA256 |
| Sessões (ML) | AES-256-CBC |
| 2FA Secret | Criptografado no banco |

### Rate Limiting

| Endpoint | Limite |
|----------|--------|
| Login/Register | 10 / 15 min |
| Forgot Password | 5 / hora |
| API Geral | 120 / min |

### Cold Start e Warmup

**O que é cold start?**
- Servidores free tier (Render) "dormem" após 15 min de inatividade
- Primeira requisição após dormência leva ~30 segundos
- Jobs de warmup mantêm servidor acordado

**Como o RadarOne trata:**
- Retry automático no login (3 tentativas)
- Mensagem amigável: "Servidor iniciando..."
- Warmup a cada 10 min em produção

### Observabilidade

| Ferramenta | Uso |
|------------|-----|
| **Sentry** | Rastreamento de erros |
| **Pino** | Logs estruturados (JSON) |
| **Health Check** | /health endpoint |
| **Audit Logs** | Ações de admin registradas |

---

## 8. Integrações Externas

### 8.1 Telegram

**Objetivo:** Enviar alertas instantâneos de novos anúncios

**Fluxo de Conexão:**
```
1. Usuário clica "Vincular Telegram"
2. Sistema gera código (ex: RADAR-A1B2C3) válido por 30 min
3. Usuário envia código para @RadarOneAlertaBot
4. Bot valida código e vincula chatId
5. Alertas são enviados para este chatId
```

**Configuração (para deploy):**
```
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_WEBHOOK_SECRET=<secret>
TELEGRAM_BOT_USERNAME=RadarOneAlertaBot
```

**Falhas comuns:**
| Problema | Causa | Solução |
|----------|-------|---------|
| "Código inválido" | Código expirou | Gere novo código |
| Mensagem não chega | Bot bloqueado | Desbloquear e /start novamente |
| "Não configurado" | Token não definido | Verificar env vars |

### 8.2 Kiwify (Pagamentos)

**Objetivo:** Processar pagamentos e ativar assinaturas

**Fluxo:**
```
1. Usuário escolhe plano
2. Redirecionado para checkout Kiwify
3. Completa pagamento
4. Kiwify envia webhook para RadarOne
5. Sistema ativa assinatura automaticamente
```

**Eventos suportados:**
- `compra_aprovada` → Ativa assinatura
- `subscription_renewed` → Renova período
- `subscription_canceled` → Cancela assinatura
- `chargeback` → Suspende conta

**Configuração:**
```
KIWIFY_WEBHOOK_SECRET=<secret>
```

### 8.3 Mercado Livre (Sessão)

**Objetivo:** Permitir scraping autenticado

**Fluxo:**
```
1. Usuário faz login no ML no próprio navegador
2. Exporta storageState (cookies + localStorage)
3. Upload do JSON em /settings/connections
4. Sistema criptografa e armazena
5. Worker usa sessão para scraping
6. Sessão válida por ~30 dias
```

**Não é OAuth tradicional** - usa estado de sessão do Playwright.

### 8.4 Email (Resend)

**Objetivo:** Enviar notificações por email

**Tipos de email:**
- Boas-vindas
- Trial expirando
- Novo anúncio
- Reset de senha
- Cupom abandonado

**Configuração:**
```
RESEND_API_KEY=<key>
EMAIL_FROM=noreply@radarone.com.br
```

### 8.5 Push Notifications

**Objetivo:** Notificações no navegador

**Fluxo:**
```
1. Usuário permite notificações no navegador
2. Frontend registra subscription (VAPID)
3. Envia endpoint + keys para backend
4. Backend armazena em PushSubscription
5. Quando necessário, envia push via web-push
```

**Configuração:**
```
VAPID_PUBLIC_KEY=<public>
VAPID_PRIVATE_KEY=<private>
```

---

## 9. Problemas Comuns e Troubleshooting

### Login Travado em "Entrando..."

**Sintoma:** Spinner infinito ao fazer login

**Causas:**
1. **Backend offline (cold start)**
   - Aguarde 30 segundos
   - Sistema faz retry automático

2. **Erro de rede**
   - Verifique conexão com internet
   - Tente em aba anônima

3. **Token corrompido**
   - Limpe cookies do site
   - Tente novamente

### "Sua sessão expirou por inatividade"

**Sintoma:** Logout automático ao navegar

**Causa:** Token JWT expirado ou inválido

**Solução:**
1. Faça login novamente
2. Se persistir, limpe localStorage:
   - F12 → Application → Local Storage → Clear

### Monitores não encontram anúncios

**Verificações:**
1. URL de busca está correta?
   - Deve ser uma página de RESULTADOS, não homepage

2. Site está online?
   - Acesse a URL manualmente

3. Filtros de preço muito restritivos?
   - Remova temporariamente para testar

4. Sessão expirada (Mercado Livre)?
   - Reconecte em /settings/connections

### Telegram não recebe alertas

**Verificações:**
1. Bot está vinculado?
   - Veja em /settings/notifications

2. Bot está bloqueado?
   - Abra @RadarOneAlertaBot e envie /start

3. Notificações habilitadas?
   - Toggle deve estar verde

### "Erro ao carregar dados" no Dashboard

**Causa:** Endpoint de subscription não respondeu

**Soluções:**
1. Recarregue a página (F5)
2. Limpe cache e cookies
3. Verifique status do backend: https://api.radarone.com.br/health

### Trial expirou antes do esperado

**Verificação:**
- Trial dura 7 dias a partir do REGISTRO
- Horário de expiração: meia-noite do 7º dia

**Solução:**
- Use cupom de trial upgrade se disponível
- Assine um plano pago

---

## 10. FAQ

### Geral

**P: Quanto custa o RadarOne?**
R: Oferecemos planos a partir de R$ 29,90/mês. Trial gratuito de 7 dias.

**P: Posso cancelar a qualquer momento?**
R: Sim, sem multa. Você mantém acesso até o fim do período pago.

**P: Funciona em celular?**
R: Sim, o site é responsivo. Alertas chegam via Telegram ou email no celular.

### Monitores

**P: Com que frequência os monitores verificam?**
R: Depende do plano: de 5 min (Ultra) a 60 min (Free).

**P: Posso monitorar qualquer site?**
R: Atualmente suportamos 8 sites específicos. Novos sites são adicionados periodicamente.

**P: Por que meu monitor não encontra anúncios?**
R: Verifique se a URL está correta e se os filtros de preço não são muito restritivos.

### Notificações

**P: Como recebo alertas no Telegram?**
R: Vincule sua conta em Configurações → Notificações → Vincular Telegram.

**P: Posso desativar emails?**
R: Email é o canal principal e não pode ser desativado completamente.

**P: Alertas atrasados, o que fazer?**
R: Verifique se o Telegram está vinculado e se não bloqueou o bot.

### Segurança

**P: Meus dados estão seguros?**
R: Sim. Senhas são criptografadas, CPF é protegido com AES-256, e usamos HTTPS.

**P: O que acontece se perder o 2FA?**
R: Use um código de backup ou entre em contato com suporte.

### Pagamento

**P: Quais formas de pagamento?**
R: PIX, cartão de crédito e boleto via Kiwify.

**P: O pagamento é automático?**
R: Sim, para assinaturas. Você será cobrado no mesmo dia do mês.

---

## 11. Glossário

| Termo | Definição |
|-------|-----------|
| **Monitor** | Busca salva que o sistema verifica automaticamente |
| **Alerta** | Notificação enviada quando novo anúncio é encontrado |
| **Scraper** | Programa que extrai dados de sites |
| **Trial** | Período de teste gratuito (7 dias) |
| **Subscription** | Assinatura paga de um plano |
| **2FA** | Autenticação de dois fatores |
| **TOTP** | Código temporário de 6 dígitos (app autenticador) |
| **Webhook** | Notificação automática entre sistemas |
| **Cold Start** | Demora inicial quando servidor "acorda" |
| **Rate Limit** | Limite de requisições para evitar abuso |
| **storageState** | Estado de sessão do navegador (cookies + localStorage) |
| **JWT** | Token de autenticação (JSON Web Token) |
| **Cupom** | Código de desconto ou benefício |
| **Trial Upgrade** | Cupom que dá acesso premium temporário |
| **Dashboard** | Tela principal com resumo do sistema |
| **Audit Log** | Registro de ações administrativas |

---

## 12. Apêndice Técnico

### Rotas do Frontend

#### Públicas
| Rota | Página |
|------|--------|
| `/` | Landing Page |
| `/login` | Login |
| `/register` | Cadastro |
| `/forgot-password` | Recuperar senha |
| `/reset-password` | Redefinir senha |
| `/2fa/verify` | Verificação 2FA |
| `/plans` | Planos e preços |
| `/faq` | Perguntas frequentes |

#### Autenticadas
| Rota | Página |
|------|--------|
| `/dashboard` | Dashboard |
| `/monitors` | Monitores |
| `/settings/notifications` | Notificações |
| `/settings/subscription` | Assinatura |
| `/settings/connections` | Conexões |
| `/telegram/connect` | Conectar Telegram |

#### Admin
| Rota | Página |
|------|--------|
| `/admin/stats` | Estatísticas |
| `/admin/users` | Usuários |
| `/admin/subscriptions` | Assinaturas |
| `/admin/jobs` | Jobs |
| `/admin/coupons` | Cupons |
| `/admin/audit-logs` | Audit Logs |

### Endpoints da API

#### Autenticação
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
GET  /api/auth/status
POST /api/auth/forgot-password
POST /api/auth/reset-password
GET  /api/auth/2fa/status
GET  /api/auth/2fa/setup
POST /api/auth/2fa/enable
POST /api/auth/2fa/disable
POST /api/auth/2fa/verify
```

#### Monitores
```
GET    /api/monitors
GET    /api/monitors/:id
POST   /api/monitors
PUT    /api/monitors/:id
DELETE /api/monitors/:id
PATCH  /api/monitors/:id/toggle-active
```

#### Assinaturas
```
GET  /api/subscriptions/my
POST /api/subscriptions/start-trial
POST /api/subscriptions/create-checkout
POST /api/subscriptions/cancel
```

#### Notificações
```
GET  /api/notifications/settings
PUT  /api/notifications/settings
POST /api/notifications/test-email
POST /api/notifications/telegram/link-code
```

### Variáveis de Ambiente

#### Backend
```
DATABASE_URL=postgresql://...
JWT_SECRET=<secret>
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://radarone.com.br
TELEGRAM_BOT_TOKEN=<token>
RESEND_API_KEY=<key>
KIWIFY_WEBHOOK_SECRET=<secret>
SENTRY_DSN=<dsn>
```

#### Worker
```
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=<token>
RESEND_API_KEY=<key>
CHECK_INTERVAL_MINUTES=1
PLAYWRIGHT_BROWSERS_PATH=./pw-browsers
```

---

**Documento gerado automaticamente por auditoria do sistema RadarOne**
**Última atualização:** 24 de Janeiro de 2026
**Autor:** Equipe RadarOne + Claude Code
