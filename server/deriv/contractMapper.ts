/**
 * Módulo Central de Mapeamento de Direção para Contract Type
 * 
 * FONTE ÚNICA DE VERDADE para conversão de predição (UP/DOWN) para contrato Deriv
 * 
 * DOCUMENTAÇÃO OFICIAL DERIV:
 * - CALL/CALLE = RISE (preço sobe em relação ao ponto de entrada)
 * - PUT/PUTE = FALL (preço cai em relação ao ponto de entrada)
 * 
 * Referência: https://developers.deriv.com/docs/trading/contract-types/rise-fall/
 */

export type PredictionDirection = "up" | "down";
export type ContractType = "CALL" | "PUT" | "CALLE" | "PUTE" | "ONETOUCH" | "NOTOUCH";
export type SemanticDirection = "RISE" | "FALL";

export interface ContractMapping {
  contract_type: ContractType;
  semantic: SemanticDirection;
  description: string;
}

/**
 * Mapeia direção da predição (UP/DOWN) para tipo de contrato Deriv
 * 
 * REGRA FUNDAMENTAL (conforme documentação oficial Deriv):
 * - UP (alta prevista) → CALL/CALLE (Rise na Deriv)
 * - DOWN (queda prevista) → PUT/PUTE (Fall na Deriv)
 * 
 * @param direction Direção prevista pela IA ("up" ou "down")
 * @param allowEquals Se true, usa CALLE/PUTE (permite empate como vitória)
 * @returns Objeto com contract_type, semantic e description
 */
export function mapDirectionToContractType(
  direction: PredictionDirection,
  allowEquals: boolean = false
): ContractMapping {
  if (direction === "up") {
    // UP = preço deve SUBIR = RISE na Deriv = CALL/CALLE
    return {
      contract_type: allowEquals ? "CALLE" : "CALL",
      semantic: "RISE",
      description: `Predição UP → ${allowEquals ? 'CALLE' : 'CALL'} (RISE: preço deve subir)`
    };
  } else {
    // DOWN = preço deve CAIR = FALL na Deriv = PUT/PUTE
    return {
      contract_type: allowEquals ? "PUTE" : "PUT",
      semantic: "FALL",
      description: `Predição DOWN → ${allowEquals ? 'PUTE' : 'PUT'} (FALL: preço deve cair)`
    };
  }
}

/**
 * Converte contract_type para semântica legível (RISE/FALL)
 * 
 * @param contractType Tipo de contrato Deriv
 * @returns Semântica do contrato (RISE ou FALL)
 */
export function getContractSemantic(contractType: ContractType): SemanticDirection {
  switch (contractType) {
    case "CALL":
    case "CALLE":
      return "RISE";
    case "PUT":
    case "PUTE":
      return "FALL";
    case "ONETOUCH":
    case "NOTOUCH":
      // Para TOUCH/NO_TOUCH, a semântica depende da barreira, mas por padrão:
      return "RISE"; // Placeholder, deve ser determinado pelo contexto
    default:
      throw new Error(`Contract type desconhecido: ${contractType}`);
  }
}

/**
 * Valida se o mapeamento está correto
 * 
 * @param direction Direção da predição
 * @param contractType Contract type que será enviado
 * @param allowEquals Se permite empate
 * @returns true se o mapeamento está correto, false caso contrário
 */
export function validateMapping(
  direction: PredictionDirection,
  contractType: ContractType,
  allowEquals: boolean
): boolean {
  const expectedMapping = mapDirectionToContractType(direction, allowEquals);
  return expectedMapping.contract_type === contractType;
}

/**
 * Gera log de auditoria detalhado para debugging
 * 
 * @param direction Direção da predição
 * @param contractType Contract type que será enviado
 * @param allowEquals Se permite empate
 * @returns String formatada para log
 */
export function generateAuditLog(
  direction: PredictionDirection,
  contractType: ContractType,
  allowEquals: boolean
): string {
  const mapping = mapDirectionToContractType(direction, allowEquals);
  const isValid = validateMapping(direction, contractType, allowEquals);
  
  return [
    `[CONTRACT_MAPPER]`,
    `Predição: ${direction.toUpperCase()}`,
    `Contract Type: ${contractType}`,
    `Semântica: ${mapping.semantic}`,
    `Allow Equals: ${allowEquals}`,
    `Mapeamento: ${isValid ? '✅ CORRETO' : '❌ INCORRETO'}`,
    `Esperado: ${mapping.contract_type}`,
    `Descrição: ${mapping.description}`
  ].join(' | ');
}
