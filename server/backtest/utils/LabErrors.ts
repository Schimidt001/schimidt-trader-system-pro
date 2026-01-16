/**
 * LabErrors - Sistema de Erros Estruturados para o Laboratório
 * 
 * TAREFA 4: Garantir erros estruturados (não UNKNOWN_ERROR)
 * 
 * Implementa:
 * - Tipos de erro específicos para cada cenário
 * - Sanitização de métricas (NaN, Infinity, BigInt)
 * - Respostas JSON válidas em todos os casos
 * - Códigos de erro padronizados
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { TRPCError } from "@trpc/server";
import { labLogger } from "./LabLogger";

// ============================================================================
// ERROR CODES
// ============================================================================

export const LAB_ERROR_CODES = {
  // Erros de configuração
  CONFIG_INVALID: "LAB_CONFIG_INVALID",
  CONFIG_MISSING_REQUIRED: "LAB_CONFIG_MISSING_REQUIRED",
  
  // Erros de dados
  DATA_NOT_FOUND: "LAB_DATA_NOT_FOUND",
  DATA_INVALID_FORMAT: "LAB_DATA_INVALID_FORMAT",
  DATA_INSUFFICIENT: "LAB_DATA_INSUFFICIENT",
  DATA_CORRUPTED: "LAB_DATA_CORRUPTED",
  
  // Erros de execução
  EXECUTION_FAILED: "LAB_EXECUTION_FAILED",
  EXECUTION_TIMEOUT: "LAB_EXECUTION_TIMEOUT",
  EXECUTION_ABORTED: "LAB_EXECUTION_ABORTED",
  
  // Erros de validação
  VALIDATION_FAILED: "LAB_VALIDATION_FAILED",
  VALIDATION_THRESHOLD_NOT_MET: "LAB_VALIDATION_THRESHOLD_NOT_MET",
  
  // Erros de isolamento
  ISOLATION_VIOLATION: "LAB_ISOLATION_VIOLATION",
  BROKER_ACCESS_DENIED: "LAB_BROKER_ACCESS_DENIED",
  
  // Erros de recursos
  RESOURCE_EXHAUSTED: "LAB_RESOURCE_EXHAUSTED",
  MEMORY_LIMIT_EXCEEDED: "LAB_MEMORY_LIMIT_EXCEEDED",
  
  // Erros de métricas
  METRICS_INVALID: "LAB_METRICS_INVALID",
  METRICS_CALCULATION_ERROR: "LAB_METRICS_CALCULATION_ERROR",
  
  // Erro genérico (último recurso)
  INTERNAL_ERROR: "LAB_INTERNAL_ERROR",
} as const;

export type LabErrorCode = typeof LAB_ERROR_CODES[keyof typeof LAB_ERROR_CODES];

// ============================================================================
// ERROR RESPONSE INTERFACE
// ============================================================================

export interface LabErrorResponse {
  success: false;
  error: {
    code: LabErrorCode;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    requestId?: string;
  };
}

export interface LabSuccessResponse<T> {
  success: true;
  data: T;
  metadata?: {
    executionTimeMs: number;
    timestamp: string;
  };
}

export type LabResponse<T> = LabSuccessResponse<T> | LabErrorResponse;

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

export class LabError extends Error {
  public readonly code: LabErrorCode;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;
  
  constructor(code: LabErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = "LabError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Manter stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LabError);
    }
  }
  
  /**
   * Converte para TRPCError
   */
  toTRPCError(): TRPCError {
    const trpcCode = this.mapToTRPCCode();
    
    return new TRPCError({
      code: trpcCode,
      message: this.message,
      cause: {
        code: this.code,
        details: this.details,
        timestamp: this.timestamp,
      },
    });
  }
  
  /**
   * Mapeia código de erro para código TRPC
   */
  private mapToTRPCCode(): "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "TIMEOUT" | "CONFLICT" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR" {
    switch (this.code) {
      case LAB_ERROR_CODES.CONFIG_INVALID:
      case LAB_ERROR_CODES.CONFIG_MISSING_REQUIRED:
      case LAB_ERROR_CODES.DATA_INVALID_FORMAT:
      case LAB_ERROR_CODES.METRICS_INVALID:
        return "BAD_REQUEST";
        
      case LAB_ERROR_CODES.DATA_NOT_FOUND:
        return "NOT_FOUND";
        
      case LAB_ERROR_CODES.ISOLATION_VIOLATION:
      case LAB_ERROR_CODES.BROKER_ACCESS_DENIED:
        return "FORBIDDEN";
        
      case LAB_ERROR_CODES.EXECUTION_TIMEOUT:
        return "TIMEOUT";
        
      case LAB_ERROR_CODES.EXECUTION_ABORTED:
        return "CONFLICT";
        
      case LAB_ERROR_CODES.DATA_INSUFFICIENT:
      case LAB_ERROR_CODES.VALIDATION_THRESHOLD_NOT_MET:
        return "PRECONDITION_FAILED";
        
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }
  
  /**
   * Converte para resposta JSON
   */
  toResponse(): LabErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

export function createDataNotFoundError(symbol: string, timeframe?: string): LabError {
  return new LabError(
    LAB_ERROR_CODES.DATA_NOT_FOUND,
    `Dados históricos não encontrados para ${symbol}${timeframe ? ` (${timeframe})` : ""}. Baixe os dados primeiro.`,
    { symbol, timeframe }
  );
}

export function createDataInsufficientError(symbol: string, required: number, available: number): LabError {
  return new LabError(
    LAB_ERROR_CODES.DATA_INSUFFICIENT,
    `Dados insuficientes para ${symbol}. Necessário: ${required} velas, disponível: ${available} velas.`,
    { symbol, required, available }
  );
}

export function createConfigInvalidError(field: string, reason: string): LabError {
  return new LabError(
    LAB_ERROR_CODES.CONFIG_INVALID,
    `Configuração inválida: ${field} - ${reason}`,
    { field, reason }
  );
}

export function createExecutionFailedError(operation: string, originalError: Error): LabError {
  return new LabError(
    LAB_ERROR_CODES.EXECUTION_FAILED,
    `Falha na execução de ${operation}: ${originalError.message}`,
    { operation, originalError: originalError.message, stack: originalError.stack }
  );
}

export function createIsolationViolationError(operation: string): LabError {
  return new LabError(
    LAB_ERROR_CODES.ISOLATION_VIOLATION,
    `Violação de isolamento: operação "${operation}" não permitida em modo LAB`,
    { operation }
  );
}

export function createMetricsInvalidError(metric: string, value: any): LabError {
  return new LabError(
    LAB_ERROR_CODES.METRICS_INVALID,
    `Métrica inválida: ${metric} = ${value}`,
    { metric, value: String(value), type: typeof value }
  );
}

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitiza um valor numérico para evitar NaN, Infinity e BigInt
 */
export function sanitizeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }
  
  return value;
}

/**
 * Sanitiza um objeto de métricas
 */
export function sanitizeMetrics<T extends Record<string, any>>(metrics: T): T {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number") {
      sanitized[key] = sanitizeNumber(value);
    } else if (typeof value === "bigint") {
      sanitized[key] = Number(value);
    } else if (value === null || value === undefined) {
      sanitized[key] = null;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetrics(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === "object" ? sanitizeMetrics(item) : sanitizeNumber(item, item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized as T;
}

/**
 * Valida e sanitiza resposta antes de enviar
 */
export function sanitizeResponse<T>(data: T): T {
  try {
    // Tentar serializar para JSON para detectar problemas
    const jsonString = JSON.stringify(data, (key, value) => {
      if (typeof value === "bigint") {
        return Number(value);
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        return null;
      }
      return value;
    });
    
    // Parse de volta para garantir que é válido
    return JSON.parse(jsonString);
  } catch (error) {
    labLogger.error("Erro ao sanitizar resposta", error as Error, "LabErrors");
    throw new LabError(
      LAB_ERROR_CODES.INTERNAL_ERROR,
      "Erro ao preparar resposta: dados inválidos",
      { originalError: (error as Error).message }
    );
  }
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

/**
 * Handler centralizado de erros para o laboratório
 */
export function handleLabError(error: unknown, context?: string): never {
  // Se já é um LabError, converter para TRPC
  if (error instanceof LabError) {
    labLogger.error(error.message, error, context);
    throw error.toTRPCError();
  }
  
  // Se é um TRPCError, re-throw
  if (error instanceof TRPCError) {
    labLogger.error(error.message, error, context);
    throw error;
  }
  
  // Erro genérico - wrap em LabError
  const message = error instanceof Error ? error.message : String(error);
  const labError = new LabError(
    LAB_ERROR_CODES.INTERNAL_ERROR,
    message,
    { originalError: message }
  );
  
  labLogger.error(message, error instanceof Error ? error : undefined, context);
  throw labError.toTRPCError();
}

/**
 * Wrapper para executar operação com tratamento de erro
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    const result = await fn();
    return sanitizeResponse(result);
  } catch (error) {
    handleLabError(error, context || operation);
  }
}

/**
 * Cria resposta de sucesso padronizada
 */
export function createSuccessResponse<T>(
  data: T,
  executionTimeMs?: number
): LabSuccessResponse<T> {
  return {
    success: true,
    data: sanitizeResponse(data),
    metadata: executionTimeMs !== undefined ? {
      executionTimeMs,
      timestamp: new Date().toISOString(),
    } : undefined,
  };
}
