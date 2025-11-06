#!/bin/bash

echo "========================================="
echo "Teste de Validação: Forex + M30"
echo "========================================="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de testes
PASSED=0
FAILED=0

# Função para testar
test_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description"
        ((FAILED++))
    fi
}

# Função para testar conteúdo
test_content() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $description"
        ((FAILED++))
    fi
}

echo "1. Verificando arquivos de migration..."
test_file "drizzle/migrations/0005_add_timeframe_to_config.sql" "Migration SQL criada"

echo ""
echo "2. Verificando schema do banco..."
test_content "drizzle/schema.ts" "timeframe: int" "Campo timeframe adicionado ao schema"

echo ""
echo "3. Verificando DerivService..."
test_content "server/deriv/derivService.ts" "getActiveSymbols" "Método getActiveSymbols adicionado"

echo ""
echo "4. Verificando TradingBot..."
test_content "server/deriv/tradingBot.ts" "private timeframe: number" "Propriedade timeframe adicionada"
test_content "server/deriv/tradingBot.ts" "this.timeframe" "Uso de timeframe dinâmico implementado"

echo ""
echo "5. Verificando Router..."
test_content "server/routers.ts" "timeframe:" "Campo timeframe no router"
test_content "server/routers.ts" "getActiveSymbols" "Endpoint getActiveSymbols adicionado"

echo ""
echo "6. Verificando Frontend..."
test_content "client/src/const.ts" "frxEURUSD" "Símbolos Forex adicionados"
test_content "client/src/pages/Settings.tsx" "timeframe" "Campo timeframe no Settings"
test_content "client/src/pages/Settings.tsx" "M30" "Opção M30 disponível"

echo ""
echo "========================================="
echo "Resultado dos Testes"
echo "========================================="
echo -e "${GREEN}Passou: $PASSED${NC}"
echo -e "${RED}Falhou: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Todos os testes passaram!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Execute: pnpm db:push"
    echo "2. Reinicie o servidor: pnpm dev"
    echo "3. Teste no frontend em modo DEMO"
    exit 0
else
    echo -e "${RED}✗ Alguns testes falharam. Verifique os arquivos acima.${NC}"
    exit 1
fi
