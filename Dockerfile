# Multi-stage Dockerfile para Schimidt Trader System PRO
# Otimizado para Railway - Build mais rápido e estável

# ============================================
# Stage 1: Build do frontend e backend
# ============================================
FROM node:22-slim AS builder

WORKDIR /app

# Instalar pnpm globalmente
RUN npm install -g pnpm@10

# Copiar apenas arquivos necessários para instalação de dependências (melhor cache)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Instalar dependências com timeout aumentado
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY index.html vite.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs ./

# Build do projeto (frontend + backend)
RUN pnpm build

# ============================================
# Stage 2: Runtime com Node.js + Python
# ============================================
FROM node:22-slim AS runtime

WORKDIR /app

# Instalar Python 3 e dependências do sistema em uma única camada
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Instalar pnpm globalmente
RUN npm install -g pnpm@10

# Copiar package files e patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Instalar apenas dependências de produção
RUN pnpm install --frozen-lockfile --prod

# Copiar arquivos buildados do stage anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Copiar e instalar dependências Python
COPY server/prediction ./server/prediction
RUN pip3 install --no-cache-dir -r server/prediction/requirements.txt --break-system-packages 2>/dev/null || true

# Copiar arquivos Python para dist
RUN mkdir -p dist/prediction && cp -r server/prediction/* dist/prediction/ 2>/dev/null || true

# Expor porta
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Health check simplificado
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Comando de inicialização
CMD ["node", "dist/index.js"]
