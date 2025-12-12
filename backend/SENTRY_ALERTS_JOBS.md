# Guia de Configuração de Alertas Sentry para Jobs

Este documento descreve como configurar alertas proativos no Sentry para monitorar falhas críticas nos jobs automatizados do RadarOne.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Tags e Extras Disponíveis](#tags-e-extras-disponíveis)
- [Como Criar Alertas no Sentry](#como-criar-alertas-no-sentry)
- [Sugestões de Alertas](#sugestões-de-alertas)
- [Canais de Notificação](#canais-de-notificação)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Todos os jobs automatizados do RadarOne enviam exceções para o Sentry quando falham. Cada erro é enriquecido com **tags** e **extras** que facilitam a criação de alertas específicos e acionáveis.

### Jobs Monitorados

| Job | Frequência | Função |
|-----|-----------|--------|
| `resetMonthlyQueries` | Mensal (dia 1, 3h) | Reseta contador de queries para assinaturas ativas |
| `checkTrialExpiring` | Diário (9h) | Verifica trials expirando e envia emails |
| `checkSubscriptionExpired` | Diário (10h) | Verifica assinaturas pagas expiradas |

---

## 🏷️ Tags e Extras Disponíveis

### Tags

Cada erro de job é marcado com as seguintes tags:

```json
{
  "job": "resetMonthlyQueries",  // Nome do job que falhou
  "source": "automated_job"       // Identifica que é um job automatizado
}
```

**Valores possíveis para `job`:**
- `resetMonthlyQueries`
- `checkTrialExpiring`
- `checkSubscriptionExpired`

### Extras

Informações adicionais enviadas no campo `extra`:

```json
{
  "timestamp": "2024-12-11T15:30:00.000Z",  // Timestamp ISO 8601
  "jobName": "resetMonthlyQueries",          // Nome do job (duplicado para fácil acesso)
  // Outros dados contextuais adicionados pelos jobs
}
```

---

## 📝 Como Criar Alertas no Sentry

### Passo 1: Acessar a UI do Sentry

1. Faça login no [Sentry.io](https://sentry.io)
2. Selecione o projeto **RadarOne Backend**
3. No menu lateral, vá em **Alerts** → **Create Alert**

### Passo 2: Escolher Tipo de Alerta

Escolha **"Issue Alert"** para receber notificações quando erros específicos ocorrerem.

### Passo 3: Configurar Condições

#### Exemplo 1: Alerta para Job `resetMonthlyQueries`

**Condições:**
- When: `An event is captured`
- If: `The event's tags match`
  - Tag: `job`
  - Value: `resetMonthlyQueries`

**Ação:**
- Send a notification via: **Email** ou **Slack**

#### Exemplo 2: Alerta para Qualquer Job com Múltiplos Erros

**Condições:**
- When: `The issue is seen more than [5] times in [1 hour]`
- If: `The event's tags match`
  - Tag: `source`
  - Value: `automated_job`

**Ação:**
- Send a notification via: **Email** ou **Slack**

### Passo 4: Definir Ações

Escolha como deseja ser notificado:
- **Email**: Notificação por email
- **Slack**: Mensagem em canal específico
- **PagerDuty**: Para alertas críticos de plantão
- **Webhook**: Integração customizada

---

## 🚨 Sugestões de Alertas

### 1. Alerta Crítico: Falha no Reset Mensal de Queries

**Descrição:** O job `resetMonthlyQueries` é crítico pois afeta diretamente o faturamento e limites de uso.

**Configuração:**
```
Nome: [CRÍTICO] Falha no Reset Mensal de Queries
Condições:
  - When: An event is captured
  - If: tags.job = "resetMonthlyQueries"
Ações:
  - Email para: admin@radarone.com
  - Slack: #alerts-critical
Severidade: Critical
```

**Justificativa:** Qualquer falha neste job deve ser investigada imediatamente, pois pode impactar a experiência de todos os usuários.

---

### 2. Alerta Crítico: Falha na Verificação de Assinaturas Expiradas

**Descrição:** Falhas no `checkSubscriptionExpired` podem resultar em usuários com acesso indevido após expiração.

**Configuração:**
```
Nome: [CRÍTICO] Falha na Verificação de Assinaturas Expiradas
Condições:
  - When: An event is captured
  - If: tags.job = "checkSubscriptionExpired"
Ações:
  - Email para: admin@radarone.com
  - Slack: #alerts-critical
Severidade: Critical
```

---

### 3. Alerta de Aviso: Múltiplas Falhas de Trial Check

**Descrição:** Se o job de trials falhar repetidamente, pode indicar problemas no banco de dados ou serviço de email.

**Configuração:**
```
Nome: [AVISO] Múltiplas Falhas na Verificação de Trials
Condições:
  - When: The issue is seen more than 3 times in 1 hour
  - If: tags.job = "checkTrialExpiring"
Ações:
  - Email para: dev-team@radarone.com
  - Slack: #alerts-warning
Severidade: Warning
```

---

### 4. Alerta Geral: Qualquer Job Falhando Repetidamente

**Descrição:** Detecta padrões de falha em qualquer job automatizado.

**Configuração:**
```
Nome: [AVISO] Jobs Automatizados com Falhas Repetidas
Condições:
  - When: The issue is seen more than 5 times in 1 hour
  - If: tags.source = "automated_job"
Ações:
  - Email para: dev-team@radarone.com
  - Slack: #alerts-jobs
Severidade: Warning
```

---

### 5. Alerta de Informação: Primeiro Erro do Dia em Jobs

**Descrição:** Notifica sobre a primeira falha de qualquer job no dia (para monitoramento preventivo).

**Configuração:**
```
Nome: [INFO] Primeira Falha de Job do Dia
Condições:
  - When: An event is first seen
  - If: tags.source = "automated_job"
  - And: event.timestamp is between 00:00 and 23:59 (do dia atual)
Ações:
  - Slack: #monitoring-daily
Severidade: Info
```

---

## 📬 Canais de Notificação

### Email

**Prós:**
- Fácil de configurar
- Histórico permanente
- Suporta múltiplos destinatários

**Contras:**
- Pode ser ignorado em caixa de entrada cheia
- Delay de alguns minutos

**Recomendado para:** Alertas críticos com baixa frequência

---

### Slack

**Prós:**
- Notificação em tempo real
- Discussão em thread
- Fácil visualização de padrões

**Contras:**
- Requer integração Slack configurada
- Pode gerar ruído se mal configurado

**Recomendado para:** Alertas de warning e info

**Como configurar:**
1. No Sentry, vá em **Settings** → **Integrations**
2. Busque por **Slack** e clique em **Add to Slack**
3. Autorize o workspace desejado
4. Em cada alerta, selecione o canal Slack apropriado

**Sugestão de canais:**
- `#alerts-critical`: Falhas críticas que requerem ação imediata
- `#alerts-warning`: Avisos de múltiplas falhas ou padrões preocupantes
- `#monitoring-daily`: Informações de rotina e primeiras falhas do dia

---

### PagerDuty (Opcional)

**Prós:**
- Escalação automática
- Integração com plantões
- Notificações push no celular

**Contras:**
- Custo adicional
- Pode ser excessivo para equipes pequenas

**Recomendado para:** Sistemas com SLA rigoroso e equipe de plantão 24/7

---

## 🔍 Troubleshooting

### Problema: Alertas não estão sendo enviados

**Possíveis causas:**
1. **Sentry não está inicializado:** Verifique se `SENTRY_DSN` está configurado no `.env`
2. **Tags incorretas:** Confirme que os jobs estão chamando `captureJobException` com `jobName` correto
3. **Filtros muito restritivos:** Revise as condições do alerta

**Como verificar:**
```bash
# 1. Verificar se SENTRY_DSN está configurado
cat .env | grep SENTRY_DSN

# 2. Verificar logs do servidor
grep -i "SENTRY" logs/server.log

# 3. Forçar um erro de teste
npx ts-node -e "
  require('dotenv').config();
  const { captureJobException } = require('./src/monitoring/sentry');
  captureJobException(new Error('Teste de alerta'), { jobName: 'testJob' });
"
```

---

### Problema: Muitos alertas (ruído excessivo)

**Soluções:**
1. **Aumente o threshold:** Em vez de 1 erro, configure para "mais de 3 erros em 1 hora"
2. **Use "Issue Frequency":** Configure para alertar apenas na 1ª, 10ª, 100ª ocorrência
3. **Filtre por ambiente:** Adicione filtro `environment = "production"`
4. **Agrupe erros similares:** Use "Merge Issues" no Sentry para agrupar duplicatas

---

### Problema: Alertas com delay excessivo

**Possíveis causas:**
1. **Email de notificação:** Emails podem ter delay de 1-5 minutos
2. **Rate limiting do Sentry:** Conta gratuita tem limites de notificação

**Soluções:**
1. Use Slack ou webhooks para notificações mais rápidas
2. Verifique quota da conta Sentry
3. Configure "Real-time alerts" (planos pagos do Sentry)

---

## 📊 Monitoramento de Alertas

### Visualizar Alertas Disparados

1. No Sentry, vá em **Alerts** → **Alert Rules**
2. Clique no alerta desejado
3. Veja histórico de disparos na aba **History**

### Métricas Úteis

- **False Positive Rate:** % de alertas que não requereram ação
- **Time to Acknowledge:** Tempo médio entre disparo e reconhecimento
- **Resolution Time:** Tempo médio entre disparo e resolução

---

## 📚 Recursos Adicionais

- [Sentry Alerts Documentation](https://docs.sentry.io/product/alerts/)
- [Sentry Issue Filtering](https://docs.sentry.io/product/sentry-basics/search/)
- [Sentry Integrations](https://docs.sentry.io/product/integrations/)

---

**Última atualização:** 2024-12-11
**Responsável:** DevOps Team - RadarOne
