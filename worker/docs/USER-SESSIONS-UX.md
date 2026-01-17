# Textos de Produto — Conexão de Contas

Este documento contém os textos finais (não rascunhos) para a funcionalidade de conexão de contas do RadarOne.

---

## 1. MANUAL — MERCADO LIVRE

### Como Conectar sua Conta do Mercado Livre

O Mercado Livre pode exigir login para determinadas buscas. Para que o RadarOne monitore essas buscas corretamente, você precisa conectar sua conta.

#### Quando precisa conectar?

- Buscas em categorias específicas (veículos, imóveis, etc.)
- Buscas com muitos filtros avançados
- Quando o Mercado Livre detecta acesso frequente
- Algumas combinações de região + categoria

#### Como conectar (passo a passo)

**Passo 1: Baixe e execute o script**

No seu computador, abra o terminal e execute:

```bash
npx radarone-session mercadolivre
```

Ou se clonou o repositório:

```bash
npm run session:generate
```

**Passo 2: Faça login normalmente**

Um navegador vai abrir automaticamente:

1. Digite seu email e clique em "Continuar"
2. Digite sua senha e clique em "Entrar"
3. Complete a verificação 2FA se solicitado (SMS, email ou app)
4. Aguarde a página inicial carregar completamente

O script detecta automaticamente quando você terminar.

**Passo 3: Arquivo gerado**

O script cria o arquivo `mercadolivre-session.json` na pasta atual.

**Importante:** Não edite nem compartilhe este arquivo.

**Passo 4: Upload no RadarOne**

1. Acesse o RadarOne e vá em **Configurações → Conexões**
2. Clique em **"Conectar Mercado Livre"**
3. Arraste o arquivo gerado ou clique para selecionar
4. Pronto! Seus monitores vão funcionar.

#### Boa prática: reconectar semanalmente

Os cookies do Mercado Livre expiram periodicamente. Para evitar interrupções:

- **Reconecte sua conta a cada 7 dias**
- Você receberá um aviso quando a sessão estiver próxima de expirar
- Basta repetir o processo (leva menos de 1 minuto)

#### Privacidade e segurança

- **Não armazenamos sua senha** — apenas cookies de sessão
- **Dados criptografados** — AES-256-GCM em repouso
- **Você pode desconectar** a qualquer momento
- **Acesso somente leitura** — apenas buscamos anúncios, não modificamos nada
- **Isolamento por usuário** — sua sessão é só sua

---

## 2. FAQ — PERGUNTAS FREQUENTES

### Por que o Mercado Livre pede login?

O Mercado Livre implementa proteções contra acesso automatizado. Algumas buscas só funcionam quando você está logado. Isso é especialmente comum em:

- Categorias de alto valor (veículos, imóveis)
- Buscas com muitos filtros
- Acessos frequentes do mesmo IP

Conectando sua conta ao RadarOne, seus monitores conseguem acessar essas buscas normalmente.

---

### Com que frequência preciso reconectar?

**Recomendamos reconectar a cada 7 dias.**

Os cookies de sessão têm validade limitada por segurança. Você receberá uma notificação quando a sessão estiver próxima de expirar.

O processo é rápido: execute o script, faça login, faça upload. Menos de 1 minuto.

---

### O que acontece se minha sessão expirar?

1. O monitor é marcado como **"Precisa reconectar"**
2. Ele para de buscar até você reconectar
3. Você recebe um alerta único (não fica spamando)
4. Assim que reconectar, volta a funcionar automaticamente

**Importante:** Sessão expirada **não conta como erro** do sistema. Não afeta estatísticas nem bloqueia outros monitores de outros sites.

---

### Meus dados estão seguros?

**Sim, absolutamente.**

| Aspecto | Proteção |
|---------|----------|
| Senhas | Nunca armazenadas |
| Cookies | Criptografados com AES-256-GCM |
| Acesso | Somente leitura (apenas buscas) |
| Exclusão | Você pode excluir a qualquer momento |
| Isolamento | Cada usuário tem sua própria sessão |

Usamos as mesmas práticas de segurança de bancos e fintechs.

---

### Isso vale para outros sites?

Sim! A mesma infraestrutura funciona para qualquer site que exija login:

| Site | Status |
|------|--------|
| Mercado Livre | ✅ Implementado |
| Superbid/Leilões | ✅ Implementado |
| OLX | ⏳ Em análise (geralmente não precisa) |
| WebMotors | ⏳ Em análise |
| Outros | Conforme demanda |

Cada site que exigir autenticação terá a opção de conectar conta.

---

### Posso usar várias contas do mesmo site?

Atualmente, **uma conta por site por usuário**.

Se você precisa monitorar com contas diferentes (ex: para clientes diferentes), crie perfis separados no RadarOne ou entre em contato para planos enterprise.

---

### E se eu não quiser conectar minha conta?

Você pode continuar usando, mas alguns monitores podem falhar quando o site exigir login. Nesses casos, você verá a mensagem **"Requer conexão"** e pode optar por:

- ✅ Conectar a conta (recomendado)
- ⚠️ Ajustar a busca para uma que não exija login
- ❌ Desativar o monitor

---

### O que significa cada status?

| Status | Significado | Ação |
|--------|------------|------|
| ✅ Conectado | Sessão válida e funcionando | Nenhuma |
| ⚠️ Requer conexão | Site pede login mas você não conectou | Conectar conta |
| 🔄 Precisa reconectar | Sessão expirou | Reconectar conta |
| ❌ Inválido | Arquivo corrompido ou errado | Gerar nova sessão |

---

## 3. MICROCOPY — INTERFACE DO USUÁRIO

### Tela "Criar Monitor"

**Quando site requer login e usuário não tem sessão:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Conexão Necessária                                        │
│                                                              │
│ O Mercado Livre pode exigir login para esta busca.           │
│ Conecte sua conta para garantir que o monitor funcione.      │
│                                                              │
│ [Conectar conta]  [Continuar sem login (?)]                  │
│                                                              │
│ ℹ️ Continuar sem login pode funcionar, mas algumas buscas    │
│    falham quando o site exige autenticação.                  │
└─────────────────────────────────────────────────────────────┘
```

**Botões:**

- **Conectar conta** (primário): Abre modal de conexão
- **Continuar sem login** (secundário): Permite criar mesmo assim, com aviso

**Tooltip do "(?)":**

> Algumas buscas do Mercado Livre funcionam sem login. Se o monitor falhar, você poderá conectar sua conta depois.

---

### Card do Monitor

**Badge quando sem sessão:**

```
┌─────────────────────────────────────────┐
│ 🔗 Requer conexão                        │
└─────────────────────────────────────────┘
Cor: Laranja (#f59e0b)
```

**Badge quando precisa reconectar:**

```
┌─────────────────────────────────────────┐
│ 🔄 Precisa reconectar                    │
└─────────────────────────────────────────┘
Cor: Vermelho (#ef4444)
```

**Tooltip do badge "Requer conexão":**

> Este monitor precisa que você conecte sua conta do Mercado Livre para funcionar. Clique para conectar.

**Tooltip do badge "Precisa reconectar":**

> Sua sessão do Mercado Livre expirou. Reconecte para voltar a receber alertas.

---

### Modal "Conectar Mercado Livre"

```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Conectar Mercado Livre                              [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ① Execute o script                                          │
│    ┌──────────────────────────────────────────────────────┐ │
│    │ npx radarone-session mercadolivre              [📋]  │ │
│    └──────────────────────────────────────────────────────┘ │
│    Um navegador vai abrir para você fazer login.            │
│                                                              │
│ ② Faça login normalmente                                    │
│    Digite seu email, senha e complete a verificação 2FA     │
│    se solicitado. O script detecta automaticamente.         │
│                                                              │
│ ③ Faça upload do arquivo                                    │
│    ┌──────────────────────────────────────────────────────┐ │
│    │                                                       │ │
│    │   📁 Arraste mercadolivre-session.json aqui          │ │
│    │      ou clique para selecionar                        │ │
│    │                                                       │ │
│    └──────────────────────────────────────────────────────┘ │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ 🔒 Seus dados estão seguros                                 │
│    Não armazenamos senhas. Apenas cookies de sessão,        │
│    criptografados e isolados por usuário.                   │
├─────────────────────────────────────────────────────────────┤
│                                         [Cancelar] [Salvar] │
└─────────────────────────────────────────────────────────────┘
```

---

### Mensagens de Feedback

**Upload com sucesso:**

```
✅ Conta conectada com sucesso!
Seus monitores do Mercado Livre já estão funcionando.
```

**Erro: arquivo inválido:**

```
❌ Arquivo inválido
O arquivo não é um storageState válido do Playwright.
Certifique-se de usar o arquivo gerado pelo script.
```

**Erro: site errado:**

```
❌ Arquivo do site errado
Este arquivo parece ser de outro site (ex: OLX).
Por favor, gere uma sessão para o Mercado Livre.
```

**Erro: sessão expirada:**

```
❌ Sessão já expirada
O arquivo contém uma sessão que já expirou.
Execute o script novamente para gerar uma nova sessão.
```

---

### Página de Configurações → Conexões

```
┌─────────────────────────────────────────────────────────────┐
│ 🔗 Conexões de Conta                                         │
│                                                              │
│ Conecte suas contas para monitorar sites que exigem login.  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ MERCADO LIVRE                                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ✅ Conectado                                             │ │
│ │ Última utilização: há 2 horas                            │ │
│ │ Expira em: 5 dias                                        │ │
│ │                                                          │ │
│ │ [Reconectar]  [Desconectar]                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ SUPERBID                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⚠️ Não conectado                                         │ │
│ │ Conecte para monitorar leilões                           │ │
│ │                                                          │ │
│ │ [Conectar conta]                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Notificação de Sessão Expirada (Email/Telegram)

**Assunto do email:**

```
⚠️ [Ação Necessária] Reconecte sua conta do Mercado Livre
```

**Corpo:**

```
Olá!

O monitor "Carros até R$ 50.000 em SP" precisa que você reconecte
sua conta do Mercado Livre.

Isso acontece porque a sessão de login expirou (por segurança,
sessões têm validade limitada).

👉 Acesse as configurações do RadarOne para reconectar:
   https://radarone.com.br/dashboard/settings

O processo leva menos de 1 minuto.

Atenciosamente,
Equipe RadarOne
```

---

## 4. MENSAGENS DE ERRO PADRONIZADAS

| Código | Mensagem para usuário | Mensagem técnica (logs) |
|--------|----------------------|-------------------------|
| `SESSION_REQUIRED` | Este site requer conexão de conta | MONITOR_SKIPPED: Sessão necessária mas não configurada |
| `NEEDS_REAUTH` | Sua sessão expirou. Reconecte sua conta. | USER_SESSION_NEEDS_REAUTH: Sessão marcada como expirada |
| `INVALID_SESSION` | Arquivo de sessão inválido | USER_SESSION_INVALID: Falha ao carregar storageState |
| `WRONG_SITE` | Arquivo do site errado | VALIDATION_ERROR: Cookies não correspondem ao domínio |
| `EXPIRED_FILE` | Sessão já expirada | VALIDATION_ERROR: Cookies expirados no momento do upload |
| `AUTH_ERROR` | Erro de autenticação detectado | MONITOR_AUTH_ERROR: Site retornou LOGIN_REQUIRED |

---

## 5. COPY PARA ONBOARDING

**Tooltip no primeiro monitor criado:**

> 💡 **Dica:** Se seu monitor não encontrar resultados, pode ser que o site esteja pedindo login. Vá em Configurações → Conexões para conectar sua conta.

**Banner na dashboard quando tem monitor com problema de sessão:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Ação necessária                                           │
│                                                              │
│ 2 monitores precisam de atenção:                             │
│ • "Carros SP" - Requer conexão                               │
│ • "Imóveis RJ" - Precisa reconectar                          │
│                                                              │
│ [Resolver agora →]                                           │
└─────────────────────────────────────────────────────────────┘
```
