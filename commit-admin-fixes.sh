#!/bin/bash

# Script de commit para correções do Admin Panel
# Data: 2026-01-01
# Autor: Claude Sonnet 4.5

set -e

echo "🚀 Preparando commit das correções do Admin Panel..."
echo ""

# Verificar se estamos no diretório correto
if [ ! -d ".git" ]; then
  echo "❌ Erro: Este script deve ser executado na raiz do repositório"
  exit 1
fi

# Verificar se há mudanças
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ Nenhuma mudança para commitar"
  exit 0
fi

echo "📝 Arquivos alterados:"
git status --short
echo ""

# Perguntar confirmação
read -p "Deseja continuar com o commit? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Commit cancelado"
  exit 0
fi

# Stage das correções principais
echo "📦 Adicionando arquivos modificados..."

git add frontend/src/components/AdminLayout.tsx
git add frontend/src/pages/AdminJobsPage.tsx
git add frontend/src/pages/AdminCouponsPage.tsx
git add frontend/src/pages/AdminSettingsPage.tsx
git add frontend/e2e/admin-smoke.spec.ts

echo "✅ Arquivos staged"
echo ""

# Commit das correções
echo "💾 Criando commit..."

git commit -m "fix(admin): corrigir navegação e layout inconsistente

🐛 Bugs Corrigidos:
- AdminLayout: link 'Dashboard Admin' agora aponta para /admin/stats (não /plans)
- AdminJobsPage: refatorado para usar AdminLayout consistente
- Sidebar agora aparece em todas as rotas admin

✨ Melhorias:
- Placeholders com mensagens mais claras (Coupons, Settings)
- AdminJobsPage migrado para Chakra UI
- Removido ~177 linhas de código inline

🧪 Testes:
- Adicionado smoke test E2E (7 cenários)

📚 Documentação:
- ADMIN_PANEL_AUDIT_REPORT.md
- QUICK_VALIDATION_GUIDE.md
- CHANGELOG_ADMIN_AUDIT.md

Validações confirmadas:
✅ 2FA funcional end-to-end
✅ Idle logout global implementado
✅ Alertas com badge em tempo real
✅ Stats, Audit Logs, Monitores integrados
✅ Build passa sem erros
✅ Sem breaking changes

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

echo "✅ Commit criado com sucesso!"
echo ""

# Stage documentação
echo "📄 Adicionando documentação..."

git add ADMIN_PANEL_AUDIT_REPORT.md
git add QUICK_VALIDATION_GUIDE.md
git add CHANGELOG_ADMIN_AUDIT.md

git commit -m "docs(admin): adicionar relatório de auditoria e guias

📚 Documentação adicionada:
- ADMIN_PANEL_AUDIT_REPORT.md: Relatório completo de auditoria
- QUICK_VALIDATION_GUIDE.md: Guia de validação rápida (5/15/30 min)
- CHANGELOG_ADMIN_AUDIT.md: Changelog detalhado

Inclui:
- Checklist de correções
- Endpoints backend confirmados
- Comandos de validação
- Troubleshooting

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

echo "✅ Documentação commitada!"
echo ""

# Mostrar log
echo "📊 Últimos commits:"
git log --oneline -3
echo ""

# Mostrar estatísticas
echo "📈 Estatísticas de mudanças:"
git diff HEAD~2 --stat
echo ""

echo "✅ CONCLUÍDO!"
echo ""
echo "Próximos passos:"
echo "1. Revisar commits: git log -2 -p"
echo "2. Push para remote: git push origin main"
echo "3. Validar em staging: ver QUICK_VALIDATION_GUIDE.md"
echo ""
echo "Para desfazer (se necessário):"
echo "  git reset --soft HEAD~2"
echo ""
