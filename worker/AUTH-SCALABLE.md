# Sistema de Autenticação Escalável - RadarOne

Sistema de autenticação automática para scrapers com sessões persistentes, pool de contas, renovação automática e suporte a MFA.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SESSION MANAGER                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Account   │  │   Session   │  │    Auth     │  │   Circuit   │    │
│  │    Pool     │  │   Storage   │  │   Flows     │  │   Breaker   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                    launchPersistentContext                              │
│                    (userDataDir em disco)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RENDER PERSISTENT DISK                          │
│  /var/data/sessions/                                                    │
│  ├── accounts.json           # Pool de contas (criptografado)          │
│  ├── mercado_livre/                                                     │
│  │   ├── acc_xxx/            # userDataDir da conta 1                  │
│  │   └── acc_yyy/            # userDataDir da conta 2                  │
│  └── superbid/                                                          │
│      └── acc_zzz/            # userDataDir                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Fluxo de Autenticação

```
1. Scraper solicita contexto → sessionManager.getContext('MERCADO_LIVRE')
2. SessionManager seleciona melhor conta do pool
3. Carrega contexto persistente (launchPersistentContext)
4. Valida se sessão está autenticada
5. Se NÃO autenticada:
   a. Executa login automático via AuthFlow
   b. Se MFA necessário:
      - TOTP: gera código automaticamente
      - EMAIL_OTP: aguarda via webhook
      - SMS/APP: marca NEEDS_REAUTH (intervenção manual)
6. Retorna contexto autenticado para o scraper
7. Ao finalizar, scraper chama release()
```

## Configuração Inicial

### 1. Habilitar no Render

```bash
# Variáveis de ambiente no Render
USE_SESSION_MANAGER=true
SCRAPER_ENCRYPTION_KEY=sua-chave-secreta-32-caracteres!

# Se usar Persistent Disk (recomendado):
SESSIONS_DIR=/var/data/sessions
```

### 2. Cadastrar Conta

```bash
cd worker

# Interativo
npx ts-node scripts/auth/manage-accounts.ts add

# Será solicitado:
# - Site: MERCADO_LIVRE
# - Label: ML Principal
# - Username: seuemail@gmail.com
# - Senha: ********
# - MFA Type: TOTP (se configurado)
# - TOTP Secret: JBSWY3DPEHPK3PXP (base32)
# - Prioridade: 10
```

### 3. Verificar Conta

```bash
# Listar contas
npx ts-node scripts/auth/manage-accounts.ts list

# Status detalhado
npx ts-node scripts/auth/manage-accounts.ts status <accountId>
```

## Tipos de MFA Suportados

| Tipo | Automático | Configuração |
|------|------------|--------------|
| NONE | ✅ | Nenhuma |
| TOTP | ✅ | Segredo base32 |
| EMAIL_OTP | ⚠️ Parcial | Webhook necessário |
| SMS_OTP | ❌ | NEEDS_REAUTH |
| APP_APPROVAL | ❌ | NEEDS_REAUTH |

### Configurando TOTP

1. No site (ML), ative autenticação de dois fatores
2. Ao escanear QR code, copie o "segredo" (base32)
3. Cadastre a conta com o segredo:

```bash
npx ts-node scripts/auth/manage-accounts.ts add
# MFA Type: TOTP
# TOTP Secret: JBSWY3DPEHPK3PXP
```

## Estados de Conta

| Status | Descrição | Ação |
|--------|-----------|------|
| `OK` | Funcionando | Nenhuma |
| `DEGRADED` | Falhas intermitentes | Monitorar |
| `NEEDS_REAUTH` | Requer intervenção | Login manual |
| `BLOCKED` | Bloqueada pelo site | Nova conta |
| `SITE_CHANGED` | Site mudou | Atualizar flow |
| `DISABLED` | Desabilitada | Reativar se necessário |

## Operações

### Resetar Status

```bash
npx ts-node scripts/auth/manage-accounts.ts reset <accountId>
```

### Remover Conta

```bash
npx ts-node scripts/auth/manage-accounts.ts remove <accountId>
```

### Adicionar Via API

```typescript
import { sessionManager, MFAType } from './src/auth';

await sessionManager.addAccount({
  site: 'MERCADO_LIVRE',
  credentials: {
    username: 'email@example.com',
    password: 'senha123',
    totpSecret: 'JBSWY3DPEHPK3PXP', // opcional
  },
  mfaType: MFAType.TOTP,
  priority: 10,
});
```

## Logs de Autenticação

```
AUTH_LOAD          → Iniciando carregamento de contexto
AUTH_OK            → Autenticação bem-sucedida
AUTH_RENEW_START   → Iniciando renovação de sessão
AUTH_RENEW_OK      → Renovação bem-sucedida
AUTH_RENEW_FAILED  → Falha na renovação
AUTH_MFA_REQUIRED  → MFA detectado
AUTH_MFA_SOLVED    → MFA resolvido automaticamente
AUTH_MFA_FAILED    → Falha ao resolver MFA
AUTH_BLOCKED       → Conta bloqueada
AUTH_SESSION_EXPIRED → Sessão expirou
```

## Recuperação Automática

O sistema se auto-recupera nas seguintes situações:

1. **Sessão expirada**: Detecta LOGIN_REQUIRED e renova automaticamente
2. **TOTP**: Gera novo código a cada tentativa
3. **Falhas intermitentes**: Tenta até 3x antes de marcar DEGRADED
4. **Pool de contas**: Se uma conta falha, usa outra disponível

## Intervenção Manual

Quando o status é `NEEDS_REAUTH`:

1. **Via Browser Local**:
```bash
# Gera sessão manualmente
npx ts-node scripts/auth/mercadolivre-session.ts
```

2. **Resetar e Tentar Novamente**:
```bash
npx ts-node scripts/auth/manage-accounts.ts reset <accountId>
```

3. **Verificar nos Logs**:
```bash
# No Render, procure por:
AUTH_MFA_REQUIRED
AUTH_RENEW_FAILED
```

## Pool de Contas (Recomendado)

Para alta disponibilidade, configure múltiplas contas:

```bash
# Conta principal (prioridade alta)
npx ts-node scripts/auth/manage-accounts.ts add
# Site: MERCADO_LIVRE, Prioridade: 100

# Conta backup (prioridade média)
npx ts-node scripts/auth/manage-accounts.ts add
# Site: MERCADO_LIVRE, Prioridade: 50

# Conta reserva (prioridade baixa)
npx ts-node scripts/auth/manage-accounts.ts add
# Site: MERCADO_LIVRE, Prioridade: 10
```

O SessionManager automaticamente:
- Usa conta de maior prioridade disponível
- Evita contas com muitas falhas consecutivas
- Distribui carga entre contas

## Circuit Breaker

Se um site tiver 5+ falhas consecutivas:
- Circuit breaker abre
- Aguarda 5 minutos antes de tentar novamente
- Protege contra loops de falha

## Estrutura de Arquivos

```
worker/src/auth/
├── index.ts              # Exportações
├── types.ts              # Tipos e interfaces
├── session-manager.ts    # Gerenciador principal
├── crypto-manager.ts     # Criptografia
├── totp-manager.ts       # Gerador TOTP
├── email-otp-reader.ts   # Leitor OTP email
└── flows/
    └── mercadolivre-flow.ts  # Flow específico ML

worker/scripts/auth/
├── manage-accounts.ts    # CLI gerenciamento
├── generate-session.ts   # Gerador genérico
└── mercadolivre-session.ts # Gerador ML
```

## Migração do Sistema Antigo

Se estava usando `authManager` (storageState base64):

1. O novo sistema é compatível, apenas adicione:
```bash
USE_SESSION_MANAGER=true
```

2. Cadastre a conta:
```bash
npx ts-node scripts/auth/manage-accounts.ts add
```

3. O sistema usará automaticamente sessões persistentes

## Troubleshooting

### "AUTH_NO_ACCOUNT"
- Nenhuma conta cadastrada para o site
- Execute `manage-accounts.ts add`

### "AUTH_CIRCUIT_OPEN"
- Muitas falhas consecutivas
- Aguarde 5 minutos ou verifique status das contas

### "AUTH_NEEDS_REAUTH"
- MFA manual necessário
- Execute `mercadolivre-session.ts` localmente

### "AUTH_BLOCKED"
- Conta bloqueada pelo site
- Cadastre nova conta

### Sessão não persiste entre deploys
- Configure Persistent Disk no Render
- Ou use variável `SESSIONS_DIR` apontando para volume persistente
