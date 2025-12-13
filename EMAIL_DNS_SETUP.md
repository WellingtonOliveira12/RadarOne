# Configuração DNS para Emails Profissionais - RadarOne

**Data:** 12/12/2025
**Objetivo:** Garantir que emails do RadarOne não caiam em SPAM

---

## 🎯 Por que configurar SPF, DKIM e DMARC?

Sem estes registros DNS:
- ❌ Emails caem em SPAM
- ❌ Gmail/Outlook bloqueiam
- ❌ Baixa taxa de entrega (~50%)

Com estes registros DNS:
- ✅ Emails chegam na caixa de entrada
- ✅ Taxa de entrega alta (~98%)
- ✅ Confiabilidade profissional

---

## 📋 Pré-requisitos

- [ ] Domínio registrado (ex: `radarone.com.br`)
- [ ] Acesso ao painel DNS
- [ ] Conta Resend criada (https://resend.com)
- [ ] Domínio verificado no Resend

---

## 🔧 Passo 1: Adicionar Domínio no Resend

### 1.1 Acessar Painel Resend

1. Login em https://resend.com
2. Dashboard → Domains
3. Clique em "Add Domain"

### 1.2 Adicionar Domínio

```
Domain: radarone.com.br
```

**Importante:** Use apenas o domínio raiz (sem `www` ou `https://`)

### 1.3 Copiar Registros DNS

Após adicionar, o Resend fornecerá 3 registros DNS:

#### Registro 1: SPF (TXT)
```
Type: TXT
Name: radarone.com.br (ou @)
Value: v=spf1 include:_spf.resend.com ~all
TTL: 3600
```

#### Registro 2: DKIM (TXT)
```
Type: TXT
Name: resend._domainkey.radarone.com.br
Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
TTL: 3600
```

#### Registro 3: DMARC (TXT)
```
Type: TXT
Name: _dmarc.radarone.com.br
Value: v=DMARC1; p=none; rua=mailto:dmarc@radarone.com.br
TTL: 3600
```

**Nota:** Os valores DKIM são únicos para cada domínio. Use os fornecidos pelo Resend!

---

## 🌐 Passo 2: Configurar DNS

Acesse o painel DNS do seu provedor de domínio:

### Registro.br (Domínios .br)

1. Acesse https://registro.br → Login
2. Meus Domínios → `radarone.com.br` → Editar Zona
3. Adicione os 3 registros TXT:

```
# SPF
Tipo: TXT
Nome: radarone.com.br
Conteúdo: v=spf1 include:_spf.resend.com ~all
TTL: 3600

# DKIM
Tipo: TXT
Nome: resend._domainkey
Conteúdo: v=DKIM1; k=rsa; p=[copiar do Resend]
TTL: 3600

# DMARC
Tipo: TXT
Nome: _dmarc
Conteúdo: v=DMARC1; p=none; rua=mailto:dmarc@radarone.com.br
TTL: 3600
```

4. Salvar alterações

### GoDaddy

1. Acesse https://dcc.godaddy.com → DNS
2. Adicionar → Tipo TXT
3. Nome: deixe vazio (para SPF) ou `resend._domainkey` (DKIM)
4. Valor: copiar do Resend
5. TTL: 3600
6. Salvar

### Cloudflare

1. Dashboard → DNS → Add record
2. Type: TXT
3. Name: @ (SPF) ou resend._domainkey (DKIM)
4. Content: copiar do Resend
5. TTL: Auto
6. Proxy status: DNS only (nuvem cinza)
7. Save

---

## ✅ Passo 3: Verificar Configuração

### 3.1 Aguardar Propagação

DNS pode levar de 5 minutos a 48 horas para propagar.
Geralmente: ~30 minutos

### 3.2 Verificar no Resend

1. Dashboard → Domains
2. Ao lado do seu domínio, clique em "Verify"
3. Aguarde status: ✅ **Verified**

### 3.3 Testar Manualmente

```bash
# Verificar SPF
dig TXT radarone.com.br

# Verificar DKIM
dig TXT resend._domainkey.radarone.com.br

# Verificar DMARC
dig TXT _dmarc.radarone.com.br
```

### 3.4 Ferramentas Online

- **MXToolbox**: https://mxtoolbox.com/SuperTool.aspx
- **DMARC Analyzer**: https://www.dmarcanalyzer.com/dmarc/dmarc-record-check/
- **DKIM Validator**: https://dkimcore.org/tools/

---

## 📧 Passo 4: Atualizar Email no RadarOne

### 4.1 Atualizar .env do Backend

```bash
# Antes (desenvolvimento)
EMAIL_FROM=RadarOne <noreply@resend.dev>

# Depois (produção)
EMAIL_FROM=RadarOne <noreply@radarone.com.br>
EMAIL_REPLY_TO=contato@radarone.com.br
ADMIN_NOTIFICATIONS_EMAIL=admin@radarone.com.br
```

### 4.2 Redeploy Backend

No Render:
1. Settings → Environment
2. Atualizar EMAIL_FROM
3. Save Changes (redeploy automático)

---

## 🧪 Passo 5: Testar Envio de Email

### Teste 1: Email de Boas-vindas

```bash
# Registrar novo usuário
1. Acesse https://radarone.com.br/register
2. Preencha dados
3. Clique em "Criar conta"
4. Verifique email na caixa de entrada (não SPAM!)
```

### Teste 2: Email de Reset de Senha

```bash
1. Acesse https://radarone.com.br/forgot-password
2. Digite email
3. Verifique email recebido
4. Link deve funcionar corretamente
```

### Teste 3: Verificar Headers do Email

1. Abra email recebido
2. Gmail: Três pontinhos → Mostrar original
3. Procure por:
   ```
   SPF: PASS
   DKIM: PASS
   DMARC: PASS
   ```

Exemplo esperado:
```
Received-SPF: pass (google.com: domain of noreply@radarone.com.br designates ... as permitted sender)
Authentication-Results: mx.google.com;
       dkim=pass header.i=@radarone.com.br
       spf=pass smtp.mailfrom=radarone.com.br
       dmarc=pass (p=NONE sp=NONE dis=NONE)
```

---

## 🔒 Configurações Avançadas

### DMARC com Política Restritiva

Após validar que emails estão funcionando (1-2 semanas), ajuste DMARC:

```
# Inicialmente (relaxado)
v=DMARC1; p=none; rua=mailto:dmarc@radarone.com.br

# Depois de 2 semanas (quarentena)
v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@radarone.com.br

# Produção final (rejeitar)
v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@radarone.com.br
```

**Explicação:**
- `p=none`: Apenas monitora (não bloqueia)
- `p=quarantine`: Envia para SPAM se falhar
- `p=reject`: Bloqueia completamente se falhar
- `pct=10`: Aplica política em 10% dos emails (teste gradual)

### Relatórios DMARC

Configure email para receber relatórios:

```
v=DMARC1; p=none; rua=mailto:dmarc-reports@radarone.com.br; ruf=mailto:dmarc-forensic@radarone.com.br
```

- `rua`: Relatórios agregados diários
- `ruf`: Relatórios forenses (individual)

**Ferramentas para analisar relatórios:**
- https://www.dmarcanalyzer.com
- https://postmarkapp.com/dmarc

---

## 🚨 Troubleshooting

### Problema: Email cai em SPAM

**Causa:** SPF/DKIM/DMARC não configurados ou incorretos

**Solução:**
```bash
# 1. Verificar registros DNS
dig TXT radarone.com.br
dig TXT resend._domainkey.radarone.com.br
dig TXT _dmarc.radarone.com.br

# 2. Aguardar propagação (até 48h)

# 3. Verificar no Resend se domínio está "Verified"

# 4. Testar com https://www.mail-tester.com
```

### Problema: DKIM FAIL

**Causa:** Registro DKIM copiado incorretamente ou incompleto

**Solução:**
```
# Copiar EXATAMENTE do Resend
# Não adicionar espaços
# Não quebrar linha
# Verificar aspas
```

### Problema: SPF FAIL

**Causa:** Registro SPF incorreto ou faltando include

**Solução:**
```bash
# CORRETO
v=spf1 include:_spf.resend.com ~all

# ERRADO (faltando include)
v=spf1 ~all

# ERRADO (hard fail sem include)
v=spf1 -all
```

### Problema: DMARC não funciona

**Causa:** Email no `rua=` não existe

**Solução:**
```bash
# Criar email dmarc@radarone.com.br
# Ou usar email existente:
v=DMARC1; p=none; rua=mailto:contato@radarone.com.br
```

---

## 📊 Checklist Final

### Antes de Lançar

- [ ] Domínio adicionado no Resend
- [ ] SPF configurado no DNS
- [ ] DKIM configurado no DNS
- [ ] DMARC configurado no DNS
- [ ] DNS propagado (verificar com dig)
- [ ] Domínio verified no Resend
- [ ] EMAIL_FROM atualizado no .env
- [ ] Backend redesployado
- [ ] Email de teste enviado
- [ ] Email chegou na caixa de entrada (não SPAM)
- [ ] Headers mostram SPF/DKIM/DMARC PASS

### Validações Técnicas

```bash
# 1. SPF
dig TXT radarone.com.br | grep spf1
# Esperado: v=spf1 include:_spf.resend.com ~all

# 2. DKIM
dig TXT resend._domainkey.radarone.com.br | grep DKIM
# Esperado: v=DKIM1; k=rsa; p=MIGf...

# 3. DMARC
dig TXT _dmarc.radarone.com.br | grep DMARC
# Esperado: v=DMARC1; p=none; rua=...

# 4. Teste completo
# Enviar email → Verificar headers → Todos PASS
```

---

## 💡 Dicas Importantes

### Para Aumentar Taxa de Entrega

1. **Warm-up de IP (Resend faz automaticamente)**
   - Envie poucos emails nos primeiros dias
   - Aumente gradualmente

2. **Evite palavras de SPAM**
   - "Grátis", "Ganhe dinheiro", "Clique aqui"
   - Muitos pontos de exclamação!!!

3. **Mantenha lista limpa**
   - Remove emails que retornam erro (bounce)
   - Não envie para quem não pediu

4. **Monitore métricas**
   - Taxa de abertura: >20%
   - Taxa de clique: >2%
   - Taxa de bounce: <5%
   - Taxa de spam: <0.1%

### Resend Dashboard - Métricas

Acesse: https://resend.com/emails

Monitore:
- Sent (enviados)
- Delivered (entregues)
- Bounced (rejeitados)
- Complained (marcados como spam)

---

## 📚 Links Úteis

- **Resend Docs**: https://resend.com/docs
- **SPF Record Generator**: https://www.spfwizard.net
- **DMARC Analyzer**: https://www.dmarcanalyzer.com
- **MXToolbox**: https://mxtoolbox.com
- **Mail Tester**: https://www.mail-tester.com

---

**Documento criado:** 12/12/2025
**Para:** RadarOne (vendedores de iPhone e revendedores)
**Próximo passo:** Configurar após adquirir domínio
**Status:** 🔄 Aguardando domínio em produção
