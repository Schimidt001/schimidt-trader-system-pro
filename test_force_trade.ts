/**
 * Script para forçar um trade de teste na conta demo
 * 
 * Este script vai:
 * 1. Conectar à API tRPC da plataforma
 * 2. Executar uma ordem de compra/venda de teste
 * 3. Verificar se o trade foi executado corretamente
 * 
 * IMPORTANTE: Apenas para conta DEMO com dinheiro fictício
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-19a39.up.railway.app';

interface OrderParams {
  symbol: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  stopLossPips?: number;
  takeProfitPips?: number;
  comment?: string;
}

interface TRPCResponse<T> {
  result?: {
    data?: T;
  };
  error?: {
    message: string;
    code: string;
  };
}

async function callTRPC<T>(procedure: string, input?: any): Promise<T> {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      json: input,
    }),
  });
  
  const data = await response.json() as TRPCResponse<T>;
  
  if (data.error) {
    throw new Error(`TRPC Error: ${data.error.message}`);
  }
  
  return data.result?.data as T;
}

async function getConnectionStatus(): Promise<any> {
  try {
    const result = await callTRPC('icmarkets.getStatus');
    return result;
  } catch (error) {
    console.error('Erro ao obter status:', error);
    return null;
  }
}

async function placeTestOrder(params: OrderParams): Promise<any> {
  try {
    console.log('\\n📤 Enviando ordem de teste...');
    console.log('Parâmetros:', JSON.stringify(params, null, 2));
    
    const result = await callTRPC('icmarkets.placeOrder', params);
    return result;
  } catch (error) {
    console.error('Erro ao executar ordem:', error);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 TESTE DE TRADE FORÇADO - CONTA DEMO');
  console.log('='.repeat(60));
  console.log('\\n⚠️  AVISO: Este teste será executado em conta DEMO');
  console.log('    O dinheiro utilizado é FICTÍCIO\\n');
  
  // 1. Verificar status da conexão
  console.log('1️⃣  Verificando status da conexão...');
  const status = await getConnectionStatus();
  
  if (status) {
    console.log('✅ Status obtido:', JSON.stringify(status, null, 2));
  } else {
    console.log('❌ Não foi possível obter status da conexão');
  }
  
  // 2. Executar ordem de teste
  console.log('\\n2️⃣  Executando ordem de teste...');
  
  const testOrder: OrderParams = {
    symbol: 'USDJPY',  // Par mais líquido
    direction: 'BUY',
    lots: 0.01,        // Micro lote (mínimo)
    stopLossPips: 20,  // Stop loss de 20 pips
    takeProfitPips: 40, // Take profit de 40 pips (2:1 RR)
    comment: 'TEST_TRADE_FORCED',
  };
  
  const orderResult = await placeTestOrder(testOrder);
  
  if (orderResult) {
    console.log('\\n✅ RESULTADO DA ORDEM:');
    console.log(JSON.stringify(orderResult, null, 2));
    
    if (orderResult.success) {
      console.log('\\n🎉 TRADE EXECUTADO COM SUCESSO!');
      console.log(`   Order ID: ${orderResult.orderId}`);
      console.log(`   Preço de Execução: ${orderResult.executionPrice}`);
    } else {
      console.log('\\n❌ TRADE FALHOU:');
      console.log(`   Erro: ${orderResult.errorMessage}`);
    }
  } else {
    console.log('\\n❌ Não foi possível executar a ordem de teste');
  }
  
  console.log('\\n' + '='.repeat(60));
  console.log('Teste concluído');
  console.log('='.repeat(60));
}

main().catch(console.error);
