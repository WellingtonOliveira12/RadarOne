# Guia de Conexão — Mercado Livre

## O que mudou

O fluxo de "Conectar conta" foi reescrito para ser intuitivo para usuários leigos e não depender de links externos que podem quebrar.

### Antes (problemas)
- Clicar "Conectar conta" abria diretamente o file picker do sistema — sem contexto
- FAQ tinha link hardcoded para extensão Chrome Web Store que não existe mais
- Termos técnicos ("cookies", "storageState") sem explicação
- Se a API falhasse, a página ficava sem nenhum card

### Depois (solução)
- Clicar "Conectar conta" abre um **Assistente de Conexão** (modal)
- 2 abas claras:
  - **Automático (Recomendado)**: comando Playwright com botão "Copiar", passo a passo em 3 etapas
  - **Via extensão**: instruções genéricas sem link fixo para nenhuma extensão específica
- Upload com **drag & drop** + validação inline antes de enviar
- Aceita 2 formatos: Playwright storageState `{cookies, origins}` e cookie dump `[{...}]` (normaliza automaticamente)
- Mensagens de erro claras e em português
- Zero links para Chrome Web Store

## Como testar manualmente

1. Acesse `/settings/connections`
2. Clique em "Conectar conta" no card do Mercado Livre
3. Verifique que o modal abre com título "Conectar conta – Mercado Livre"
4. Na aba "Automático": deve mostrar o comando `npx playwright codegen...` com botão Copiar
5. Na aba "Via extensão": deve mostrar instruções genéricas sem links para extensões
6. Zona de upload: arraste um .json ou clique para escolher
7. Teste com arquivo inválido → deve mostrar erro claro
8. Teste com storageState válido → badge verde "X cookies encontrados"
9. Clique "Conectar conta" → deve enviar e mostrar toast de sucesso

## Formatos aceitos

| Formato | Exemplo | Suportado |
|---------|---------|-----------|
| Playwright storageState | `{"cookies": [...], "origins": [...]}` | Sim |
| Cookie dump (array) | `[{"domain": ".mercadolivre.com.br", ...}]` | Sim (normalizado) |
| JSON sem cookies ML | `{"cookies": [{"domain": ".google.com"}]}` | Rejeitado |
| Não-JSON | `<html>...` | Rejeitado |

## Problemas comuns

**"Nenhum cookie do Mercado Livre encontrado"**
- Certifique-se de estar logado no mercadolivre.com.br antes de exportar
- Verifique se exportou os cookies do site correto

**"Este arquivo não é um JSON válido"**
- O arquivo deve ter extensão .json e conteúdo JSON válido
- Não renomeie outros tipos de arquivo para .json

**Comando Playwright não funciona**
- Instale o Node.js primeiro (nodejs.org)
- Execute `npx playwright install chromium` se pedir
- O comando abre uma janela de navegador — faça login e feche a janela

**Servidor temporariamente indisponível**
- O backend pode demorar ~30s no primeiro acesso (cold start)
- Clique "Tentar novamente" após alguns segundos
