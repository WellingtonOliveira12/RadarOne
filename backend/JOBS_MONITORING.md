# 📊 Monitoramento de Jobs - RadarOne Backend

Este documento descreve os jobs automáticos do RadarOne, como monitorá-los e o que esperar de cada um em produção.

---

## 📋 Jobs Disponíveis

O sistema possui 3 jobs principais que rodam automaticamente via `node-cron`:

### 1. **checkTrialExpiring**
- **Descrição**: Verifica trials expirando e envia notificações
- **Cron**: `0 9 * * *` (diariamente às 9h, America/Sao_Paulo)
- **Arquivo**: `src/jobs/checkTrialExpiring.ts`

### 2. **checkSubscriptionExpired**
- **Descrição**: Verifica assinaturas pagas expiradas
- **Cron**: `0 10 * * *` (diariamente às 10h, America/Sao_Paulo)
- **Arquivo**: `src/jobs/checkSubscriptionExpired.ts`

### 3. **resetMonthlyQueries** ⭐ (Novo)
- **Descrição**: Reset mensal do contador de queries
- **Cron**: `0 3 1 * *` (dia 1 de cada mês às 3h, America/Sao_Paulo)
- **Arquivo**: `src/jobs/resetMonthlyQueries.ts`
- **Tabela afetada**: `subscriptions`
- **Campo resetado**: `queriesUsed` → `0`
- **Filtro**: Apenas assinaturas com `status = 'ACTIVE'`

---

## 🔍 Logs Esperados - resetMonthlyQueries

Quando o job roda com sucesso, você verá os seguintes logs:

### **Logs do Scheduler**
```
[SCHEDULER] ⏰ Executando resetMonthlyQueries...
[SCHEDULER] ✅ resetMonthlyQueries executado com sucesso
```

### **Logs do Job**
```
[RESET_QUERIES_JOB] 🔄 Iniciando reset mensal de queries...
[RESET_QUERIES_JOB] 📅 Data de execução: 01/01/2025, 03:00:00
[RESET_QUERIES_JOB] ✅ Reset mensal concluído com sucesso!
[RESET_QUERIES_JOB] 📊 Assinaturas atualizadas: 42
```

### **Caso não haja assinaturas ativas**
```
[RESET_QUERIES_JOB] ⚠️  Nenhuma assinatura ativa encontrada para resetar.
```

### **Em caso de erro**
```
[SCHEDULER] ❌ Erro ao executar resetMonthlyQueries: <detalhes do erro>
[RESET_QUERIES_JOB] ❌ Erro ao resetar queries mensais: <detalhes do erro>
```

---

## 🧪 Como Testar Localmente

### **1. Testar apenas o job de reset mensal**
```bash
cd ~/RadarOne/backend
npx ts-node src/jobs/resetMonthlyQueries.ts
```

**Resultado esperado:**
- Job executa imediatamente
- Mostra logs de início, execução e fim
- Retorna `exit code 0` se sucesso

### **2. Testar todos os jobs de uma vez (modo debug)**
```bash
cd ~/RadarOne/backend
npx ts-node src/jobs/scheduler.ts
```

**Resultado esperado:**
- Executa os 3 jobs sequencialmente
- Útil para validar que todos estão funcionando

### **3. Validar build antes de deploy**
```bash
cd ~/RadarOne/backend
npm run build
```

**Resultado esperado:**
- Compilação TypeScript sem erros
- Arquivos `.js` gerados em `dist/`

---

## 🚀 Como Monitorar na Render (Produção)

### **1. Acessar Logs em Tempo Real**
1. Acesse o [Dashboard da Render](https://dashboard.render.com)
2. Selecione o serviço `radarone-backend` (ou nome do seu serviço)
3. Clique na aba **"Logs"**
4. Filtre por:
   - `[SCHEDULER]` para ver agendamento dos jobs
   - `[RESET_QUERIES_JOB]` para ver logs específicos do reset mensal

### **2. Verificar Execução do Job**
O job `resetMonthlyQueries` roda automaticamente no dia 1 de cada mês às **3h da manhã** (horário de Brasília).

**Para confirmar que rodou:**
1. Acesse os logs no dia 1 do mês após as 3h
2. Procure por:
   ```
   [SCHEDULER] ⏰ Executando resetMonthlyQueries...
   [RESET_QUERIES_JOB] 📊 Assinaturas atualizadas: X
   ```

### **3. Alertas Importantes**

⚠️ **Fique atento a estes cenários:**

| Log | Significado | Ação Recomendada |
|-----|-------------|------------------|
| `Assinaturas atualizadas: 0` | Nenhuma assinatura ativa no momento | Normal se não houver clientes ativos |
| `❌ Erro ao resetar queries mensais` | Job falhou | Investigar erro nos logs, verificar conexão com DB |
| Ausência de logs no dia 1 | Job não rodou | Verificar se o servidor está rodando, checar timezone |

---

## 🔧 Troubleshooting

### **Problema: Job não está rodando em produção**

**Possíveis causas:**
1. Servidor não está rodando (verificar deploy na Render)
2. Timezone incorreto (deve ser `America/Sao_Paulo`)
3. Erro na inicialização do scheduler

**Como verificar:**
```bash
# Nos logs da Render, procure por:
[SCHEDULER] 🕐 Iniciando agendamento de jobs...
[SCHEDULER] ✅ Jobs agendados:
```

Se não encontrar esses logs, o scheduler não foi inicializado.

### **Problema: Job roda mas não atualiza o banco**

**Possíveis causas:**
1. Conexão com banco de dados falhou
2. Nenhuma assinatura ativa no momento

**Como verificar:**
```bash
# No Prisma Studio ou direto no PostgreSQL:
SELECT id, status, "queriesUsed"
FROM subscriptions
WHERE status = 'ACTIVE';
```

Se `queriesUsed` não foi zerado, verifique os logs de erro.

---

## 📅 Calendário de Execução

| Job | Frequência | Horário | Timezone |
|-----|------------|---------|----------|
| checkTrialExpiring | Diário | 09:00 | America/Sao_Paulo |
| checkSubscriptionExpired | Diário | 10:00 | America/Sao_Paulo |
| **resetMonthlyQueries** | **Mensal (dia 1)** | **03:00** | **America/Sao_Paulo** |

---

## 🔗 Arquivos Relacionados

- **Scheduler central**: `src/jobs/scheduler.ts`
- **Inicialização do servidor**: `src/server.ts` (linha ~135: `startScheduler()`)
- **Job de reset mensal**: `src/jobs/resetMonthlyQueries.ts`
- **Schema do Prisma**: `prisma/schema.prisma` (modelo `Subscription`)

---

## 📧 Notificações e Auditoria

O job `resetMonthlyQueries` possui as seguintes funcionalidades implementadas:
- ✅ Email de relatório para o admin após cada execução (`sendMonthlyQueriesResetReport`)
- ✅ Registro de auditoria no banco de dados (`webhookLog` com event `MONTHLY_QUERIES_RESET`)
- ✅ Alertas no Sentry em caso de erro (via `captureJobException`)

### Sentry & Alertas para Jobs

Todos os jobs capturam exceções no Sentry com tags padronizadas:
- **Tag `job`**: Nome do job que falhou (`resetMonthlyQueries`, `checkTrialExpiring`, `checkSubscriptionExpired`)
- **Tag `source`**: `automated_job` (identifica que é um job automatizado)
- **Extra `timestamp`**: Data/hora da falha em ISO 8601

**Para criar alertas no Sentry**, consulte o guia detalhado:
👉 **[SENTRY_ALERTS_JOBS.md](./SENTRY_ALERTS_JOBS.md)**

---

**Última atualização:** 11 de dezembro de 2025
**Responsável:** Backend Team - RadarOne
