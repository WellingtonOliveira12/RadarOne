# 🔐 API de Reset de Senha - RadarOne

Documentação completa do fluxo de recuperação/reset de senha do RadarOne.

---

## 📋 Visão Geral

O fluxo de reset de senha permite que usuários que esqueceram sua senha possam criar uma nova de forma segura, através de um link temporário enviado por e-mail.

### Fluxo Completo:

```
1. Usuário solicita reset → POST /api/auth/forgot-password
2. Sistema envia e-mail com link contendo token JWT (válido por 30 min)
3. Usuário clica no link e é redirecionado para: ${FRONTEND_URL}/reset-password?token=...
4. Frontend exibe formulário para nova senha
5. Usuário submete nova senha → POST /api/auth/reset-password
6. Sistema valida token e atualiza senha
7. E-mail de confirmação é enviado
```

---

## 🔑 Endpoints

### 1️⃣ Solicitar Reset de Senha

**Endpoint:** `POST /api/auth/forgot-password`

**Descrição:** Solicita link de recuperação de senha por e-mail.

#### Request

**Headers:**
```http
Content-Type: application/json
```

**Body:**
```json
{
  "email": "usuario@exemplo.com"
}
```

#### Response

**Status Code:** `200 OK` *(sempre, mesmo se email não existir - segurança)*

**Body:**
```json
{
  "message": "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha."
}
```

#### Exemplo cURL

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@exemplo.com"}'
```

#### Comportamento Especial:

- ✅ **Email cadastrado:** Envia e-mail com link de reset
- ✅ **Email não cadastrado:** Retorna mensagem genérica (não revela existência do email)
- ✅ **Usuário bloqueado:** Retorna mensagem genérica (não envia email)
- ⚠️ **Token JWT:** Válido por **30 minutos**
- 🔒 **Segurança:** Nunca revela se o email existe ou não no sistema

---

### 2️⃣ Resetar Senha

**Endpoint:** `POST /api/auth/reset-password`

**Descrição:** Redefine a senha do usuário usando o token recebido por e-mail.

#### Request

**Headers:**
```http
Content-Type: application/json
```

**Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "NovaSenhaForte123"
}
```

#### Response - Sucesso

**Status Code:** `200 OK`

**Body:**
```json
{
  "message": "Senha redefinida com sucesso. Você já pode fazer login com a nova senha."
}
```

#### Response - Erros

| Código | Motivo | Resposta |
|--------|--------|----------|
| `400` | Token ou senha faltando | `{"error": "Token e nova senha são obrigatórios"}` |
| `400` | Senha muito curta | `{"error": "A senha deve ter no mínimo 8 caracteres"}` |
| `401` | Token expirado | `{"error": "Link de recuperação expirado. Solicite um novo link."}` |
| `401` | Token inválido | `{"error": "Link de recuperação inválido"}` |
| `401` | Token não é de reset | `{"error": "Token inválido para esta operação"}` |
| `404` | Usuário não encontrado | `{"error": "Usuário não encontrado"}` |
| `403` | Usuário bloqueado | `{"error": "Usuário bloqueado. Entre em contato com o suporte"}` |

#### Exemplo cURL

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "NovaSenhaForte123"
  }'
```

#### Validações:

- ✅ Senha mínima: **8 caracteres**
- ✅ Token JWT válido e não expirado
- ✅ Token deve ter `type: 'password_reset'`
- ✅ Usuário deve existir e não estar bloqueado

---

## 🔐 Estrutura do Token JWT

O token de reset é um JWT com o seguinte payload:

```json
{
  "sub": "user_id_aqui",
  "type": "password_reset",
  "iat": 1234567890,
  "exp": 1234569690
}
```

**Campos:**
- `sub`: ID do usuário (userId)
- `type`: Tipo do token (deve ser exatamente `"password_reset"`)
- `iat`: Timestamp de criação
- `exp`: Timestamp de expiração (30 minutos após criação)

**Secret:** Usa `PASSWORD_RESET_SECRET` se configurada, caso contrário usa `JWT_SECRET`.

---

## 📧 E-mails Enviados

### 1. E-mail de Reset de Senha

**Quando:** Após solicitar reset com email válido
**Assunto:** `Recuperação de senha - RadarOne`
**Conteúdo:** Link para `${FRONTEND_URL}/reset-password?token={token}`

**Exemplo do Link:**
```
http://localhost:5173/reset-password?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. E-mail de Confirmação

**Quando:** Após reset bem-sucedido
**Assunto:** `Senha alterada com sucesso - RadarOne`
**Conteúdo:** Confirma que a senha foi alterada e alerta caso não tenha sido o usuário

---

## 🖥️ Implementação no Frontend

### Página: `/reset-password`

O frontend deve criar uma página que:

1. **Lê o token da URL** (`?token=...`)
2. **Valida se o token existe**
3. **Exibe formulário** com campo de nova senha
4. **Submete para API** `POST /api/auth/reset-password`
5. **Mostra mensagens** de sucesso/erro

#### Exemplo (React/Next.js):

```tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Validar se token existe
  useEffect(() => {
    if (!token) {
      setError('Link inválido ou expirado');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('http://localhost:3000/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        // Redirecionar para login após 3 segundos
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        setError(data.error || 'Erro ao redefinir senha');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <div className="error">Link inválido ou expirado</div>;
  }

  return (
    <div className="reset-password-page">
      <h1>Redefinir Senha</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Nova senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Processando...' : 'Redefinir Senha'}
        </button>
      </form>

      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

---

## ⚙️ Configuração

### Variáveis de Ambiente

Adicione ao `.env`:

```bash
# Secret para tokens de reset (OPCIONAL mas RECOMENDADO)
# Se não configurada, usa JWT_SECRET
PASSWORD_RESET_SECRET=your-password-reset-secret-here

# URL do frontend (para gerar links de reset)
FRONTEND_URL=http://localhost:5173

# Email service (Resend)
RESEND_API_KEY=re_your_api_key
EMAIL_FROM=RadarOne <noreply@radarone.com.br>
```

### Tempo de Expiração

O token de reset expira em **30 minutos**. Isso está hardcoded no controller:

```typescript
jwt.sign(payload, secret, { expiresIn: '30m' })
```

Para alterar, edite `src/controllers/auth.controller.ts` na linha do `requestPasswordReset`.

---

## 🧪 Testes

### 1. Teste Manual - Forgot Password

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@exemplo.com"}'
```

**Esperado:**
- Status 200
- Mensagem genérica (não revela se email existe)
- Se email existir: log no servidor + email enviado

### 2. Teste Manual - Reset Password

```bash
# Primeiro, pegue o token do email ou dos logs do servidor
# Depois:

curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "SEU_TOKEN_AQUI",
    "password": "NovaSenhaForte123"
  }'
```

**Esperado:**
- Status 200
- Mensagem de sucesso
- E-mail de confirmação enviado
- Senha atualizada no banco

### 3. Teste de Login Após Reset

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "NovaSenhaForte123"
  }'
```

**Esperado:**
- Login bem-sucedido
- Token JWT retornado

---

## 🔒 Considerações de Segurança

### Implementadas:

✅ **Não revela existência de email** - Sempre retorna mensagem genérica
✅ **Token JWT com expiração** - 30 minutos de validade
✅ **Tipo de token validado** - Só aceita tokens com `type: 'password_reset'`
✅ **Hash bcrypt** - Senha armazenada com bcrypt (10 rounds)
✅ **Email de confirmação** - Notifica usuário após alteração
✅ **Validação de senha** - Mínimo 8 caracteres
✅ **Usuários bloqueados** - Não recebem email de reset

### Recomendações Adicionais:

⚠️ **Rate Limiting** - Implementar limite de tentativas (ex: 5 tentativas/hora por IP)
⚠️ **CAPTCHA** - Adicionar em produção para prevenir automação
⚠️ **2FA** - Considerar autenticação de dois fatores para reset
⚠️ **Logs de segurança** - Registrar todas as tentativas de reset
⚠️ **Secret separada** - Usar `PASSWORD_RESET_SECRET` diferente de `JWT_SECRET`

---

## 📝 Changelog

### v1.0.0 - 2024-12-11
- ✅ Implementação inicial do fluxo de reset de senha
- ✅ Endpoints `/forgot-password` e `/reset-password`
- ✅ Integração com serviço de email (Resend)
- ✅ Validação de token JWT
- ✅ E-mails transacionais (reset + confirmação)
- ✅ Documentação completa

---

## 🤝 Suporte

Para dúvidas ou problemas:
- 📧 Email: contato@radarone.com.br
- 📖 Documentação: `/backend/RESET_PASSWORD_API.md`
- 🐛 Issues: GitHub do projeto
