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
    echo "⚠️  ATENÇÃO: Há alterações não commitadas!"
    echo ""
    git status -s
    echo ""
    echo "❌ Por favor, faça commit das suas alterações antes de fazer deploy."
    echo ""
    echo "Comandos sugeridos:"
    echo "  git add ."
    echo "  git commit -m \"Sua mensagem de commit\""
    echo "  ./deploy.sh"
    echo ""
    exit 1
else
    echo "✅ Não há alterações não commitadas."
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
    echo ""
    echo "2. Verificar logs da Render para confirmar:"
    echo "   ✓ 'Conectado ao banco de dados'"
    echo "   ✓ 'Servidor rodando na porta 3000'"
    echo "   ✓ 'URL: https://radarone.onrender.com'"
    echo "   ✓ 'Webhook Kiwify: https://radarone.onrender.com/api/webhooks/kiwify'"
    echo ""
    echo "3. Testar endpoints:"
    echo "   # Health check"
    echo "   curl https://radarone.onrender.com/health"
    echo ""
    echo "   # Teste do webhook (deve retornar 401 sem signature válida)"
    echo "   curl -X POST https://radarone.onrender.com/api/webhooks/kiwify"
    echo ""
    echo "4. Configurar webhook na Kiwify com a URL:"
    echo "   https://radarone.onrender.com/api/webhooks/kiwify"
    echo ""
    echo "5. Fazer compra de teste na Kiwify para validar integração"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
else
    echo ""
    echo "❌ Deploy cancelado."
    echo ""
fi
