FROM mcr.microsoft.com/playwright:v1.57.0-focal

WORKDIR /app

# Node.js memory limit (stay under Render's 512MB)
ENV NODE_OPTIONS="--max-old-space-size=384"

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Copiar Prisma schema (needed for generate)
COPY prisma ./prisma

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY src ./src
COPY scripts ./scripts

# Build TypeScript
RUN npm run build

# Comando de inicialização
CMD ["npm", "start"]
