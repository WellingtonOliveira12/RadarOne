#!/bin/bash
# =========================
# RadarOne - Auditoria + Correções (GA4 + Git limpo)
# =========================

set -e

echo "==> 1) Confirmando branch e estado do git"
git rev-parse --abbrev-ref HEAD
git status

echo "==> 2) Atualizando referências remotas"
git fetch --all --prune

echo "==> 3) Diagnóstico: GA4 existe em algum arquivo?"
git grep -n "G-RBF10SSGSW" . || true
git grep -n "googletagmanager.com/gtag/js" . || true

echo "==> 4) Histórico do frontend/index.html (últimos 30 commits relevantes)"
git log -n 30 --oneline -- frontend/index.html || true

echo "==> 5) Garantindo GA4 no frontend/index.html"
INDEX="frontend/index.html"

if [ ! -f "$INDEX" ]; then
  echo "ERRO: $INDEX não encontrado."
  exit 1
fi

# Remove qualquer bloco antigo/duplicado do gtag (se existir) para evitar duplicidade
perl -0777 -i -pe 's/<!-- Google tag \(gtag\.js\) -->.*?gtag\(\x27config\x27, \x27G-[A-Z0-9]+\x27\);\s*<\/script>\s*//gs' "$INDEX" || true

# Insere o snippet antes do fechamento do </head> se não existir
if ! grep -q "G-RBF10SSGSW" "$INDEX"; then
  perl -0777 -i -pe 's#</head>#<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-RBF10SSGSW"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('\''js'\'', new Date());\n  gtag('\''config'\'', '\''G-RBF10SSGSW'\'');\n</script>\n\n</head>#s' "$INDEX"
  echo "OK: GA4 inserido em $INDEX"
else
  echo "OK: GA4 já presente em $INDEX"
fi

echo "==> 6) Mostrando trecho do index.html para conferência"
grep -n "G-RBF10SSGSW" -n "$INDEX" || true

echo "==> 7) Rodando build do frontend para garantir que compila"
cd frontend
npm ci
npm run build
cd ..

echo "==> 8) Diagnóstico: arquivos 'fantasmas' / mudanças locais"
git status

echo "==> 9) Se houver sujeira local e você quiser zerar igual ao origin/main, execute (opcional):"
echo "    git reset --hard origin/main && git clean -fd"
echo ""
echo "==> 10) Se tudo ok, preparar commit do GA4"
git add frontend/index.html
git diff --cached --stat || true

echo ""
echo "Pronto. Se o diff estiver correto, finalize com:"
echo "git commit -m \"chore(frontend): restore GA4 tag\""
echo "git push"
