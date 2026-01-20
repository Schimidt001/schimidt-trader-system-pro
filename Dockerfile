# Multi-stage Dockerfile para Schimidt Trader System PRO

# Garante que Node.js 22 + Python 3.11 estejam disponíveis

# ============================================
# Stage 1: Build do frontend e backend
# ============================================
FROM node:22-slim AS builder

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package files e patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Instalar dependências
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build do projeto (frontend + backend)
RUN pnpm build

# ============================================
# Stage 2: Runtime com Node.js + Python
# ============================================
FROM node:22-slim

WORKDIR /app

# Instalar Python 3.11 e dependências do sistema
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Criar symlink para python3 apontar para python3.11
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.11 /usr/bin/python

# Instalar pnpm
RUN npm install -g pnpm

# Copiar package files e patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Instalar dependências (incluindo dev e prod)
RUN pnpm install --frozen-lockfile

# Copiar arquivos buildados do stage anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/server/prediction ./server/prediction

# Instalar dependências Python
COPY server/prediction/requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copiar arquivos Python para dist
RUN cp -r server/prediction/* dist/prediction/ 2>/dev/null || true

# Expor porta
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000
# CORREÇÃO OOM: Configuração de memória otimizada
# Railway Free: 512MB | Pro: 1024MB ou mais
# --max-old-space-size=450: Deixa margem para o sistema
# --expose-gc: Permite forçar garbage collection
ENV NODE_OPTIONS="--max-old-space-size=450 --expose-gc"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["pnpm", "start"]
