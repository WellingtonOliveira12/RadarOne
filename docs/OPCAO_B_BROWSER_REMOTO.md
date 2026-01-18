# Opção B: Conexão via Browser Remoto (Premium)

## Status: PLANEJADO (Backlog)

Este documento descreve a arquitetura e plano de implementação da funcionalidade premium de conexão via browser remoto, onde o usuário faz login diretamente em um browser controlado pelo RadarOne, eliminando a necessidade de exportar cookies manualmente.

---

## Visão Geral

### Problema que resolve
- Usuários sem conhecimento técnico não conseguem exportar cookies
- Processo manual é propenso a erros
- Experiência de usuário não é premium

### Solução
O RadarOne abre um browser remoto (Playwright) e gera um link único (magic link). O usuário:
1. Clica no link
2. É redirecionado para uma janela do browser remoto via WebSocket
3. Faz login normalmente no site (ex: Mercado Livre)
4. O RadarOne captura automaticamente o storageState
5. Sessão é salva criptografada

---

## Arquitetura Proposta

### Componentes

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    Frontend     │────►│   Backend API    │────►│  Browser Pool   │
│   (React)       │     │   (Express)      │     │  (Playwright)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │                       ▼                        │
        │              ┌──────────────────┐              │
        └─────────────►│  WebSocket Proxy │◄─────────────┘
                       │  (noVNC / CDP)   │
                       └──────────────────┘
```

### Fluxo Detalhado

1. **Usuário solicita conexão premium**
   - Frontend: `POST /api/sessions/:site/remote-connect`
   - Backend: Cria sessão de browser remoto

2. **Backend inicia browser**
   - Cria contexto Playwright isolado
   - Navega para página de login do site
   - Gera URL única com token temporário

3. **Usuário acessa browser remoto**
   - Abre link em nova aba
   - Vê o browser remoto via streaming (noVNC ou similar)
   - Interage como se fosse local

4. **Detecção de login**
   - Backend monitora mudanças na página
   - Detecta quando login foi concluído (cookies de sessão criados)
   - Captura storageState automaticamente

5. **Finalização**
   - Criptografa e salva sessão
   - Fecha browser remoto
   - Notifica usuário de sucesso

---

## Tecnologias Candidatas

### Streaming do Browser

| Tecnologia | Prós | Contras |
|------------|------|---------|
| **noVNC** | Simples, web-based | Latência, qualidade |
| **CDP (Chrome DevTools Protocol)** | Nativo, rápido | Complexo |
| **Browserless.io** | SaaS, fácil | Custo, dependência |
| **Playwright + novnc-server** | Controle total | Setup complexo |

### Recomendação: Browserless.io (MVP) → Self-hosted (escala)

---

## Endpoints Novos

### POST /api/sessions/:site/remote-connect
```typescript
Request: { callbackUrl?: string }
Response: {
  sessionId: string;
  remoteUrl: string;  // URL para acessar browser remoto
  expiresAt: string;  // Expira em 10 min
}
```

### GET /api/sessions/:site/remote-status/:sessionId
```typescript
Response: {
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'ERROR';
  message?: string;
}
```

### DELETE /api/sessions/:site/remote-cancel/:sessionId
```typescript
Response: { success: boolean }
```

---

## Feature Flag

### Backend (.env)
```env
FEATURE_REMOTE_BROWSER=false
BROWSERLESS_API_KEY=xxx  # Se usar Browserless.io
```

### Frontend
```typescript
// config/features.ts
export const FEATURES = {
  REMOTE_BROWSER: import.meta.env.VITE_FEATURE_REMOTE_BROWSER === 'true',
};
```

---

## UX/UI

### Botão na página Conexões
```
┌────────────────────────────────────────┐
│ Mercado Livre              [Conectado] │
│ mercadolivre.com.br                    │
├────────────────────────────────────────┤
│ [Atualizar sessão]  [Conectar Premium] │
│                     ↑ Aparece se flag  │
└────────────────────────────────────────┘
```

### Modal de Conexão Remota
```
┌─────────────────────────────────────────────────────────┐
│  🖥️  Conectar via Browser Premium                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Um navegador seguro será aberto para você fazer login. │
│                                                         │
│  1. Clique em "Abrir navegador"                         │
│  2. Faça login normalmente no Mercado Livre             │
│  3. Quando terminar, clique em "Concluir"               │
│                                                         │
│  ⏱️ Tempo limite: 10 minutos                            │
│                                                         │
│  [Abrir navegador]                    [Cancelar]        │
└─────────────────────────────────────────────────────────┘
```

---

## Segurança

### Medidas necessárias

1. **Token único por sessão**
   - UUID v4 + expiração de 10 min
   - Invalidado após uso ou cancelamento

2. **Isolamento de contexto**
   - Cada sessão em browser/contexto separado
   - Sem compartilhamento de estado

3. **Cleanup automático**
   - Timeout de 10 min
   - Browser destruído após uso
   - Logs sanitizados

4. **Rate limiting**
   - Max 3 sessões remotas simultâneas por usuário
   - Cooldown de 5 min entre tentativas falhas

5. **Auditoria**
   - Log de todas as sessões remotas criadas
   - IP, user agent, duração, resultado

---

## Estimativa de Recursos

### MVP com Browserless.io
- Custo: ~$50-100/mês para uso moderado
- Implementação: ~2-3 sprints

### Self-hosted
- Servidor dedicado para browsers: 4GB RAM, 2 vCPU
- Implementação: ~4-6 sprints
- Manutenção contínua

---

## Backlog Técnico

### Sprint 1: Infraestrutura
- [ ] Setup Browserless.io ou equivalente
- [ ] Feature flag backend/frontend
- [ ] Endpoints básicos (create, status, cancel)

### Sprint 2: Integração
- [ ] Streaming de browser (noVNC/CDP)
- [ ] Detecção automática de login
- [ ] Captura de storageState

### Sprint 3: UX/UI
- [ ] Modal de conexão remota
- [ ] Indicadores de progresso
- [ ] Tratamento de erros

### Sprint 4: Segurança & Testes
- [ ] Rate limiting
- [ ] Auditoria
- [ ] Testes E2E
- [ ] Documentação

---

## Riscos

1. **Latência** - Streaming pode ser lento em conexões ruins
2. **Custo** - Pode escalar rapidamente com muitos usuários
3. **Complexidade** - Manutenção de infraestrutura de browsers
4. **ToS** - Alguns sites podem bloquear acesso via datacenter IPs

---

## Decisão: Quando implementar?

### Critérios para início
- [ ] Opção A (upload) estável e bem recebida
- [ ] Feedback de usuários solicitando alternativa
- [ ] Budget aprovado para infraestrutura
- [ ] Time disponível para 4-6 sprints

### Métricas de sucesso
- Taxa de abandono na Opção A > 30%
- NPS de usuários que pedem alternativa
- Conversão para plano premium

---

*Documento criado em: Janeiro 2026*
*Última atualização: Janeiro 2026*
*Status: BACKLOG*
