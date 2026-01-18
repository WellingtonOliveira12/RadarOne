# Conexões de Contas - Manual e FAQ

Este documento contém o conteúdo pronto para a UI do RadarOne sobre conexões de contas (sessões de autenticação).

---

## Microcopy para UI

### Títulos e Headers

- **Título da página**: "Conexões"
- **Subtítulo**: "Conecte suas contas para monitorar sites que requerem login"

### Status Labels

| Status | Label PT-BR | Cor | Ícone |
|--------|------------|-----|-------|
| ACTIVE | Conectado | Verde | CheckCircle |
| NEEDS_REAUTH | Reconectar | Laranja | AlertTriangle |
| EXPIRED | Expirado | Vermelho | XCircle |
| INVALID | Inválido | Vermelho | XCircle |
| NOT_CONNECTED | Não conectado | Cinza | Link |

### Botões

- **Conectar pela primeira vez**: "Conectar conta"
- **Atualizar sessão existente**: "Atualizar sessão"
- **Remover sessão**: "Remover"
- **Ajuda**: "Como funciona?"

### Alertas

#### Sessão precisa ser reconectada
```
Título: Ação necessária
Mensagem: O site pediu login novamente. Faça upload de uma nova sessão.
```

#### Sessão expirada
```
Título: Ação necessária
Mensagem: Sua sessão expirou. Faça upload de uma nova sessão.
```

#### Algumas conexões precisam de atenção
```
Título: Algumas conexões precisam de atenção
Mensagem: Reconecte as contas marcadas em laranja para continuar monitorando.
```

### Ao criar Monitor (se não tiver sessão)

```
Título: Conexão necessária
Mensagem: Para monitorar o Mercado Livre, conecte sua conta uma vez.
Link: Como funciona? → /settings/connections
CTA: Conectar conta
```

---

## FAQ - Perguntas Frequentes

### 1. O que é uma sessão?

Uma sessão é um arquivo que contém os cookies do seu navegador após fazer login em um site. Ela permite que o RadarOne acesse o site como se fosse você, sem precisar da sua senha.

**Analogia simples**: É como um crachá de visitante. Quando você faz login, o site te dá um "crachá" (cookies) que prova que você é você. O RadarOne usa esse crachá para entrar no site em seu nome.

### 2. É seguro?

**Sim, por vários motivos:**

1. **Sua senha nunca é compartilhada** - O arquivo de sessão contém apenas cookies, não sua senha
2. **Criptografia de ponta** - Usamos AES-256-GCM, o mesmo padrão usado por bancos
3. **Você tem controle total** - Pode revogar a sessão a qualquer momento
4. **Sessões expiram** - Mesmo que alguém tivesse acesso, a sessão expira automaticamente

**O que NÃO fazemos:**
- Não armazenamos sua senha
- Não fazemos ações em seu nome além de ver anúncios
- Não vendemos ou compartilhamos seus dados

### 3. Quando preciso reconectar?

Você precisará reconectar quando:

- **O site pedir login novamente** - Normalmente a cada 7-30 dias
- **Você mudar sua senha** - A sessão antiga será invalidada
- **O site detectar atividade incomum** - Raro, mas pode acontecer

**Como você saberá?**
- O RadarOne mostra um alerta na página de Conexões
- Você recebe notificação por email/Telegram (se configurado)
- Seus monitores param de funcionar até você reconectar

### 4. Funciona no celular?

**Parcialmente.** Você pode:
- Ver o status das conexões no celular
- Fazer upload de arquivos .json (se já tiver)

**Limitação:** Exportar cookies do navegador mobile é mais difícil. Recomendamos usar um computador para gerar o arquivo de sessão.

### 5. Como exportar o storageState / arquivo de sessão?

#### Opção 1: Extensão de navegador (mais fácil)

1. Instale a extensão **"Export Cookies"** ou **"EditThisCookie"** no Chrome/Edge
2. Faça login no Mercado Livre normalmente
3. Clique na extensão e exporte os cookies como JSON
4. Faça upload do arquivo no RadarOne

#### Opção 2: Playwright CLI (para usuários técnicos)

```bash
# Instala o Playwright
npm install -g playwright

# Abre navegador interativo, você faz login, e ele salva a sessão
npx playwright codegen mercadolivre.com.br --save-storage=storage.json

# Faça upload do arquivo storage.json no RadarOne
```

#### Opção 3: DevTools do navegador (avançado)

1. Faça login no Mercado Livre
2. Abra DevTools (F12) → Application → Cookies
3. Exporte manualmente (mais trabalhoso)

### 6. O que fazer quando aparece "Precisa reconectar"?

1. Vá para **Configurações → Conexões**
2. Clique em **"Atualizar sessão"** no site afetado
3. Faça login novamente no site (Mercado Livre, etc)
4. Exporte os cookies usando uma das opções acima
5. Faça upload do novo arquivo .json

**Dica:** Se isso acontecer com frequência, considere:
- Não deslogar do site no navegador
- Não mudar sua senha com frequência
- Usar o mesmo navegador para gerar sessões

### 7. Por que o Mercado Livre pede login?

O Mercado Livre é um site que requer autenticação para mostrar certos tipos de resultados. Isso acontece porque:

- Algumas categorias são restritas (ex: veículos, imóveis)
- Preços promocionais podem ser personalizados
- Filtros avançados dependem do seu perfil

**Sem sessão:** Você pode monitorar buscas públicas, mas pode perder alguns anúncios.

**Com sessão:** Você tem acesso completo, igual a quando navega logado.

### 8. Posso usar a mesma conta em vários dispositivos?

Sim, mas com cuidado:

- O RadarOne usa SUA sessão para monitorar
- Se você deslogar no navegador, a sessão pode ser invalidada
- Recomendamos: manter o login no navegador e no RadarOne simultaneamente

### 9. O que acontece se eu trocar minha senha?

A sessão atual será invalidada automaticamente pelo site. Você precisará:

1. Fazer login com a nova senha
2. Exportar uma nova sessão
3. Fazer upload no RadarOne

**Dica:** Após trocar a senha, reconecte imediatamente para evitar interrupção nos monitores.

### 10. Posso ter múltiplas contas do mesmo site?

No momento, não. Cada usuário pode ter uma sessão por site. Se você precisa monitorar com múltiplas contas do Mercado Livre, considere criar contas separadas no RadarOne.

---

## Mensagens de Erro e Soluções

### ML_LOGIN_REQUIRED_NO_SESSION

**Causa:** O site exige login, mas você não conectou sua conta.

**Solução:** Vá para Configurações → Conexões e conecte sua conta do Mercado Livre.

### ML_AUTH_SESSION_EXPIRED

**Causa:** A sessão expirou ou foi invalidada pelo site.

**Solução:** Reconecte sua conta fazendo upload de uma nova sessão.

### NEEDS_REAUTH

**Causa:** O site detectou que a sessão não é mais válida.

**Solução:**
1. Faça login normalmente no Mercado Livre pelo navegador
2. Exporte os cookies novamente
3. Faça upload no RadarOne

---

## Variáveis de Ambiente Necessárias

### Backend
```
SESSION_ENCRYPTION_KEY=<chave-de-32-caracteres-ou-mais>
```

### Worker
```
SESSION_ENCRYPTION_KEY=<mesma-chave-do-backend>
```

**Importante:** A chave DEVE ser a mesma no backend e worker para que a criptografia funcione corretamente.

### Render - Start Command (Backend)
```
node scripts/run-migrations-safe.js && node dist/server.js
```

---

## Checklist de Deploy

- [ ] SESSION_ENCRYPTION_KEY configurada no backend
- [ ] SESSION_ENCRYPTION_KEY configurada no worker (mesmo valor)
- [ ] Migration aplicada: `add_user_session_enhancements`
- [ ] Backend buildado com scripts/run-migrations-safe.ts
- [ ] Start command atualizado no Render
