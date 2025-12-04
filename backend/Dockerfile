FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar Prisma schema
COPY prisma ./prisma

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY src ./src

# Build TypeScript
RUN npm run build

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]
