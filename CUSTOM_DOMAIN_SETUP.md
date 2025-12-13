# Configuração de Domínio Customizado - RadarOne

**Data:** 12/12/2025
**Objetivo:** Configurar domínio próprio para o RadarOne em produção

---

## 🎯 Visão Geral

Após deploy no Render, você terá URLs temporárias:
```
Frontend: https://radarone-frontend.onrender.com
Backend:  https://radarone-backend.onrender.com
```

Para usar domínio próprio (ex: `radarone.com.br`), siga este guia.

---

## 📋 Pré-requisitos

- [ ] Domínio registrado (Registro.br, GoDaddy, Namecheap, etc.)
- [ ] Acesso ao painel DNS do domínio
- [ ] Deploy do Render finalizado
- [ ] SSL automático do Render ativo

---

## 🌐 Opção 1: Domínio Principal (Recomendado)

### Frontend: `radarone.com.br` ou `www.radarone.com.br`
### Backend: `api.radarone.com.br`

### Passo 1: Configurar DNS

No painel do seu provedor de domínio, adicione estes registros DNS:

```
# Frontend (www)
Type: CNAME
Name: www
Value: radarone-frontend.onrender.com
TTL: 3600 (ou automático)

# Frontend (raiz - apex domain)
Type: A ou ALIAS*
Name: @
Value: 216.24.57.1 (IP do Render - verificar docs)
TTL: 3600

# Backend API
Type: CNAME
Name: api
Value: radarone-backend.onrender.com
TTL: 3600
```

**Importante:** Alguns provedores não suportam CNAME no apex (@). Nesse caso:
- Use A record apontando para IP do Render
- Ou use ALIAS (Cloudflare, Route53)
- Ou force `www.radarone.com.br` e redirecione raiz para `www`

### Passo 2: Configurar no Render

#### Frontend Static Site
1. Dashboard Render → radarone-frontend → Settings
2. Custom Domains → Add Custom Domain
3. Digite: `radarone.com.br` e `www.radarone.com.br`
4. Aguarde propagação DNS (~5 min a 48h)
5. SSL será gerado automaticamente (Let's Encrypt)

#### Backend Web Service
1. Dashboard Render → radarone-backend → Settings
2. Custom Domains → Add Custom Domain
3. Digite: `api.radarone.com.br`
4. Aguarde propagação DNS
5. SSL automático

### Passo 3: Atualizar Variáveis de Ambiente

#### Backend (.env)
```bash
PUBLIC_URL=https://api.radarone.com.br
FRONTEND_URL=https://radarone.com.br
```

#### Frontend (.env)
```bash
VITE_API_URL=https://api.radarone.com.br
```

#### Render Dashboard
1. Vá em Settings → Environment
2. Atualize as variáveis acima
3. Clique em "Save Changes"
4. Redeploy automático acontecerá

### Passo 4: Validar

```bash
# Frontend
curl -I https://radarone.com.br
# Deve retornar: 200 OK, SSL/TLS válido

# Backend
curl https://api.radarone.com.br/health
# Deve retornar: {"status":"ok","database":"connected"}

# CORS
# Acesse o frontend e teste login
# Não deve dar erro de CORS
```

---

## 🌐 Opção 2: Subdomínios Render (Sem domínio próprio)

Se NÃO tiver domínio próprio ainda, use os subdomínios padrão do Render:

```
Frontend: https://radarone-frontend.onrender.com
Backend:  https://radarone-backend.onrender.com
```

### Configuração:

#### Backend (.env)
```bash
PUBLIC_URL=https://radarone-backend.onrender.com
FRONTEND_URL=https://radarone-frontend.onrender.com
```

#### Frontend (.env)
```bash
VITE_API_URL=https://radarone-backend.onrender.com
```

**Vantagens:**
- ✅ SSL automático
- ✅ Não precisa configurar DNS
- ✅ Funciona imediatamente

**Desvantagens:**
- ❌ Não é profissional para vendas
- ❌ Nome genérico do Render
- ❌ Difícil de lembrar

---

## 🔒 Certificado SSL

### Verificação SSL

```bash
# Verificar certificado
openssl s_client -connect radarone.com.br:443 -servername radarone.com.br

# Ou use ferramentas online:
# https://www.ssllabs.com/ssltest/
```

### Renovação Automática

O Render renova certificados Let's Encrypt automaticamente a cada 90 dias.
Você não precisa fazer nada.

---

## 🚨 Troubleshooting

### Problema: DNS não propaga

**Sintomas:** Domínio não resolve, erro "DNS_PROBE_FINISHED_NXDOMAIN"

**Solução:**
```bash
# Verificar propagação DNS
dig radarone.com.br
dig www.radarone.com.br
dig api.radarone.com.br

# Verificar com DNS público do Google
dig @8.8.8.8 radarone.com.br

# Aguardar propagação (pode levar até 48h)
```

### Problema: SSL não ativa

**Sintomas:** "Não é possível estabelecer conexão segura"

**Solução:**
1. Aguardar propagação DNS completar
2. Render só gera SSL após DNS resolver
3. Verificar no Render Dashboard se status é "Active"
4. Forçar regeneração: Settings → Custom Domains → Refresh

### Problema: CORS error

**Sintomas:** "Access-Control-Allow-Origin" error no console

**Solução:**
```bash
# Verificar FRONTEND_URL no backend
# Deve ser exatamente igual ao domínio do frontend

# Backend .env
FRONTEND_URL=https://radarone.com.br  # ✅ CORRETO
FRONTEND_URL=http://radarone.com.br   # ❌ ERRADO (http)
FRONTEND_URL=https://radarone.com.br/ # ❌ ERRADO (barra final)

# Redeploy backend após corrigir
```

### Problema: Emails com link errado

**Sintomas:** Links nos emails apontam para localhost

**Solução:**
```bash
# Verificar FRONTEND_URL no backend .env
# Emails usam esta variável para gerar links

# Deve estar em produção:
FRONTEND_URL=https://radarone.com.br

# Testar enviando email de reset de senha
# Link deve apontar para https://radarone.com.br/reset-password?token=...
```

---

## 📊 Checklist Final

### Antes do Go-Live

- [ ] Domínio registrado e pago
- [ ] DNS configurado (CNAME/A records)
- [ ] Domínio adicionado no Render
- [ ] SSL ativo (certificado verde)
- [ ] Variáveis de ambiente atualizadas
- [ ] Frontend acessível via domínio
- [ ] Backend API funcionando
- [ ] CORS sem erros
- [ ] Emails com links corretos
- [ ] Testes E2E passando

### Validações Técnicas

```bash
# 1. Frontend carrega
curl -I https://radarone.com.br
# Esperado: 200 OK

# 2. Backend health check
curl https://api.radarone.com.br/health
# Esperado: {"status":"ok"}

# 3. Login funciona (testar manualmente no browser)

# 4. Email de reset funciona (testar reset de senha)
# Link deve ser: https://radarone.com.br/reset-password?token=...

# 5. SSL válido (navegador mostra cadeado verde)
```

---

## 💰 Custos

### Domínio .com.br
- Registro.br: ~R$ 40/ano
- GoDaddy: ~R$ 50/ano
- Namecheap: ~$12/ano (~R$ 60/ano)

### Render (Hosting)
- Frontend Static Site: GRÁTIS
- Backend + DB + Worker: $21/mês (Starter plan)

**Total estimado:** R$ 40-60/ano (domínio) + $21/mês (hosting)

---

## 🎯 Recomendação

Para o lançamento do RadarOne, recomendo:

### Cenário 1: Tem domínio
```
✅ Frontend: https://radarone.com.br
✅ Backend:  https://api.radarone.com.br
```

### Cenário 2: Sem domínio (início)
```
⚠️ Frontend: https://radarone-frontend.onrender.com
⚠️ Backend:  https://radarone-backend.onrender.com

Migrar para domínio próprio em 1-2 semanas
```

---

## 📚 Links Úteis

- **Registro.br** (domínio .br): https://registro.br
- **Render Custom Domains**: https://render.com/docs/custom-domains
- **SSL Labs** (teste SSL): https://www.ssllabs.com/ssltest/
- **DNS Checker**: https://dnschecker.org
- **Cloudflare** (DNS gratuito): https://www.cloudflare.com

---

**Documento criado:** 12/12/2025
**Para:** RadarOne (vendedores de iPhone e revendedores)
**Próximo passo:** Escolher domínio → Configurar DNS → Deploy
