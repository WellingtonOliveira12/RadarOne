# ✅ UptimeRobot - Checklist Rápido de Setup

Use este checklist para configurar monitoramento do RadarOne em produção.

## 📋 Configuração Inicial

### 1. Criar Conta
- [ ] Acessar [uptimerobot.com](https://uptimerobot.com)
- [ ] Criar conta com email da equipe
- [ ] Confirmar email
- [ ] Configurar timezone: America/Sao_Paulo

### 2. Adicionar Monitores

#### Monitor 1: Frontend
- [ ] Add New Monitor → HTTP(s)
- [ ] Name: `RadarOne Frontend`
- [ ] URL: `https://seu-dominio.com`
- [ ] Interval: 5 minutes
- [ ] Timeout: 30 seconds
- [ ] Status: **Up** (verde) ✅

#### Monitor 2: Backend Health
- [ ] Add New Monitor → HTTP(s)
- [ ] Name: `RadarOne Backend Health`
- [ ] URL: `https://api.seu-dominio.com/health`
- [ ] Interval: 5 minutes
- [ ] Keyword monitoring: **Enabled**
- [ ] Keyword: `"status":"ok"`
- [ ] Keyword type: Keyword exists
- [ ] Status: **Up** (verde) ✅

#### Monitor 3: Backend API
- [ ] Add New Monitor → HTTP(s)
- [ ] Name: `RadarOne API - Monitors`
- [ ] URL: `https://api.seu-dominio.com/api/monitors`
- [ ] Expected status: 200, 401 (ambos OK)
- [ ] Interval: 5 minutes
- [ ] Status: **Up** (verde) ✅

### 3. Configurar Alertas

#### Email (já configurado)
- [ ] Verificar email padrão em My Settings
- [ ] Configurar: Send alerts when monitor goes **down OR up**
- [ ] Resend interval: Every 15 minutes

#### Telegram (recomendado)
- [ ] Procurar **@uptimerobot_bot** no Telegram
- [ ] Enviar `/start`
- [ ] Copiar **Telegram ID** retornado
- [ ] UptimeRobot → My Settings → Alert Contacts
- [ ] Add Alert Contact → Telegram
- [ ] Colar Telegram ID
- [ ] Enviar **teste de alerta**
- [ ] Confirmar recebimento no Telegram ✅

#### Slack (opcional)
- [ ] Criar channel `#radarone-alerts` no Slack
- [ ] Configurar Incoming Webhook
- [ ] Copiar Webhook URL
- [ ] UptimeRobot → Add Alert Contact → Slack
- [ ] Colar Webhook URL
- [ ] Enviar teste de alerta
- [ ] Confirmar recebimento no Slack ✅

### 4. Associar Alertas aos Monitores

Para **cada monitor:**
- [ ] Edit Monitor → Alert Contacts to Notify
- [ ] Selecionar: ✅ Email, ✅ Telegram, ✅ Slack
- [ ] Save Changes

### 5. Status Page (opcional)

- [ ] Status Pages → Add New Status Page
- [ ] Name: `RadarOne Status`
- [ ] Selecionar monitores: Frontend, Backend Health
- [ ] Customizar: Logo, cores
- [ ] Copiar URL pública: `https://stats.uptimerobot.com/XXX`
- [ ] Testar acesso à URL ✅

## 🧪 Testes de Validação

### Validar Monitores

- [ ] Todos os monitores aparecem como **Up** (verde)
- [ ] Response times:
  - [ ] Frontend: < 1000ms
  - [ ] Backend Health: < 500ms
  - [ ] Backend API: < 1000ms

### Testar Alertas (IMPORTANTE)

**Método: Pausar monitor temporariamente**

1. Frontend Monitor:
   - [ ] Edit → Pause Monitoring
   - [ ] Aguardar 5-10 minutos
   - [ ] Verificar alerta recebido:
     - [ ] Email ✅
     - [ ] Telegram ✅
     - [ ] Slack ✅
   - [ ] Resume Monitoring

2. Backend Health Monitor:
   - [ ] Repetir processo acima
   - [ ] Confirmar alertas recebidos

**Validar conteúdo dos alertas:**
- [ ] Nome do monitor está correto
- [ ] URL aparece no alerta
- [ ] Timestamp está correto
- [ ] Link para dashboard UptimeRobot funciona

### Validar Status Page

- [ ] Acessar URL pública
- [ ] Monitores aparecem
- [ ] Uptime % correto (deve estar ~100%)
- [ ] Visual customizado está aplicado

## 📊 Métricas Esperadas

### Uptime Target

- **Frontend:** > 99.5%
- **Backend:** > 99.9%
- **Overall:** > 99.5%

### Response Time Target

- **Frontend:** < 1000ms (p95)
- **Backend Health:** < 500ms (p95)
- **Backend API:** < 1000ms (p95)

## ⚠️ Playbook Resumido

### Se receber alerta de DOWNTIME:

**Primeiros 2 minutos:**
1. [ ] Confirmar downtime manualmente (acessar site)
2. [ ] Verificar se é falso positivo

**Se downtime real:**
3. [ ] Abrir Render Dashboard → Logs
4. [ ] Verificar últimos deploys → Events
5. [ ] Identificar causa:
   - Deploy com erro?
   - Variável de ambiente?
   - PostgreSQL down?
   - Plano free dormindo?

**Resolução:**
6. [ ] Redeploy manual (se erro de build)
7. [ ] Corrigir variável de ambiente
8. [ ] Aguardar wake-up (se cold start)
9. [ ] Escalar para Render Support (se problema de infra)

**Comunicação:**
10. [ ] Atualizar Status Page com incident
11. [ ] Notificar usuários (se > 5 min downtime)
12. [ ] Resolver incident após fix
13. [ ] Post-mortem e documentação

## 🔄 Manutenção Mensal

- [ ] Verificar uptime do mês (deve estar > 99.5%)
- [ ] Revisar alertas falsos positivos
- [ ] Ajustar timeouts se necessário
- [ ] Verificar se todos os alertas estão funcionando

## 📞 Contatos de Emergência

| Serviço | URL | Suporte |
|---------|-----|---------|
| Render | dashboard.render.com | support@render.com |
| UptimeRobot | uptimerobot.com | support@uptimerobot.com |
| Status Render | status.render.com | - |

## ✅ Checklist Final

Antes de marcar como concluído:

- [ ] 3 monitores configurados e **Up**
- [ ] Alertas testados e funcionando
- [ ] Telegram notificando corretamente
- [ ] Status page pública acessível
- [ ] Equipe sabe como acessar UptimeRobot
- [ ] Playbook de downtime documentado
- [ ] Contacts de emergência salvos

---

**Setup concluído em:** ___/___/_____
**Responsável:** _______________
**Próxima revisão:** ___/___/_____

---

**Referências:**
- [Setup Completo](./UPTIMEROBOT_SETUP.md)
- [README - Monitoramento](../README.md#-monitoramento-externo---uptimerobot)
