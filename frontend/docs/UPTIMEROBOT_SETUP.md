# 🔍 UptimeRobot - Guia Completo de Setup e Operação

Documentação completa para configurar monitoramento externo 24/7 do RadarOne usando UptimeRobot.

## 📖 Índice

1. [Por que UptimeRobot?](#por-que-uptimerobot)
2. [Criar Conta](#criar-conta)
3. [Configurar Monitores](#configurar-monitores)
4. [Configurar Alertas](#configurar-alertas)
5. [Status Page Público](#status-page-público)
6. [Playbook Operacional](#playbook-operacional)
7. [Checklist de Validação](#checklist-de-validação)
8. [FAQ e Troubleshooting](#faq-e-troubleshooting)

---

## Por que UptimeRobot?

### Benefícios

- ✅ **Plano Free Generoso:** Até 50 monitores, verificações a cada 5 minutos
- ✅ **Monitoramento 24/7:** Verifica de múltiplas localizações globais
- ✅ **Alertas Múltiplos:** Email, SMS, Telegram, Slack, Webhook
- ✅ **Status Page:** Compartilhe uptime com usuários
- ✅ **Histórico:** 90 dias de logs (free) ou ilimitado (pago)
- ✅ **API Robusta:** Integração programática se necessário
- ✅ **Fácil Setup:** Menos de 10 minutos para configurar

### Plano Recomendado

**Para MVP/Startup:**
- Plano **Free** é suficiente
- 50 monitores
- Verificações a cada 5 minutos
- Alertas via Email e Telegram

**Para Produção Crítica:**
- Plano **Pro** ($7/mês)
- Verificações a cada 1 minuto
- SMS alerts
- Monitoramento de palavras-chave avançado
- Logs ilimitados

---

## Criar Conta

### Passo 1: Registro

1. Acesse: [https://uptimerobot.com](https://uptimerobot.com)
2. Clique em **Sign Up Free**
3. Preencha:
   - **Email:** seu-email@radarone.com
   - **Senha:** Use gerenciador de senhas
4. Confirme email
5. Faça login

### Passo 2: Configuração Inicial

1. Acesse **Dashboard**
2. Configure **Timezone:** America/Sao_Paulo
3. Configure **Email de alerta:** email principal da equipe

---

## Configurar Monitores

### Monitor 1: Frontend (HTTPS)

**Objetivo:** Monitorar se o site está no ar

1. Clique em **Add New Monitor**
2. Preencha:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** RadarOne Frontend
   - **URL:** `https://seu-dominio.com`
   - **Monitoring Interval:** 5 minutes (free) ou 1 minute (pro)
3. **Advanced Settings:**
   - **HTTP Method:** GET
   - **Expected Status Code:** 200
   - **Timeout:** 30 seconds
4. Clique em **Create Monitor**

**Validação:**
- Status deve aparecer como "Up" (verde)
- Uptime deve estar em 100%

### Monitor 2: Backend Health Endpoint

**Objetivo:** Monitorar health do backend + validar resposta JSON

1. Clique em **Add New Monitor**
2. Preencha:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** RadarOne Backend Health
   - **URL:** `https://api.seu-dominio.com/health`
   - **Monitoring Interval:** 5 minutes
3. **Advanced Settings:**
   - **HTTP Method:** GET
   - **Expected Status Code:** 200
   - **Keyword Monitoring:** Enabled
   - **Keyword Type:** Keyword exists
   - **Keyword:** `"status":"ok"`
4. Clique em **Create Monitor**

**Por que keyword monitoring?**
- Garante que endpoint não só retorna 200, mas também resposta válida
- Se backend retornar HTML de erro com status 200, monitor detecta
- Valida que JSON contém `"status":"ok"`

### Monitor 3: Backend API Critical Endpoint

**Objetivo:** Monitorar endpoint crítico de API

1. Clique em **Add New Monitor**
2. Preencha:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** RadarOne API - Monitors
   - **URL:** `https://api.seu-dominio.com/api/monitors`
   - **Monitoring Interval:** 5 minutes
3. **Advanced Settings:**
   - **HTTP Method:** GET
   - **Expected Status Code:** 200, 401 (ambos OK)
   - **Timeout:** 30 seconds
4. Clique em **Create Monitor**

**Nota:** Espera 401 porque endpoint requer autenticação. O importante é que API responda, não que retorne dados.

### Monitor 4: PostgreSQL via Backend (Opcional)

**Objetivo:** Validar que banco de dados está acessível

1. Criar endpoint no backend: `/health/database`
   ```typescript
   app.get('/health/database', async (req, res) => {
     try {
       await prisma.$queryRaw`SELECT 1`;
       res.json({ status: 'ok', database: 'connected' });
     } catch (error) {
       res.status(500).json({ status: 'error', database: 'disconnected' });
     }
   });
   ```

2. Adicionar monitor no UptimeRobot:
   - **URL:** `https://api.seu-dominio.com/health/database`
   - **Keyword:** `"database":"connected"`

---

## Configurar Alertas

### Contatos de Alerta

#### 1. Email Alert

**Já configurado por padrão** ao criar conta.

**Customizar:**
1. Vá em **My Settings** → **Alert Contacts**
2. Edite email padrão
3. Configure:
   - **Send alerts when:** Monitor goes down OR up
   - **Resend if down:** Every 15 minutes (evita spam)

#### 2. Telegram Alert (Recomendado)

**Setup:**

1. No Telegram, procure por **@uptimerobot_bot**
2. Inicie conversa: `/start`
3. O bot enviará um **Telegram ID**
4. No UptimeRobot:
   - Vá em **My Settings** → **Alert Contacts**
   - Clique em **Add Alert Contact**
   - Selecione **Telegram**
   - Cole o **Telegram ID**
   - **Friendly Name:** Telegram Ops
5. Teste enviando alerta de teste

**Vantagens:**
- ✅ Notificações instantâneas no celular
- ✅ Não vai para spam (como email)
- ✅ Fácil de responder rapidamente

#### 3. Slack Alert (Opcional)

**Setup:**

1. No Slack, crie um channel: `#radarone-alerts`
2. Adicione uma **Incoming Webhook:**
   - Vá em Slack Settings → Integrations → Incoming Webhooks
   - Copie Webhook URL
3. No UptimeRobot:
   - **Add Alert Contact** → **Slack**
   - Cole Webhook URL
   - **Friendly Name:** Slack Ops Channel

#### 4. SMS Alert (Plano Pro)

Apenas se produção crítica necessitar notificações SMS.

### Configurar Monitores para Usar Alertas

1. Edite cada monitor
2. Vá em **Alert Contacts to Notify**
3. Selecione:
   - ✅ Email
   - ✅ Telegram
   - ✅ Slack (se configurado)
4. **Save Changes**

---

## Status Page Público

### Criar Status Page

1. Vá em **Status Pages**
2. Clique em **Add New Status Page**
3. Configure:
   - **Friendly Name:** RadarOne Status
   - **Custom Domain:** status.radarone.com (opcional)
   - **Monitors to Show:** Selecione Frontend e Backend Health
   - **Display:** Show uptime percentages
4. **Customizar visual:**
   - Logo: Upload logo do RadarOne
   - Colors: Cores da marca
   - Custom message: "Status em tempo real do RadarOne"

### Compartilhar Status Page

**URL pública:** `https://stats.uptimerobot.com/XXXXXXXXX`

**Usar para:**
- Página "Status" no rodapé do site
- Link durante incidentes
- Transparência com usuários
- Reduzir tickets de suporte

**Embed no site:**
```html
<iframe
  src="https://stats.uptimerobot.com/XXXXXXXXX"
  width="100%"
  height="500"
  frameborder="0"
></iframe>
```

---

## Playbook Operacional

### Cenário 1: Alerta de Downtime (Frontend)

#### Fase 1: Validação Imediata (0-2 min)

**1.1 Confirmar downtime:**
- [ ] Acessar `https://seu-dominio.com` manualmente
- [ ] Testar em múltiplos dispositivos/redes
- [ ] Verificar se é falso positivo

**1.2 Se downtime confirmado:**
- [ ] Anotar horário exato do downtime
- [ ] Fazer screenshot da página de erro

#### Fase 2: Diagnóstico (2-5 min)

**2.1 Verificar Render Dashboard:**
- [ ] Login em [Render.com](https://render.com)
- [ ] Ir em serviço de frontend
- [ ] Verificar **Logs** → últimos 100 logs
- [ ] Verificar **Events** → últimos deploys

**2.2 Verificar possíveis causas:**
- [ ] Deploy recente com erro?
- [ ] Build falhou?
- [ ] Variável de ambiente alterada?
- [ ] Plano free atingiu limite (sleep após inatividade)?

**2.3 Verificar status do Render:**
- [ ] Acessar [Render Status](https://status.render.com)
- [ ] Verificar se há incident geral

#### Fase 3: Resolução (5-15 min)

**3.1 Se erro de build:**
```bash
# Localmente, testar build
cd frontend
npm install
npm run build

# Se passar, fazer redeploy manual no Render
```

**3.2 Se erro de variável de ambiente:**
- [ ] Verificar variáveis no Render Dashboard
- [ ] Corrigir valores
- [ ] Redeploy manual

**3.3 Se plano free dormiu (cold start):**
- [ ] Aguardar 30-60 segundos (wake-up automático)
- [ ] Considerar upgrade para plano pago (sem sleep)

**3.4 Se causa desconhecida:**
- [ ] Redeploy manual (Manual Deploy no Render)
- [ ] Aguardar 2-3 minutos
- [ ] Verificar se voltou

#### Fase 4: Comunicação (paralelo)

**4.1 Atualizar Status Page:**
- [ ] Ir em UptimeRobot → Status Pages
- [ ] Criar **Incident**
- [ ] Escrever: "Estamos investigando problemas de acesso ao RadarOne"

**4.2 Se downtime > 5 minutos:**
- [ ] Notificar usuários via Twitter/email
- [ ] Atualizar incident com ETA de resolução

**4.3 Após resolução:**
- [ ] Atualizar incident: "Resolvido"
- [ ] Agradecer paciência dos usuários
- [ ] Documentar causa raiz

#### Fase 5: Post-Mortem (após resolução)

**5.1 Documentar incident:**
- [ ] Causa raiz identificada
- [ ] Tempo total de downtime
- [ ] Ações tomadas
- [ ] Impacto nos usuários

**5.2 Prevenir recorrência:**
- [ ] Se erro de código → adicionar teste
- [ ] Se erro de infra → documentar solução
- [ ] Se limite atingido → upgrade de plano

---

### Cenário 2: Alerta de Downtime (Backend)

#### Fase 1: Validação (0-2 min)

**1.1 Testar endpoint manualmente:**
```bash
curl https://api.seu-dominio.com/health
# Esperado: {"status":"ok","service":"radarone-backend",...}
```

**1.2 Verificar resposta:**
- [ ] Status 200?
- [ ] JSON válido?
- [ ] Campo `status: "ok"` presente?

#### Fase 2: Diagnóstico (2-5 min)

**2.1 Verificar Render Dashboard (Backend):**
- [ ] Logs → erros de runtime?
- [ ] Events → deploy recente?
- [ ] Metrics → CPU/Memory alto?

**2.2 Verificar PostgreSQL:**
```bash
# No Render Dashboard do PostgreSQL
# Verificar Metrics → Connections
# Verificar se não atingiu limite de conexões
```

**2.3 Possíveis causas:**
- [ ] Erro de código no backend
- [ ] PostgreSQL fora do ar
- [ ] Limite de conexões atingido
- [ ] Variável de ambiente incorreta (DATABASE_URL)

#### Fase 3: Resolução (5-15 min)

**3.1 Se PostgreSQL down:**
- [ ] Verificar status em Render Dashboard (PostgreSQL)
- [ ] Aguardar recovery automático (geralmente < 2 min)
- [ ] Se > 5 min, abrir ticket no Render Support

**3.2 Se erro de código:**
- [ ] Identificar erro nos logs
- [ ] Corrigir localmente
- [ ] Deploy hotfix

**3.3 Se limite de conexões:**
- [ ] Restart do backend (Manual Deploy)
- [ ] Considerar upgrade do plano PostgreSQL
- [ ] Verificar connection pooling no Prisma

#### Fase 4: Comunicação e Post-Mortem

Seguir mesmo processo do Cenário 1.

---

### Cenário 3: Performance Degradada

**Indicadores:**
- UptimeRobot mostra "Up" mas response time > 5s
- Usuários reportam lentidão

**Ações:**

1. **Verificar response times:**
   - [ ] UptimeRobot → Monitor → Response Times
   - [ ] Identificar quando começou

2. **Verificar logs do backend:**
   - [ ] Queries lentas?
   - [ ] Endpoints específicos com problema?

3. **Verificar PostgreSQL:**
   - [ ] Metrics → Query performance
   - [ ] Identificar queries N+1

4. **Otimizações imediatas:**
   - [ ] Adicionar índices em colunas filtradas
   - [ ] Otimizar queries com `include` no Prisma
   - [ ] Implementar cache (Redis)

---

## Checklist de Validação

### Após Configurar Monitores

- [ ] Todos os monitores aparecem como "Up" (verde)
- [ ] Response times < 500ms para frontend
- [ ] Response times < 300ms para backend /health
- [ ] Keyword monitoring detecta `"status":"ok"` corretamente

### Testar Alertas

**Simular downtime:**

1. **Método 1: Pausar monitor temporariamente**
   - [ ] Editar monitor → **Pause Monitoring**
   - [ ] Aguardar 5 minutos
   - [ ] Verificar se alerta foi enviado
   - [ ] Resume monitoring

2. **Método 2: Mudar URL para inválida**
   - [ ] Editar monitor → URL: `https://seu-dominio.com/404`
   - [ ] Aguardar 5 minutos
   - [ ] Verificar alerta
   - [ ] Corrigir URL

**Validar alertas recebidos:**
- [ ] Email recebido?
- [ ] Telegram notificou?
- [ ] Slack postou no canal?

### Status Page

- [ ] Acessar URL público da status page
- [ ] Monitores aparecem corretamente
- [ ] Uptime percentages corretos
- [ ] Visual customizado com logo/cores

---

## FAQ e Troubleshooting

### ❓ Monitor mostra "Down" mas site está no ar

**Possíveis causas:**
1. Timeout muito curto (< 10s)
2. Firewall bloqueando IPs do UptimeRobot
3. Cloudflare/CDN com rate limiting

**Solução:**
- Aumentar timeout para 30s
- Whitelist IPs do UptimeRobot
- Verificar Cloudflare Security settings

### ❓ Keyword monitoring não detecta "status":"ok"

**Causa:** JSON retorna com espaços diferentes ou quebras de linha

**Solução:**
- Mudar keyword para apenas `"ok"` (mais flexível)
- Ou usar regex: `status.*ok`
- Testar resposta real: `curl https://api/health`

### ❓ Muitos falsos positivos (monitor oscilando Up/Down)

**Causa:** Backend instável ou limite de conexões

**Solução:**
- Verificar logs do backend para erros intermitentes
- Aumentar recursos do servidor (RAM/CPU)
- Implementar health check retry no backend

### ❓ Alertas não chegam

**Verificar:**
1. Alert Contact está verificado (email confirmado)
2. Monitor está configurado para notificar o contato
3. Email não está indo para spam
4. Telegram bot foi iniciado corretamente

---

## Recursos Adicionais

- [UptimeRobot Documentation](https://uptimerobot.com/docs/)
- [UptimeRobot API](https://uptimerobot.com/api/)
- [Status Page Examples](https://stats.uptimerobot.com/)
- [Best Practices](https://blog.uptimerobot.com/)

---

**Última atualização:** 2025-12-28
**Versão:** 1.0
**Mantido por:** Equipe RadarOne
