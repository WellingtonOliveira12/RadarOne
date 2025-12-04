# RadarOne - Frontend

Frontend do sistema RadarOne - Interface web para gerenciamento de monitores de anúncios.

## 🚀 Tecnologias

- **React 18** + **TypeScript**
- **Vite** - Build tool
- **React Router** - Roteamento
- **Axios** - Cliente HTTP
- **Context API** - Gerenciamento de estado

## 📁 Estrutura

```
frontend/
├── src/
│   ├── components/        # Componentes reutilizáveis
│   ├── pages/             # Páginas da aplicação
│   ├── context/           # Context providers
│   ├── services/          # Serviços e API
│   ├── hooks/             # Custom hooks
│   ├── types/             # TypeScript types
│   └── utils/             # Funções utilitárias
└── package.json
```

## ⚙️ Configuração

1. Instalar dependências: `npm install`
2. Configurar `.env`: `cp .env.example .env`
3. Executar: `npm run dev`

## 📱 Páginas

- `/login` - Login
- `/register` - Cadastro
- `/dashboard` - Dashboard (protegida)

## 🚧 TODO

- Adicionar páginas de Monitores, Planos, Settings
- Implementar UI library (Tailwind, MUI)
- Adicionar testes
- Melhorar responsividade

