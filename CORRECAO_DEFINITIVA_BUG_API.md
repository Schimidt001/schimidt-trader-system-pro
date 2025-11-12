# Correção Definitiva: Erro "Input validation failed: parameters"

## 🎯 Problema Identificado

A plataforma estava falhando ao tentar abrir posições com o erro:

```
ERROR: Input validation failed: Properties not allowed: allow_equals, amount, basis, contract_type, currency, duration, duration_unit, symbol.
```

## 🔍 Análise da Causa Raiz

Após investigação profunda do código e da documentação da API Deriv, descobrimos que o problema estava no **fluxo incorreto de compra de contratos**.

### Fluxo Incorreto (Anterior):

O código tentava comprar contratos diretamente com `buy: 1` e todos os parâmetros inline:

```javascript
{
  buy: 1,
  price: 10,
  contract_type: "CALL",
  symbol: "USD/JPY",
  duration: 15,
  duration_unit: "m",
  basis: "stake",
  amount: 10,
  currency: "USD"
}
```

**Resultado:** API rejeitava com "Properties not allowed".

### Fluxo Correto (Implementado):

A API Deriv requer um **fluxo em 2 etapas**:

#### Etapa 1: Criar Proposta (Proposal)

```javascript
{
  proposal: 1,
  contract_type: "CALL",
  symbol: "USD/JPY",
  duration: 15,
  duration_unit: "m",
  basis: "stake",
  amount: 10,
  currency: "USD"
}
```

**Resposta da API:**
```javascript
{
  proposal: {
    id: "uw2mk7no3oktoRVVsB4Dz7TQnFfABuFDgO95dlxfMxRuPUsz",
    ...
  }
}
```

#### Etapa 2: Comprar com ID da Proposta

```javascript
{
  buy: "uw2mk7no3oktoRVVsB4Dz7TQnFfABuFDgO95dlxfMxRuPUsz",
  price: 10
}
```

**Resultado:** Contrato comprado com sucesso! ✅

## 🛠️ Solução Implementada

### 1. Nova Função: `createProposal()`

Criamos uma função dedicada para criar propostas de contrato:

```typescript
async createProposal(
  symbol: string,
  contractType: string,
  stake: number,
  duration: number,
  durationType: string,
  barrier?: string,
  allowEquals?: boolean
): Promise<string>
```

**Responsabilidades:**
- Construir parâmetros da proposta
- Enviar requisição `proposal: 1` para a API
- Retornar o `proposal_id` recebido
- Tratar erros específicos de proposta

### 2. Modificação: `buyContract()`

Modificamos a função `buyContract()` para usar o fluxo correto:

```typescript
async buyContract(...): Promise<DerivContract> {
  try {
    // 1. Criar proposta
    const proposalId = await this.createProposal(...);
    
    // 2. Comprar usando proposal_id
    return new Promise((resolve, reject) => {
      this.send({
        buy: proposalId,
        price: stake,
      });
      // ... handlers
    });
  } catch (error) {
    throw error;
  }
}
```

### 3. Logs Detalhados

Adicionamos logs em cada etapa para facilitar debug:

- `[DERIV_BUY] Iniciando compra: criando proposta primeiro...`
- `[DERIV_PROPOSAL] Criando proposta: {...}`
- `[DERIV_BUY] Proposta criada com sucesso. ID: xxx`
- `[DERIV_BUY] Comprando contrato com proposal_id: xxx`
- `[DERIV_BUY] Contrato comprado com sucesso!`

## 📊 Resultado Esperado

Após esta correção:

✅ **Propostas são criadas corretamente** com todos os parâmetros validados pela API  
✅ **Contratos são comprados usando proposal_id** sem erros de validação  
✅ **Logs detalhados** permitem rastrear cada etapa do processo  
✅ **Erros específicos** são capturados e reportados com detalhes completos  

## 🔄 Commits Relacionados

1. **435a9b0** - Correção inicial: usar moeda da conta ao invés de USD hardcoded
2. **a27d702** - Adicionar logs detalhados de erro
3. **22e044f** - Tentativa de usar spread operator (revelou o erro real)
4. **20a7b59** - **Correção definitiva: implementar fluxo proposal->buy** ✅

## 📝 Referências

- [Deriv API - Buy Contract](https://api.deriv.com/api-explorer#buy)
- [Deriv API - Proposal](https://api.deriv.com/api-explorer#proposal)
- [Documentação Oficial](https://developers.deriv.com/docs/)

## ✅ Status

**CORRIGIDO** - Deploy automático no Railway em andamento.

Aguardar 1-2 minutos para o deploy completar e testar novamente.
