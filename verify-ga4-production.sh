#!/bin/bash
# Verify GA4 in Production

echo "==> Verificando GA4 em produção..."
echo ""

# Replace with your actual production URL
PROD_URL="${1:-https://radarone-frontend.onrender.com}"

echo "URL: $PROD_URL"
echo ""

echo "==> 1. Verificando se o site está acessível..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL")
if [ "$STATUS" -eq 200 ]; then
  echo "✅ Site está acessível (HTTP $STATUS)"
else
  echo "❌ Site não acessível (HTTP $STATUS)"
  exit 1
fi
echo ""

echo "==> 2. Baixando HTML..."
HTML=$(curl -s "$PROD_URL")
echo ""

echo "==> 3. Verificando tag GA4..."
if echo "$HTML" | grep -q "G-RBF10SSGSW"; then
  echo "✅ Tag GA4 encontrada!"
  echo "$HTML" | grep -n "G-RBF10SSGSW" | head -5
else
  echo "❌ Tag GA4 NÃO encontrada!"
  exit 1
fi
echo ""

echo "==> 4. Verificando script gtag.js..."
if echo "$HTML" | grep -q "googletagmanager.com/gtag/js"; then
  echo "✅ Script gtag.js encontrado!"
else
  echo "❌ Script gtag.js NÃO encontrado!"
  exit 1
fi
echo ""

echo "==> 5. Verificando estrutura do index.html..."
if echo "$HTML" | grep -q "<head>"; then
  echo "✅ Tag <head> encontrada"
fi
if echo "$HTML" | grep -q "dataLayer"; then
  echo "✅ dataLayer encontrado"
fi
echo ""

echo "==================================================="
echo "✅ GA4 está configurado corretamente em produção!"
echo "==================================================="
echo ""
echo "Próximos passos:"
echo "1. Acesse: $PROD_URL"
echo "2. Abra DevTools (F12)"
echo "3. Network → Filtre por 'gtag'"
echo "4. Verifique requests para google-analytics.com"
echo "5. Console → Digite: window.dataLayer"
echo ""
echo "Verificar no Google Analytics:"
echo "https://analytics.google.com → Realtime"
