# Dockerfile otimizado para Railway
# Usa imagem com Node.js 22 + Python 3.11 + pnpm pré-instalados

FROM nikolaik/python-nodejs:python3.11-nodejs22-slim

WORKDIR /app

# Copiar package files e patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Instalar dependências Node.js
RUN pnpm install --frozen-lockfile

# Copiar código fonte
COPY . .

# Build do projeto
RUN pnpm build

# Instalar dependências Python
RUN pip3 install --no-cache-dir -r server/prediction/requirements.txt

# Copiar arquivos Python para dist
RUN cp -r server/prediction/* dist/prediction/ 2>/dev/null || true

# Expor porta
EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["pnpm", "start"]
