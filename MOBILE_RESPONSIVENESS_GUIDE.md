# Guia de Responsividade Mobile - RadarOne

## Como Testar

### Opção 1: Playwright E2E Tests (Automatizado)
```bash
cd frontend
npm run test:e2e -- --project="Mobile Chrome"
npm run test:e2e -- --project="Mobile Safari"
```

### Opção 2: Browser DevTools (Manual)
1. Abra o RadarOne no Chrome/Firefox
2. Pressione `F12` para abrir DevTools
3. Clique no ícone de dispositivo móvel (Ctrl+Shift+M)
4. Selecione:
   - **iPhone 14** (390 x 844)
   - **Pixel 5** (393 x 851) - Android Medium

### Opção 3: Dispositivo Real
- Inicie o dev server: `npm run dev -- --host`
- Acesse de um smartphone na mesma rede: `http://[seu-ip]:5173`

---

## Páginas para Testar

### ✅ Prioridade Alta

#### 1. LoginPage (`/login`)
**Checklist:**
- [ ] Campos de input legíveis e clicáveis
- [ ] Botão "Entrar" acessível sem scroll
- [ ] Link "Esqueci minha senha" visível
- [ ] Sem overflow horizontal

**Problemas Comuns:**
- Inputs muito pequenos em mobile
- Botões cortados na parte inferior

#### 2. RegisterPage (`/register`)
**Checklist:**
- [ ] Formulário completo navegável com scroll
- [ ] Campos de CPF e telefone com teclado numérico
- [ ] Radio buttons de notificação tocáveis
- [ ] Instruções do Telegram legíveis

**Problemas Comuns:**
- Formulário longo demanda scroll inteligente
- Labels podem quebrar em telas pequenas

#### 3. DashboardPage (`/dashboard`)
**Checklist:**
- [ ] Cards de estatísticas empilhados verticalmente
- [ ] Gráficos responsivos
- [ ] Menu de navegação acessível

#### 4. MonitorsPage (`/monitors`)
**Checklist:**
- [ ] Formulário de criação de monitor responsivo
- [ ] Lista de monitores com scroll
- [ ] Botões de ação (editar/deletar) tocáveis
- [ ] Select de sites legível

**Problemas Comuns:**
- Tabelas horizontais causam scroll
- Botões pequenos difíceis de clicar

#### 5. **AdminJobsPage (`/admin/jobs`) - PRIORIDADE 1**
**Checklist:**
- [ ] Tabela de jobs responsiva (ou transforma em cards)
- [ ] Timestamps legíveis
- [ ] Status visíveis (cores + texto)
- [ ] Scroll horizontal controlado

**Problemas Potenciais Identificados:**
- Tabelas grandes não funcionam bem em mobile
- Muitas colunas causam overflow

**Sugestão de Fix:**
```jsx
// Trocar de <Table> para <Stack> em mobile
import { useBreakpointValue } from '@chakra-ui/react';

const isMobile = useBreakpointValue({ base: true, md: false });

{isMobile ? (
  <Stack spacing={4}>
    {jobs.map(job => (
      <Card key={job.id}>
        <CardHeader>{job.jobName}</CardHeader>
        <CardBody>
          <Text>Status: {job.status}</Text>
          <Text fontSize="sm">{job.executedAt}</Text>
        </CardBody>
      </Card>
    ))}
  </Stack>
) : (
  <Table>...</Table>
)}
```

### ✅ Prioridade Média

#### 6. PlansPage (`/plans`)
**Checklist:**
- [ ] Cards de planos empilhados verticalmente
- [ ] Botões "Escolher Plano" acessíveis
- [ ] Preços e features legíveis

#### 7. ForgotPasswordPage, ResetPasswordPage
**Checklist:**
- [ ] Formulários simples funcionam bem
- [ ] Mensagens de confirmação legíveis

---

## Breakpoints do Chakra UI

O RadarOne usa Chakra UI que já tem breakpoints responsivos:

```javascript
{
  base: '0px',     // Mobile
  sm: '30em',      // 480px
  md: '48em',      // 768px (Tablet)
  lg: '62em',      // 992px (Desktop)
  xl: '80em',      // 1280px
  '2xl': '96em'    // 1536px
}
```

### Como Usar

```jsx
// Responsive props
<Box
  fontSize={{ base: '14px', md: '16px' }}
  padding={{ base: 4, md: 8 }}
  display={{ base: 'block', md: 'flex' }}
>
  ...
</Box>

// useBreakpointValue hook
const columns = useBreakpointValue({ base: 1, md: 2, lg: 3 });
```

---

## Checklist de Validação Final

Execute estes testes em **iPhone 14** e **Android Medium (Pixel 5)**:

### Funcionalidade Básica
- [ ] Todos os botões são tocáveis (mínimo 44x44px)
- [ ] Inputs de formulário acessíveis com teclado mobile
- [ ] Sem scroll horizontal indesejado
- [ ] Modals e toasts aparecem corretamente

### Tipografia
- [ ] Texto legível (mínimo 14px em mobile)
- [ ] Headings proporcionais
- [ ] Line-height confortável

### Layout
- [ ] Padding adequado nas bordas (mín. 16px)
- [ ] Espaçamento entre elementos (min. 12px)
- [ ] Cards e containers não ultrapassam viewport

### Performance
- [ ] Imagens otimizadas
- [ ] Animações suaves
- [ ] Sem lag ao scrollar

### Navegação
- [ ] Menu hamburguer funcional (se houver)
- [ ] Links e botões com área de toque adequada
- [ ] Back navigation funciona

---

## Ferramentas Recomendadas

### 1. Lighthouse (Chrome DevTools)
```bash
# Audit mobile performance
# Abra DevTools > Lighthouse > Mobile > Analyze
```

### 2. BrowserStack (Teste em dispositivos reais)
- https://www.browserstack.com

### 3. Responsively App
- https://responsively.app
- Testa múltiplas resoluções simultaneamente

---

## Próximos Passos

1. **Rodar testes E2E mobile:**
   ```bash
   npm run test:e2e -- --project="Mobile Chrome"
   ```

2. **Testar manualmente cada página** conforme checklist acima

3. **Corrigir problemas encontrados** (priorizar AdminJobsPage)

4. **Re-testar após correções**

5. **Documentar problemas conhecidos** (se houver limitações técnicas)

---

## Notas

- **Chakra UI já é responsivo por padrão**, mas componentes customizados podem precisar de ajustes
- **AdminJobsPage é a mais problemática** por usar tabelas
- **Testes automatizados Playwright** cobrem mobile (iPhone 14, Pixel 5)
