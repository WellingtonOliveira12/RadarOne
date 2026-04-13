# Runbook — Deploy do worker ML na VPS Hostinger (BR)

> **Objetivo:** mover **somente** o processamento do Mercado Livre para uma VPS
> brasileira, mantendo backend/frontend/Render e todos os demais marketplaces
> exatamente como estão. Zero mudança em schema de banco, billing, auth,
> Stripe, Telegram (bot), cron jobs ou APIs públicas.
>
> **Estratégia:** a mesma base de código do worker roda em duas instâncias.
> Cada uma vê um subconjunto disjoint de monitores via envs:
>
> - Render (EUA) → `WORKER_SITES_EXCLUDE=MERCADO_LIVRE` → FB, OLX, demais
> - Hostinger (BR) → `WORKER_SITES_INCLUDE=MERCADO_LIVRE` → **apenas ML**
>
> **Coexistência com n8n (ou qualquer outro projeto):** tudo do RadarOne
> ML vive em `/opt/radarone-ml/`, com project name `radarone-ml`, container
> `radarone-ml-worker`, rede `radarone_ml_net`, sem portas publicadas, sem
> tocar em Nginx/firewall, sem sobrescrever nada existente.

---

## 0. Pré-requisitos do seu lado

- Acesso SSH à VPS Hostinger como usuário com sudo (ou root).
- Conhecer o **mesmo `SESSION_ENCRYPTION_KEY`** que está no worker do Render
  (sem ele, o storageState da sessão ML salvo no banco não descriptografa na
  VPS).
- Conhecer o **mesmo `DATABASE_URL`** do Neon (`radarone_prod`) — o que já
  está no worker/.env do Render.
- Opcionalmente: `TELEGRAM_BOT_TOKEN` (se você quer que os alertas de
  **anúncio para o usuário** saiam também da VPS; sem ele, só as execuções
  acontecem mas as notificações Telegram do ML param de sair).

> ⚠️ **Nunca** configure `ADMIN_TELEGRAM_CHAT_ID` na VPS — o watchdog já está
> **desligado** nessa instância (via `docker-compose.ml.yml`) para evitar
> alertas sistêmicos duplicados com o worker Render.

---

## 1. Pré-checagem da VPS (inspeção segura, sem tocar no n8n)

A VPS alvo é uma Hostinger **Brasil — Campinas**, Ubuntu 24.04 LTS, 1 vCPU,
4 GB RAM, 50 GB disco, já rodando **um container n8n**. Todos os comandos
abaixo são **read-only** — nenhum deles modifica, reinicia ou desliga
qualquer coisa existente.

```bash
# Identidade da máquina + IP público (precisa ser BR para resolver o
# problema de IP mismatch do ML)
curl -s https://ifconfig.me && echo
uname -a
free -h
df -h /

# Docker disponível e versões
docker --version
docker compose version

# Inventário completo do que já roda — ANOTE nomes e redes do n8n antes
# de fazer qualquer coisa
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker network ls
docker volume ls
```

**Checklist de segurança ANTES de continuar:**

- [ ] `curl ifconfig.me` retornou um IP brasileiro (ex.: começa com
      `177.`, `179.`, `187.` etc. e o WHOIS é BR). **Se não for BR,
      pare aqui** — a VPS errada não vai resolver o problema.
- [ ] Docker Engine ≥ 24 e `docker compose` plugin ativos.
- [ ] `docker ps` mostra o container do **n8n** rodando. **Anote o
      nome exato** dele. Exemplo comum: `n8n`, `n8n-1`, `mangaverdebi-n8n`.
- [ ] **Nenhum** container ou rede chamado `radarone-ml-worker`,
      `radarone_ml_net` ou `radarone-ml_*`. Se houver, é deploy antigo
      nosso e pode ser removido com `docker rm -f <nome>` / `docker network rm <nome>`.
- [ ] `free -h` mostra ≥ 1 GB de memória livre (este compose limita o
      container ML a 900 MB; o n8n fica com o restante).
- [ ] `df -h /` mostra ≥ 5 GB livres (imagem Playwright ≈ 1.8 GB + build
      cache + logs).
- [ ] **Não vamos publicar nenhuma porta**, então não importa quais
      portas o n8n usa (80/443/5678 etc.) — elas não entram em conflito
      com o nosso kit.

Se Docker não estiver instalado (improvável nesta VPS, que tem o "Gerenciador
Docker" da Hostinger habilitado):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# logout/login para o grupo docker surtir efeito
```

---

## 2. Clonar o repositório numa pasta isolada

```bash
sudo mkdir -p /opt/radarone-ml
sudo chown "$USER":"$USER" /opt/radarone-ml
cd /opt/radarone-ml

git clone https://github.com/WellingtonOliveira12/RadarOne.git .
git checkout main
git pull
```

**Só o diretório `worker/` importa** para esta VPS. O backend e o frontend
continuam em `main` por consistência de histórico, mas nada deles vai rodar
aqui.

---

## 3. Preparar o arquivo `.env.ml`

```bash
cd /opt/radarone-ml/worker
cp .env.ml.example .env.ml
chmod 600 .env.ml
vi .env.ml
```

Preencha no mínimo:

```bash
DATABASE_URL=postgresql://USER:PASS@HOST/radarone_prod?sslmode=require
SESSION_ENCRYPTION_KEY=<mesma-chave-do-worker-render>
TELEGRAM_BOT_TOKEN=<token-do-bot-radarone>
SCHEDULER_CONCURRENCY=2
```

Deixe `SENTRY_DSN` vazio (ou cole o mesmo do worker Render se quiser
correlação de erros). Deixe **todo o resto** sem setar.

> As envs `WORKER_SITES_INCLUDE=MERCADO_LIVRE` e `WATCHDOG_ENABLED=false`
> **não precisam estar no .env.ml** — elas estão hard-coded no
> `docker-compose.ml.yml` exatamente para evitar erro humano.

---

## 4. Subir o container

```bash
cd /opt/radarone-ml/worker

# build + up em background
docker compose -f docker-compose.ml.yml --env-file .env.ml up -d --build

# acompanhar bootstrap (primeira vez leva ~2-3 min por causa do build)
docker compose -f docker-compose.ml.yml logs -f
```

O que você espera ver nos logs, na ordem:

```
🚀 RadarOne Worker Bootstrap
✅ Chromium encontrado: chromium-XXXXX
🎭 Playwright executablePath: /ms-playwright/chromium-XXXXX/chrome-linux/chrome
✅ Executable existe e está no path correto!
📦 Carregando worker principal...
RadarOne Worker v2 — Resilient Scheduler
Configuration:
   DATABASE_URL: OK
   TELEGRAM_BOT_TOKEN: OK
   PLAYWRIGHT_BROWSERS_PATH: /ms-playwright
   SCHEDULER_CONCURRENCY: 2
   WORKER_SITE_FILTER: INCLUDE=[MERCADO_LIVRE]
   WATCHDOG_ENABLED: false
Database: connected
🏥 Health check server listening on port 8090
WATCHDOG_DISABLED: WATCHDOG_ENABLED=false ...
SCHEDULER_TICK_END #1 ...
```

**As duas linhas críticas** que confirmam que o shard está correto:

```
WORKER_SITE_FILTER: INCLUDE=[MERCADO_LIVRE]
WATCHDOG_DISABLED: ...
```

`Ctrl+C` sai do `logs -f`, o container continua rodando.

---

## 5. Virar a chave no Render (1 env)

No painel Render → serviço `radarone-worker` → **Environment** → adicionar:

```
WORKER_SITES_EXCLUDE=MERCADO_LIVRE
```

Render faz deploy automático em ~1 min. A partir daí o worker Render **para
de pegar ML** e a VPS Hostinger pega todos os monitores ML ativos no próximo
tick do scheduler (≤30s).

> **Não remova nenhuma env do Render.** Só adicione a `WORKER_SITES_EXCLUDE`.

---

## 6. Validar fim a fim

Rode isso no seu laptop (ou em qualquer lugar com acesso ao Neon):

```bash
cd backend
npx ts-node scripts/audit-ml-prod.ts
```

Sinais de sucesso:

- Seção `ML SiteExecutionStats` últimas entradas com `pageType=CONTENT`,
  `ads > 0`, `success=true`.
- Seção `ML MonitorLogs` últimas entradas com
  `status=SUCCESS adsFound=N newAds=M alertsSent=K`.
- Seção `ML UserSession status` com `ACTIVE` para o usuário dono dos
  monitores ML (não mais `NEEDS_REAUTH`).
- Seção `Monitors with remaining hack segments` com `count=0`.

Sinais de FB/OLX saudáveis (não houve regressão) — na mesma auditoria, a
seção `FB/OLX regression check` deve continuar mostrando o que já mostrava
antes: o worker Render continua tocando esses sites exatamente como antes.

Se o usuário precisou reconectar ML pela UI, a sessão agora é uploaded com
IP BR (seu browser) e usada com IP BR (VPS Hostinger). O redirect
`/gz/account-verification` **não deve mais acontecer**.

---

## 7. Operação do dia a dia

```bash
cd /opt/radarone-ml/worker

# status do container
docker compose -f docker-compose.ml.yml ps

# logs ao vivo (últimas 200 linhas + tail)
docker compose -f docker-compose.ml.yml logs --tail=200 -f

# restart (raramente necessário; autorestart já está on)
docker compose -f docker-compose.ml.yml restart

# atualizar código após novo push no main
cd /opt/radarone-ml && git pull && cd worker
docker compose -f docker-compose.ml.yml --env-file .env.ml up -d --build

# health check manual (só de dentro do container — porta não é publicada).
# Node é garantidamente presente na imagem Playwright (usamos ele porque
# wget/curl não são garantidos em todas as variantes da base image).
docker exec radarone-ml-worker node -e \
  "require('http').get('http://127.0.0.1:8090/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(r.statusCode,d.slice(0,200)))})"
```

---

## 8. Rollback em ≤ 5 minutos

Se algo der errado, volte tudo ao estado anterior nesta ordem:

1. **No painel Render** — remover a env `WORKER_SITES_EXCLUDE`. Render
   redeploy em ~1 min → o worker Render volta a pegar ML (comportamento
   pré-migração).
2. **Na VPS Hostinger** —

   ```bash
   cd /opt/radarone-ml/worker
   docker compose -f docker-compose.ml.yml down
   ```

   Container derrubado, rede removida, zero footprint restante além dos
   arquivos em `/opt/radarone-ml/`.
3. (Opcional) `docker image rm radarone-ml-worker:latest` se quiser
   liberar disco.
4. (Opcional) `rm -rf /opt/radarone-ml` se quiser limpar tudo.

**Nada no banco muda.** O worker Render, ao voltar a processar ML, vai
continuar de onde parou. `AdsSeen` e dedupe cross-monitor são globais no
banco e não se importam com qual instância escreveu.

---

## 9. Garantias de isolamento com n8n

| Item | Nome do RadarOne ML | Por que não colide com n8n |
|---|---|---|
| Docker project | `radarone-ml` | `name:` explícito no compose — escopo isolado |
| Container | `radarone-ml-worker` | Prefixo único |
| Imagem | `radarone-ml-worker:latest` | Prefixo único |
| Rede Docker | `radarone_ml_net` (bridge própria) | Não toca na rede do n8n |
| Portas publicadas no host | **nenhuma** | O n8n pode ter 80/443/5678 — irrelevante |
| Diretório no host | `/opt/radarone-ml/` | Pasta dedicada, fora do PATH do n8n |
| Env file | `/opt/radarone-ml/worker/.env.ml` (`chmod 600`) | Isolado, sem leitura cruzada |
| Volumes | **nenhum mount de host** | Não tocamos volumes/pastas do n8n |
| Nginx / firewall / iptables | **NÃO TOCAMOS** | Worker é background job; sem inbound |
| Memória | `mem_limit: 900m` | Deixa ≥ 2 GB pra n8n + sistema |
| CPU | `cpus: 0.8` | n8n mantém 20% do vCPU garantido |
| Rede do n8n | **Não referenciamos** | n8n fica na rede dele, nós na nossa |

**Garantias operacionais:**

- Em nenhum momento o deploy roda `docker stop`, `docker rm`, `docker network rm`
  ou `docker volume rm` em nada que não comece com `radarone`.
- Nunca altera `/etc/nginx`, `/etc/iptables`, `ufw`, `firewalld`.
- Não reinicia o Docker daemon.
- Não mexe em `systemd` units existentes.

**Se você quiser validar com seus próprios olhos antes do `up`:**

```bash
# Tudo do n8n permanece inalterado se estes nomes NÃO aparecem como
# "radarone-*":
docker ps
docker network ls
docker volume ls
```

---

## 10. Troubleshooting rápido

| Sintoma | Causa provável | Ação |
|---|---|---|
| `WORKER_SITE_FILTER: no filter (all sites)` nos logs | `WORKER_SITES_INCLUDE` não foi aplicada | Conferir `docker-compose.ml.yml` → `environment:` tem a chave. Recriar: `up -d --build --force-recreate`. |
| Logs não mostram execuções ML | Monitores ML não estão `active=true` no banco ou não há usuário com sessão | Olhar seção 6 de `audit-ml-prod.ts`. |
| `/gz/account-verification` ainda aparece após reconexão | A sessão foi uploaded antes do worker Hostinger subir, ou o IP do VPS não é BR | Verificar `curl ifconfig.me` na VPS — deve ser IP brasileiro. Se for, pedir ao usuário para reconectar a sessão ML (assim ela nasce com pareamento novo). |
| Alertas de watchdog duplicados no Telegram admin | `WATCHDOG_ENABLED=false` não foi respeitado | `docker exec radarone-ml-worker env | grep WATCHDOG` deve dizer `false`. Se não, recriar container. |
| Container reinicia em loop | Erro no bootstrap (envs faltando, DB inalcançável) | `docker compose logs --tail=500` e procurar a primeira exception. |

---

## 11. O que muda (e o que NÃO muda)

### Muda

- Worker Render deixa de executar MERCADO_LIVRE.
- Worker Hostinger passa a executar MERCADO_LIVRE.
- Uma única env no Render (`WORKER_SITES_EXCLUDE`).

### NÃO muda

- Backend (Render). Zero alteração.
- Frontend. Zero alteração.
- Schema do banco. Zero alteração.
- Auth, billing, Stripe, Kiwify, Resend, cron jobs do backend. Zero
  alteração.
- Facebook Marketplace, OLX, Webmotors, iCarros, Vivareal, Zapimoveis,
  Imovelweb, Leilao — continuam rodando exatamente no mesmo worker Render,
  exatamente como antes.
- Humanização, watchdog do Render, dedupe cross-monitor, notificações aos
  usuários.
- n8n (ou qualquer outro projeto na mesma VPS).

---

## 12. Checklist final

- [ ] Pré-checagem da VPS passou, Docker OK, sem colisão com n8n.
- [ ] `/opt/radarone-ml/` clonado com `git clone`.
- [ ] `.env.ml` preenchido com `DATABASE_URL`, `SESSION_ENCRYPTION_KEY`,
      `TELEGRAM_BOT_TOKEN`, `chmod 600`.
- [ ] `docker compose up -d --build` subiu sem erro.
- [ ] Logs mostram `WORKER_SITE_FILTER: INCLUDE=[MERCADO_LIVRE]` e
      `WATCHDOG_DISABLED`.
- [ ] Healthcheck interno responde `{status: "pong"}`.
- [ ] `WORKER_SITES_EXCLUDE=MERCADO_LIVRE` adicionada no Render.
- [ ] `audit-ml-prod.ts` mostra `pageType=CONTENT` + `adsFound > 0` na
      próxima execução ML após reconexão da sessão.
- [ ] FB/OLX continuam exatamente como antes.
