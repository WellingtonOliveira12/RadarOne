#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "   DEPLOY DO RADARONE BACKEND PARA RENDER"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar se estamos na branch correta
BRANCH=$(git branch --show-current)
echo "📍 Branch atual: $BRANCH"
echo ""

# Verificar se há alterações não commitadas
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Há alterações não commitadas. Fazendo commit..."
    echo ""

    # Adicionar arquivos alterados
    git add backend/src/server.ts
    git add backend/.env.example
    git add backend/DEPLOY_RENDER.md

    # Fazer commit
    git commit -m "fix: Corrigir servidor para aceitar webhooks da Kiwify na Render

- Servidor agora ouve em 0.0.0.0 (aceita conexões externas)
- Adicionada variável PUBLIC_URL para produção
- Log do endpoint do webhook em produção
- Documentação de deploy criada (DEPLOY_RENDER.md)

Correções necessárias para que a Render possa receber webhooks da Kiwify:
1. app.listen() agora usa '0.0.0.0' como host
2. PUBLIC_URL configurável via env var
3. Log do endpoint do webhook quando NODE_ENV=production"

    echo "✅ Commit realizado com sucesso!"
    echo ""
else
    echo "ℹ️  Não há alterações para commitar."
    echo ""
fi

# Confirmar antes de fazer push
echo "════════════════════════════════════════════════════════════════"
echo "⚠️  IMPORTANTE: Antes de fazer push, confirme que:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. ✓ Variáveis de ambiente configuradas na Render:"
echo "   - PUBLIC_URL=https://radarone.onrender.com"
echo "   - KIWIFY_WEBHOOK_SECRET=..."
echo "   - DATABASE_URL=postgresql://..."
echo "   - NODE_ENV=production"
echo ""
echo "2. ✓ Webhook configurado na Kiwify:"
echo "   - URL: https://radarone.onrender.com/api/webhooks/kiwify"
echo "   - Secret: [mesmo valor de KIWIFY_WEBHOOK_SECRET]"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

read -p "Deseja fazer push para $BRANCH e iniciar o deploy? (s/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo ""
    echo "🚀 Fazendo push para $BRANCH..."
    git push origin $BRANCH

    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ PUSH REALIZADO COM SUCESSO!"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "📋 PRÓXIMOS PASSOS:"
    echo ""
    echo "1. Aguardar deploy automático na Render (3-5 minutos)"
    echo "2. Verificar logs da Render para confirmar:"
    echo "   - 'Servidor rodando na porta 3000'"
    echo "   - 'Webhook Kiwify: https://radarone.onrender.com/api/webhooks/kiwify'"
    echo ""
    echo "3. Testar health check:"
    echo "   curl https://radarone.onrender.com/health"
    echo ""
    echo "4. Fazer compra de teste na Kiwify para testar webhook"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
else
    echo ""
    echo "❌ Deploy cancelado."
    echo ""
fi
