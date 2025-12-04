FROM mcr.microsoft.com/playwright:v1.57.0-focal

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY src ./src

# Build TypeScript
RUN npm run build

# Comando de inicialização
CMD ["npm", "start"]
