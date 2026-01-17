# Opção B — Conexão via Browser Remoto (Zero Terminal)

Este documento descreve a arquitetura planejada para permitir que usuários conectem suas contas **sem precisar de terminal ou conhecimento técnico**.

## Status: ARQUITETURA PRONTA / NÃO IMPLEMENTADO

A infraestrutura de código (interfaces, providers) já está preparada. A implementação real aguarda validação de custos e demanda.

---

## 1. VISÃO GERAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUXO OPÇÃO B: BROWSER REMOTO                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USUÁRIO                  BACKEND                  PLAYWRIGHT SERVER         │
│  ┌──────┐                ┌──────┐                 ┌──────────────────┐       │
│  │      │ 1. Clica       │      │ 2. Cria link    │                  │       │
│  │ [Btn]│───────────────►│ API  │────────────────►│ Browserless.io   │       │
│  │      │ "Conectar"     │      │ único + token   │ ou self-hosted   │       │
│  └──────┘                └──────┘                 └──────────────────┘       │
│     │                        │                           │                   │
│     │                        │ 3. Redireciona            │                   │
│     │◄───────────────────────┘    para /session/{token}  │                   │
│     │                                                    │                   │
│     │ 4. Usuário vê browser                              │                   │
│     │    remoto em iframe      5. WebSocket streaming    │                   │
│     │◄──────────────────────────────────────────────────►│                   │
│     │                                                    │                   │
│     │ 6. Faz login normal                                │                   │
│     │────────────────────────────────────────────────────►│                   │
│     │                                                    │                   │
│     │                        │ 7. Detecta login OK       │                   │
│     │                        │◄──────────────────────────┤                   │
│     │                        │                           │                   │
│     │                        │ 8. storageState()         │                   │
│     │                        │◄──────────────────────────┤                   │
│     │                        │                           │                   │
│     │                        │ 9. Salva em UserSession   │                   │
│     │                        │    (criptografado)        │                   │
│     │                        │                           │                   │
│     │ 10. "Sucesso!"         │                           │                   │
│     │◄───────────────────────┤                           │                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. COMPONENTES

### 2.1 Frontend

**Novo componente: `RemoteBrowserModal`**

```tsx
// Abre iframe com browser remoto
// Comunica via postMessage com backend
// Exibe feedback em tempo real

interface RemoteBrowserModalProps {
  site: 'MERCADO_LIVRE' | 'SUPERBID';
  onSuccess: () => void;
  onError: (error: string) => void;
}
```

### 2.2 Backend API

**Novos endpoints:**

```typescript
// Cria sessão de browser remoto
POST /api/sessions/remote/start
Request: { site: string }
Response: {
  sessionId: string,
  token: string,        // JWT com TTL de 10min
  browserUrl: string,   // URL do iframe
  expiresAt: Date
}

// Verifica status da sessão
GET /api/sessions/remote/:sessionId/status
Response: {
  status: 'waiting' | 'in_progress' | 'success' | 'expired' | 'error',
  message?: string
}

// Cancela sessão
DELETE /api/sessions/remote/:sessionId
```

### 2.3 Playwright Server

**Opções de infraestrutura:**

| Opção | Prós | Contras | Custo estimado |
|-------|------|---------|----------------|
| **Browserless.io** | Managed, fácil setup | Custo por minuto | ~$50/mês (5k sessões) |
| **Self-hosted** | Controle total, mais barato | Manutenção, scaling | ~$30/mês (VPS 4GB) |
| **Fly.io Machines** | Pay-per-use, auto-scale | Complexidade | Variável |

---

## 3. SEGURANÇA

### Token JWT

```typescript
interface RemoteSessionToken {
  sessionId: string;
  userId: string;
  site: string;
  iat: number;
  exp: number;  // 10 minutos
}
```

### Proteções

- **TTL curto**: Link expira em 10 minutos
- **Single-use**: Token invalidado após uso
- **Isolamento**: Cada sessão em container separado
- **No credential storage**: Apenas cookies salvos
- **Cleanup automático**: Browser fechado após 15min de inatividade

---

## 4. INTERFACE PREPARADA (JÁ IMPLEMENTADA)

O `SessionProvider` em `src/services/session-provider.ts` já possui:

```typescript
// Provider abstrato já preparado
class RemoteBrowserProvider implements SessionProvider {
  name = 'RemoteBrowserProvider';
  priority = 90;  // Prioridade entre UserUpload (100) e TechnicalPool (50)

  async isAvailable(userId: string, site: string): Promise<boolean> {
    // TODO: Verificar se existe sessão remota ativa
    return false;  // Desabilitado por enquanto
  }

  async getContext(userId: string, site: string): Promise<SessionContextResult> {
    // TODO: Conectar ao Browserless via WebSocket
    // TODO: Retornar contexto com streaming
    return {
      success: false,
      source: 'remote_browser',
      error: 'RemoteBrowserProvider não implementado ainda',
      cleanup: async () => {},
    };
  }
}
```

### Para implementar

1. Criar endpoint `/api/sessions/remote/start`
2. Integrar com Browserless.io ou similar
3. Implementar WebSocket bridge para streaming
4. Criar componente React para iframe
5. Implementar detecção de login no Playwright
6. Salvar storageState quando detectar sucesso

---

## 5. ESTIMATIVA DE CUSTOS

### Browserless.io (managed)

| Plano | Sessões/mês | Custo |
|-------|-------------|-------|
| Starter | 1.000 | $29/mês |
| Growth | 5.000 | $99/mês |
| Scale | 25.000 | $399/mês |

**Custo por sessão:** ~$0.02-0.03

### Self-hosted (Fly.io)

| Recurso | Especificação | Custo |
|---------|--------------|-------|
| Machine | 2 vCPU, 4GB RAM | ~$0.02/hora |
| Storage | 10GB SSD | ~$1/mês |
| Bandwidth | 100GB | Incluído |

**Custo por sessão:** ~$0.01 (assumindo 5min/sessão)

### Projeção para 1.000 usuários

```
Sessões/mês = 1.000 usuários × 2 conexões/mês = 2.000 sessões
Custo Browserless = ~$60/mês
Custo Self-hosted = ~$40/mês (VPS dedicada)
```

---

## 6. TIMELINE SUGERIDA

| Fase | Descrição | Esforço |
|------|-----------|---------|
| 1 | Validar demanda (métricas de "Requer conexão") | 1 semana |
| 2 | POC com Browserless.io | 3 dias |
| 3 | Implementar endpoints backend | 2 dias |
| 4 | Criar componente React | 2 dias |
| 5 | Integração e testes | 3 dias |
| 6 | Deploy e monitoramento | 2 dias |

**Total:** ~2-3 semanas

---

## 7. MÉTRICAS DE SUCESSO

### Antes (Opção A only)

- Taxa de conexão: X%
- Churn por "muito técnico": Y%
- Tickets de suporte "como conectar": Z/mês

### Depois (Opção A + B)

- Taxa de conexão: X+20%
- Churn por "muito técnico": 0%
- Tickets de suporte: -50%

---

## 8. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Custo alto com escala | Médio | Alto | Rate limiting, cache de sessões |
| Latência do browser remoto | Baixo | Médio | Escolher região próxima |
| Abuso do serviço | Médio | Alto | Rate limiting, detecção de bots |
| Browserless indisponível | Baixo | Alto | Fallback para Opção A |

---

## 9. DECISÃO

**Implementar quando:**

1. Mais de 30% dos usuários não completam conexão via Opção A
2. Custo estimado for < 5% do MRR
3. Demanda validada por feedback direto

**Até lá:**

- Opção A (upload de arquivo) atende
- UX melhorada com instruções claras
- Script automatizado reduz fricção

---

## APÊNDICE: CÓDIGO SKELETON

### Backend: Criar sessão remota

```typescript
// routes/sessions-remote.ts

import { Router } from 'express';
import { sign, verify } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/remote/start', authMiddleware, async (req, res) => {
  const { site } = req.body;
  const userId = req.user.id;

  // Verifica rate limit (max 3 sessões por hora)
  const recentSessions = await prisma.remoteBrowserSession.count({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  if (recentSessions >= 3) {
    return res.status(429).json({
      error: 'Limite de sessões atingido. Tente novamente em 1 hora.',
    });
  }

  // Cria sessão no banco
  const session = await prisma.remoteBrowserSession.create({
    data: {
      userId,
      site,
      status: 'WAITING',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  // Gera token JWT
  const token = sign(
    {
      sessionId: session.id,
      userId,
      site,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '10m' }
  );

  // URL do browser remoto (Browserless ou similar)
  const browserUrl = `${process.env.BROWSER_SERVER_URL}/session?token=${token}`;

  return res.json({
    sessionId: session.id,
    token,
    browserUrl,
    expiresAt: session.expiresAt,
  });
});

export default router;
```

### Frontend: Modal com iframe

```tsx
// components/RemoteBrowserModal.tsx

import { useState, useEffect } from 'react';

interface Props {
  site: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function RemoteBrowserModal({ site, onSuccess, onClose }: Props) {
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading');

  useEffect(() => {
    // Inicia sessão remota
    fetch('/api/sessions/remote/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site }),
    })
      .then((res) => res.json())
      .then((data) => {
        setBrowserUrl(data.browserUrl);
        setStatus('ready');
        // Poll status
        pollStatus(data.sessionId);
      })
      .catch(() => setStatus('error'));
  }, [site]);

  const pollStatus = async (sessionId: string) => {
    // Poll a cada 2 segundos
    const interval = setInterval(async () => {
      const res = await fetch(`/api/sessions/remote/${sessionId}/status`);
      const data = await res.json();

      if (data.status === 'success') {
        clearInterval(interval);
        setStatus('success');
        setTimeout(onSuccess, 1500);
      } else if (data.status === 'error' || data.status === 'expired') {
        clearInterval(interval);
        setStatus('error');
      }
    }, 2000);

    // Cleanup após 10 minutos
    setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
  };

  return (
    <div className="modal">
      <div className="modal-header">
        <h2>Conectar {site}</h2>
        <button onClick={onClose}>×</button>
      </div>

      <div className="modal-body">
        {status === 'loading' && <p>Iniciando navegador...</p>}

        {status === 'ready' && browserUrl && (
          <>
            <p>Faça login normalmente no navegador abaixo:</p>
            <iframe
              src={browserUrl}
              className="browser-frame"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </>
        )}

        {status === 'success' && (
          <div className="success">
            <span>✅</span>
            <p>Conta conectada com sucesso!</p>
          </div>
        )}

        {status === 'error' && (
          <div className="error">
            <span>❌</span>
            <p>Erro ao conectar. Tente novamente.</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

*Documento atualizado em: Janeiro 2026*
