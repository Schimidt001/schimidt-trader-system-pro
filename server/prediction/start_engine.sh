#!/bin/bash
# Script para iniciar a engine de predição proprietária
# Este script é chamado automaticamente pelo sistema principal

cd "$(dirname "$0")"

echo "🚀 Iniciando Engine de Predição Proprietária..."
echo "📊 Algoritmo: Fibonacci da Amplitude"
echo "🎯 Porta: 7070"
echo ""

# Verificar se Python está disponível
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 não encontrado!"
    exit 1
fi

# Verificar se dependências estão instaladas
if ! python3 -c "import flask" &> /dev/null; then
    echo "📦 Instalando dependências Python..."
    python3 -m pip install -q -r requirements.txt
fi

# Iniciar servidor da engine
python3 engine_server.py

