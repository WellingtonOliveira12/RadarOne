# 🎯 Guia do Administrador - Sistema de Cupons

## 📚 Índice

- [Introdução](#introdução)
- [Acesso ao Sistema](#acesso-ao-sistema)
- [Gerenciamento de Cupons](#gerenciamento-de-cupons)
- [Importação de Cupons em Lote](#importação-de-cupons-em-lote)
- [Analytics e Relatórios](#analytics-e-relatórios)
- [Operações em Lote](#operações-em-lote)
- [Boas Práticas](#boas-práticas)
- [Troubleshooting](#troubleshooting)

---

## 🌟 Introdução

O sistema de cupons do RadarOne permite criar e gerenciar cupons de desconto para os planos de assinatura. Este guia cobre todas as funcionalidades disponíveis para administradores.

**O que você pode fazer:**
- ✅ Criar cupons individuais ou em lote (CSV)
- ✅ Exportar cupons para análise
- ✅ Ver estatísticas e analytics
- ✅ Ativar/desativar cupons em lote
- ✅ Filtrar e buscar cupons
- ✅ Monitorar uso de cupons

---

## 🔐 Acesso ao Sistema

### Permissões Necessárias

| Ação | ADMIN | ADMIN_FINANCE | ADMIN_SUPER |
|------|-------|---------------|-------------|
| Visualizar cupons | ✅ | ✅ | ✅ |
| Criar cupons | ❌ | ✅ | ✅ |
| Editar cupons | ❌ | ✅ | ✅ |
| Ativar/Desativar | ❌ | ✅ | ✅ |
| Deletar cupons | ❌ | ❌ | ✅ |
| Import CSV | ❌ | ✅ | ✅ |
| Export CSV | ✅ | ✅ | ✅ |
| Ver Analytics | ✅ | ✅ | ✅ |

### Como Acessar

1. Faça login no painel admin: `https://app.radarone.com.br/login`
2. No menu lateral, clique em **"Cupons"**
3. Você verá a lista de todos os cupons cadastrados

---

## 📝 Gerenciamento de Cupons

### 1. Criar Novo Cupom

1. Clique no botão **"+ Novo Cupom"**
2. Preencha o formulário:

**Campos Obrigatórios:**
- **Código:** Nome do cupom (ex: `PROMO10`, `BLACK_FRIDAY`)
  - Mínimo 3 caracteres
  - Máximo 50 caracteres
  - Apenas letras, números, hífen e underscore
  - Será convertido automaticamente para MAIÚSCULA

- **Tipo de Desconto:**
  - `Percentual`: Desconto em % (ex: 10% de desconto)
  - `Fixo`: Valor fixo em reais (ex: R$ 50,00 de desconto)

- **Valor do Desconto:**
  - Se percentual: número de 1 a 100
  - Se fixo: valor em reais (ex: 50.00 para R$ 50,00)

**Campos Opcionais:**
- **Descrição:** Texto explicativo do cupom (máx. 500 caracteres)
- **Máximo de Usos:** Limite de quantas vezes o cupom pode ser usado
- **Data de Expiração:** Quando o cupom expira (máximo 10 anos no futuro)
- **Plano Específico:** Restringir cupom a um plano específico

3. Clique em **"Criar Cupom"**
4. Você verá uma mensagem de sucesso

**Exemplo Prático:**
```
Código: NATAL2026
Descrição: Promoção de Natal - 20% de desconto
Tipo: Percentual
Valor: 20
Máximo de Usos: 500
Expira em: 31/12/2026
Plano: (vazio - vale para todos)
```

---

### 2. Editar Cupom

1. Na lista de cupons, clique no ícone de **lápis/editar**
2. Modifique os campos desejados
3. Clique em **"Salvar"**

**Nota:** Você não pode editar o código de um cupom existente. Se precisar mudar o código, crie um novo cupom.

---

### 3. Ativar/Desativar Cupom

**Método 1: Individual**
1. Clique no botão de **toggle** (switch) ao lado do cupom
2. O status mudará imediatamente

**Método 2: Em Lote** (ver seção [Operações em Lote](#operações-em-lote))

**Quando desativar um cupom:**
- ❌ O cupom NÃO pode mais ser usado
- ✅ Histórico de usos é preservado
- ✅ Estatísticas continuam disponíveis
- ✅ Pode ser reativado a qualquer momento

---

### 4. Deletar Cupom

**⚠️ ATENÇÃO:** Esta ação é irreversível!

1. Clique no ícone de **lixeira** ao lado do cupom
2. Confirme a exclusão

**Smart Delete:**
- Se o cupom **nunca foi usado**: será deletado completamente
- Se o cupom **já foi usado**: será apenas desativado (para preservar histórico)

---

### 5. Filtrar e Buscar Cupons

Use os filtros no topo da página:

**Filtrar por Código:**
- Digite o código ou parte dele
- Busca é case-insensitive

**Filtrar por Status:**
- `Todos`: Mostra todos os cupons
- `Ativos`: Apenas cupons que podem ser usados
- `Inativos`: Apenas cupons desativados

**Filtrar por Tipo:**
- `Todos`: Ambos os tipos
- `Percentual`: Apenas descontos %
- `Fixo`: Apenas descontos em valor fixo

---

## 📤 Importação de Cupons em Lote

Ideal para criar muitos cupons de uma vez (ex: campanhas promocionais).

### Passo a Passo

1. Clique no botão **"📤 Importar CSV"**
2. Clique em **"Baixar Modelo CSV"** para ver o formato correto
3. Prepare seu arquivo CSV seguindo o modelo
4. Clique em **"Escolher arquivo"** e selecione seu CSV
5. Clique em **"Importar CSV"**
6. Aguarde o processamento
7. Veja o resumo de importação (sucesso + erros)

### Formato do CSV

**Cabeçalho (primeira linha):**
```csv
code,description,discountType,discountValue,maxUses,expiresAt,planSlug
```

**Exemplo de linhas:**
```csv
code,description,discountType,discountValue,maxUses,expiresAt,planSlug
NATAL2026,Natal 2026,PERCENTAGE,20,500,2026-12-31,
ANO_NOVO,Ano Novo Imperdível,FIXED,50.00,200,2027-01-15,
BLACK_FRIDAY,Black Friday Premium,PERCENTAGE,50,1000,2026-11-30,premium
DESCONTO10,Desconto Genérico,PERCENTAGE,10,,2027-12-31,
```

**Dicas:**
- ✅ Use vírgula como separador
- ✅ Se o campo é vazio, deixe em branco (mas mantenha a vírgula)
- ✅ Data no formato `YYYY-MM-DD`
- ✅ Valor fixo em reais com ponto (ex: `50.00`)
- ✅ planSlug é o identificador do plano (deixe vazio para todos)

### Limites e Validações

- **Máximo de linhas:** 1000 cupons por importação
- **Código:** 3-50 caracteres, alfanuméricos + _ -
- **maxUses:** 1 a 1.000.000 (vazio = ilimitado)
- **expiresAt:** Data futura, máximo 10 anos
- **description:** Máximo 500 caracteres

### O que Acontece se Houver Erros?

- ✅ Cupons válidos serão criados normalmente
- ❌ Cupons com erro serão listados com o motivo
- 📊 Você verá um resumo: `Importação concluída: 98 sucesso, 2 erros`

**Exemplo de Erro:**
```
Linha 5 - Código: AB
Erro: Código inválido (mínimo 3 caracteres)
```

---

## 📊 Analytics e Relatórios

### Como Acessar

1. Na página de cupons, clique em **"📊 Ver Analytics"**
2. Aguarde o carregamento dos dados
3. Analytics mostra dados dos **últimos 30 dias**

### Métricas Disponíveis

**Cards Principais:**
- **Total de Cupons:** Quantidade total de cupons cadastrados
- **Cupons Usados:** Quantos cupons já foram utilizados pelo menos uma vez
- **Total de Usos:** Soma de todos os usos de cupons
- **Taxa de Conversão:** % de cupons que foram usados

**Métricas Adicionais:**
- **Cupons Ativos:** Cupons habilitados
- **Cupons Inativos:** Cupons desabilitados
- **Expirando em Breve:** Cupons que expiram nos próximos 7 dias
- **Próximos do Limite:** Cupons com 80%+ do maxUses já usado
- **Por Tipo:** Distribuição entre PERCENTAGE e FIXED

### Top 10 Cupons Mais Usados

Mostra ranking dos cupons com mais usos, incluindo:
- Posição
- Código do cupom
- Tipo (Percentual/Fixo)
- Valor do desconto
- Quantidade de usos

### Distribuição por Tipo

Gráfico mostrando quantos usos cada tipo de cupom teve.

### Performance

- ⚡ **Cache de 5 minutos:** Analytics são cachadas para melhor performance
- 🔄 **Atualização automática:** Dados se atualizam a cada 5 minutos
- 📈 **Dados em tempo real:** Após cache expirar, vê dados atualizados

---

## 📥 Exportar Cupons (CSV)

### Como Exportar

1. (Opcional) Use os filtros para selecionar quais cupons exportar
2. Clique em **"📥 Exportar CSV"**
3. O arquivo será baixado automaticamente

### Conteúdo do Export

O arquivo CSV terá:
- Código
- Descrição
- Tipo (Percentual/Fixo)
- Valor
- Máximo de Usos
- Usos Realizados
- Data de Expiração
- Status (Ativo/Inativo)
- Plano Associado
- Data de Criação

**Uso:** Ideal para análises em Excel ou relatórios.

---

## ⚡ Operações em Lote

Economize tempo gerenciando múltiplos cupons de uma vez.

### Como Selecionar Cupons

**Método 1: Selecionar Todos**
1. Clique no checkbox no **cabeçalho da tabela**
2. Todos os cupons da página atual serão selecionados

**Método 2: Selecionar Individualmente**
1. Clique no checkbox ao lado de cada cupom
2. Selecione quantos quiser

### Barra de Ações em Lote

Quando cupons estiverem selecionados, aparecerá uma barra azul:

**Ações Disponíveis:**
- **Ativar Selecionados:** Ativa todos os cupons selecionados
- **Desativar Selecionados:** Desativa todos
- **Deletar Selecionados:** Deleta todos (requer ADMIN_SUPER)
- **Limpar Seleção:** Remove seleção

**Dica:** Use filtros + selecionar todos para operações em massa eficientes.

**Exemplo de Uso:**
1. Filtrar por status "Inativo"
2. Selecionar todos
3. Clicar em "Deletar Selecionados"
4. Confirmar
5. ✅ Todos os cupons inativos serão removidos

---

## 💡 Boas Práticas

### 1. Nomenclatura de Cupons

✅ **BOM:**
- `NATAL2026` - Claro, específico, com ano
- `BLACK_FRIDAY_50` - Descritivo, inclui valor
- `PRIMEIRA_COMPRA` - Auto-explicativo

❌ **RUIM:**
- `ABC123` - Sem significado
- `DESCONTO` - Muito genérico
- `promo` - Não em maiúscula (será convertido, mas evite)

### 2. Descrições Úteis

Sempre adicione descrições claras:
```
✅ "Promoção de Natal 2026 - 20% de desconto válido até 31/12"
❌ "Cupom de desconto"
```

### 3. Limites de Uso

- **Campanhas limitadas:** Sempre defina `maxUses`
- **Cupons permanentes:** Deixe `maxUses` vazio (ilimitado)
- **Teste:** Use `maxUses: 5` para testes internos

### 4. Datas de Expiração

- **Campanhas sazonais:** Sempre defina expiração
- **Cupons permanentes:** Deixe vazio OU defina data muito futura
- **Urgência:** Use expirações curtas para criar senso de urgência

### 5. Monitoramento

Verifique semanalmente:
- 📊 **Analytics:** Quais cupons estão performando?
- ⏰ **Expirando em breve:** Renovar ou deixar expirar?
- 🎯 **Próximos do limite:** Aumentar maxUses se necessário
- 🗑️ **Inativos sem uso:** Deletar para manter lista limpa

### 6. Segurança

- ✅ Não compartilhe cupons SUPER generosos publicamente
- ✅ Use `maxUses` para cupons de alto valor
- ✅ Monitore uso suspeito (muitos usos repentinos)
- ✅ Desative cupons vazados imediatamente

---

## 🐛 Troubleshooting

### Problema: "Cupom já existe"

**Causa:** Já existe um cupom com esse código.

**Solução:**
1. Use outro código OU
2. Delete/desative o cupom existente primeiro

---

### Problema: "Cupom inválido ou não encontrado"

**Causa:** Usuário tentou usar cupom que não existe ou está inativo.

**Verificar:**
1. Código está correto (maiúsculas)?
2. Cupom está ativo?
3. Cupom não expirou?
4. Cupom não atingiu limite de usos?

---

### Problema: Importação CSV falhou

**Causa:** Arquivo CSV mal formatado.

**Solução:**
1. Baixe o modelo CSV
2. Use editor de planilha (Excel/Google Sheets)
3. Exporte como CSV (UTF-8)
4. Verifique que separador é vírgula
5. Remova quebras de linha dentro de células

---

### Problema: Analytics não atualiza

**Causa:** Cache de 5 minutos.

**Solução:** Aguarde 5 minutos e recarregue a página.

---

### Problema: Não consigo deletar cupom

**Causa:** Cupom tem usos registrados OU você não tem permissão.

**Solução:**
1. Verifique se você é ADMIN_SUPER
2. Se cupom tem usos, ele será desativado automaticamente (não deletado)
3. Isso é intencional para preservar histórico

---

## 📞 Suporte

**Dúvidas?**
- 📧 Email: suporte@radarone.com.br
- 📚 Documentação API: `docs/COUPONS_API.md`
- 💬 Chat interno do painel admin

---

## 🎓 Treinamento Rápido (5 minutos)

**Tarefa 1:** Criar um cupom
1. Clique em "+ Novo Cupom"
2. Código: `TESTE_SEU_NOME`
3. Tipo: Percentual, Valor: 10
4. Criar

**Tarefa 2:** Desativar o cupom
1. Encontre o cupom na lista
2. Clique no toggle para desativar

**Tarefa 3:** Ver Analytics
1. Clique em "Ver Analytics"
2. Observe os números

**Tarefa 4:** Exportar
1. Clique em "Exportar CSV"
2. Abra o arquivo

**Tarefa 5:** Deletar o cupom de teste
1. Clique na lixeira
2. Confirme

**Parabéns!** 🎉 Você completou o treinamento básico.

---

**Última atualização:** 2026-01-01
**Versão:** 1.0
