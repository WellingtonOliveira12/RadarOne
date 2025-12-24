#!/bin/bash
echo "🚀 Deploy triggerado! Monitorando rebuild..."
for i in {1..10}; do
  echo ""
  echo "=== Tentativa $i/10 $(date +%H:%M:%S) ==="

  VERSION=$(curl -s https://api.radarone.com.br/api/_meta 2>/dev/null | jq -r '.version // "404"')

  if [ "$VERSION" = "1.0.1" ]; then
    echo "✅ REBUILD COMPLETO! Version: $VERSION"
    echo ""
    echo "Testando webhook..."
    curl -s https://api.radarone.com.br/api/telegram/health | jq .
    exit 0
  elif [ "$VERSION" = "404" ]; then
    echo "⏳ Ainda build antigo..."
  else
    echo "⚠️  Version: $VERSION"
  fi

  sleep 30
done

echo ""
echo "⏰ Timeout 5min. Verificar: curl https://api.radarone.com.br/api/_meta"
