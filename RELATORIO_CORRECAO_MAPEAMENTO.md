# Relatório Final: Correção de Mapeamento de Contratos Deriv

**Data:** 10 de Dezembro de 2025  
**Autor:** Manus AI  
**Status:** Implementado e Validado

---

## 1. Resumo Executivo

Esta tarefa foi executada para corrigir uma falha crítica que causava a **inversão da direção dos contratos** enviados à API da Deriv. A investigação confirmou que a causa raiz era um mapeamento incorreto no código, que associava a predição `UP` a contratos `PUT` (Fall) e `DOWN` a contratos `CALL` (Rise).

A correção foi implementada com sucesso, estabelecendo uma **fonte única de verdade** para o mapeamento e garantindo que a direção da predição da IA esteja sempre 100% alinhada com a semântica do contrato executado na Deriv.

## 2. Diagnóstico e Causa Raiz

A auditoria inicial identificou o problema no arquivo `server/deriv/tradingBot.ts`, especificamente nas linhas 1558-1567. O código estava implementando a seguinte lógica **incorreta**:

```typescript
// Lógica ANTERIOR (INCORRETA)
contractType = this.prediction.direction === "up" ? "PUT" : "CALL";
```

Este mapeamento contradiz a documentação oficial da Deriv, que especifica:

- **CALL / CALLE**: Contrato de **RISE** (preço deve subir).
- **PUT / PUTE**: Contrato de **FALL** (preço deve cair).

O erro fazia com que, ao prever uma alta (`UP`), o sistema enviasse um contrato de queda (`PUT`), e vice-versa, tornando a plataforma inoperável com dinheiro real.

## 3. Solução Implementada

Para resolver o problema de forma definitiva e centralizada, as seguintes ações foram tomadas:

### 3.1. Criação do Módulo `contractMapper.ts`

Foi criado um novo módulo, `server/deriv/contractMapper.ts`, para servir como a **fonte única de verdade** para todo o mapeamento de contratos. Este módulo exporta a função `mapDirectionToContractType`, que implementa a lógica correta:

```typescript
// Lógica CORRETA em contractMapper.ts
export function mapDirectionToContractType(
  direction: PredictionDirection,
  allowEquals: boolean = false
): ContractMapping {
  if (direction === "up") {
    // UP = preço deve SUBIR = RISE na Deriv = CALL/CALLE
    return {
      contract_type: allowEquals ? "CALLE" : "CALL",
      semantic: "RISE",
      // ...
    };
  } else {
    // DOWN = preço deve CAIR = FALL na Deriv = PUT/PUTE
    return {
      contract_type: allowEquals ? "PUTE" : "PUT",
      semantic: "FALL",
      // ...
    };
  }
}
```

### 3.2. Refatoração do `tradingBot.ts`

O arquivo `tradingBot.ts` foi refatorado para utilizar exclusivamente o novo `contractMapper`:

1.  **Mapeamento Centralizado:** A lógica de `if/else` que definia o `contractType` foi substituída por uma única chamada à função `mapDirectionToContractType`.
2.  **Log de Auditoria `AUDIT_PAYLOAD_SENT`:** Antes de cada chamada `buyContract`, um novo log de auditoria é gerado. Este log contém a direção prevista pela IA, a semântica esperada (RISE/FALL) e o **payload JSON exato** que será enviado à Deriv, garantindo total transparência.
3.  **Consistência nos Logs:** Todos os logs subsequentes, como `POSITION_ENTERED`, agora usam a semântica (`RISE`/`FALL`) derivada do `contractMapper`, garantindo consistência em toda a cadeia de eventos.

### 3.3. Correção na Lógica de Hedge

Durante a auditoria, foi verificado que a lógica de hedge no arquivo `server/ai/hedgeStrategy.ts` estava correta em sua intenção (abrir posições opostas para proteção), mas o mapeamento `direção → contrato` também estava invertido. A correção foi aplicada para garantir que a intenção de hedge se traduza no contrato Deriv correto.

## 4. Validação da Correção

A correção foi validada através de um script de teste automatizado (`test_contract_mapping.ts`), que confirmou o seguinte:

| Cenário | Mapeamento Gerado | Semântica Deriv | Resultado |
| :--- | :--- | :--- | :--- |
| Predição **UP** (sem empate) | `CALL` | `RISE` | ✅ **Correto** |
| Predição **UP** (com empate) | `CALLE` | `RISE` | ✅ **Correto** |
| Predição **DOWN** (sem empate) | `PUT` | `FALL` | ✅ **Correto** |
| Predição **DOWN** (com empate) | `PUTE` | `FALL` | ✅ **Correto** |

O script de teste confirmou que **todos os cenários de mapeamento estão 100% corretos** e que o sistema agora detecta mapeamentos incorretos, prevenindo futuras falhas.

## 5. Conclusão e Próximos Passos

A falha crítica de inversão de contratos foi resolvida com sucesso. A plataforma agora possui um sistema de mapeamento robusto, centralizado e auditável, que garante o alinhamento entre a predição da IA e a execução na Deriv.

**A correção está pronta para ser enviada ao repositório.** Após o deploy automático, o sistema estará operando com a lógica correta. Recomenda-se monitorar os logs `AUDIT_PAYLOAD_SENT` e `POSITION_ENTERED` nos primeiros trades para confirmar visualmente a consistência em um ambiente real.
