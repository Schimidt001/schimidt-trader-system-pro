#!/bin/bash

# Script de Sincronização e Checkpoint Automático
# Uso: pnpm sync-and-checkpoint

set -e

echo "🔄 Sincronizando mudanças do GitHub..."
git pull origin master

echo "📦 Instalando dependências (se necessário)..."
pnpm install --prefer-offline

echo "🗄️  Aplicando migrações do banco de dados..."
pnpm db:push

echo "✅ Sincronização concluída!"
echo ""
echo "⚠️  PRÓXIMO PASSO:"
echo "   Peça ao agente Manus para criar um checkpoint com:"
echo "   'Crie um checkpoint das mudanças sincronizadas do GitHub'"
echo ""
echo "   Ou execute manualmente via interface Manus"

