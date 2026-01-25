/**
 * TrpcErrorHandler - Middleware e Utilitários para Tratamento Global de Erros TRPC
 * 
 * CORREÇÃO CRÍTICA #5: Padronização Global de Respostas TRPC
 * 
 * Este módulo fornece:
 * - Middleware para capturar e padronizar erros em todos os handlers
 * - Wrapper para envolver handlers com try/catch automático
 * - Formato de resposta padronizado para erros
 * - Logging centralizado de erros
 * 
 * Benefícios:
 * - Elimina erros 502 causados por exceções não tratadas
 * - Elimina "Unable to transform response" no frontend
 * - Respostas sempre em formato JSON válido
 * - Logs estruturados para debugging
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import { TRPCError } from "@trpc/server";
import { labLogger } from "./LabLogger";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Formato padronizado de resposta de erro
 */
export interface StandardErrorResponse {
  status: "ERROR";
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
  };
}

/**
 * Formato padronizado de resposta de sucesso
 */
export interface StandardSuccessResponse<T = any> {
  status: "SUCCESS";
  data: T;
}

/**
 * Resposta padronizada (sucesso ou erro)
 */
export type StandardResponse<T = any> = StandardSuccessResponse<T> | StandardErrorResponse;

/**
 * Códigos de erro padronizados
 */
export const ErrorCodes = {
  // Erros de validação
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  
  // Erros de estado
  ALREADY_RUNNING: "ALREADY_RUNNING",
  NOT_FOUND: "NOT_FOUND",
  NOT_RUNNING: "NOT_RUNNING",
  
  // Erros de dados
  DATA_NOT_FOUND: "DATA_NOT_FOUND",
  DATA_LOAD_ERROR: "DATA_LOAD_ERROR",
  
  // Erros de ambiente
  LAB_ISOLATION_VIOLATION: "LAB_ISOLATION_VIOLATION",
  BROKER_NOT_CONNECTED: "BROKER_NOT_CONNECTED",
  
  // Erros internos
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  TIMEOUT: "TIMEOUT",
  
  // Erros de otimização
  TOO_MANY_COMBINATIONS: "TOO_MANY_COMBINATIONS",
  JOB_FAILED: "JOB_FAILED",
  JOB_ABORTED: "JOB_ABORTED",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ============================================================================
// ERROR CREATION HELPERS
// ============================================================================

/**
 * Cria uma resposta de erro padronizada
 */
export function createErrorResponse(
  code: ErrorCode | string,
  message: string,
  details?: Record<string, any>
): StandardErrorResponse {
  return {
    status: "ERROR",
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Cria uma resposta de sucesso padronizada
 */
export function createSuccessResponse<T>(data: T): StandardSuccessResponse<T> {
  return {
    status: "SUCCESS",
    data,
  };
}

/**
 * Converte um erro qualquer em TRPCError
 */
export function toTRPCError(error: unknown, defaultCode: string = "INTERNAL_SERVER_ERROR"): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }
  
  const message = error instanceof Error ? error.message : String(error);
  
  return new TRPCError({
    code: defaultCode as any,
    message,
    cause: error,
  });
}

/**
 * Extrai informações de um erro para logging
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  code: string;
  stack?: string;
} {
  if (error instanceof TRPCError) {
    return {
      message: error.message,
      code: error.code,
      stack: error.stack,
    };
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      code: "UNKNOWN",
      stack: error.stack,
    };
  }
  
  return {
    message: String(error),
    code: "UNKNOWN",
  };
}

// ============================================================================
// HANDLER WRAPPERS
// ============================================================================

/**
 * Wrapper para handlers de query TRPC com tratamento de erro automático
 * 
 * Garante que o handler sempre retorne um objeto válido, mesmo em caso de erro.
 * Isso evita erros 502 e "Unable to transform response".
 * 
 * @example
 * ```typescript
 * getStatus: protectedProcedure.query(() => 
 *   safeQueryHandler(async () => {
 *     // lógica do handler
 *     return { isRunning: true };
 *   }, { isRunning: false }) // fallback em caso de erro
 * ),
 * ```
 */
export async function safeQueryHandler<T>(
  handler: () => Promise<T> | T,
  fallback: T,
  options?: {
    logErrors?: boolean;
    context?: string;
  }
): Promise<T> {
  const { logErrors = true, context = "QueryHandler" } = options || {};
  
  try {
    return await handler();
  } catch (error) {
    if (logErrors) {
      const errorInfo = extractErrorInfo(error);
      labLogger.error(
        `[${context}] Erro capturado: ${errorInfo.message}`,
        error instanceof Error ? error : undefined,
        "TrpcErrorHandler"
      );
    }
    
    return fallback;
  }
}

/**
 * Wrapper para handlers de mutation TRPC com tratamento de erro automático
 * 
 * Diferente do safeQueryHandler, este wrapper re-lança erros como TRPCError
 * para que o frontend receba o erro corretamente.
 * 
 * @example
 * ```typescript
 * startOptimization: protectedProcedure.mutation(({ input }) => 
 *   safeMutationHandler(async () => {
 *     // lógica do handler
 *     return { success: true };
 *   }, "startOptimization")
 * ),
 * ```
 */
export async function safeMutationHandler<T>(
  handler: () => Promise<T> | T,
  context: string = "MutationHandler"
): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    const errorInfo = extractErrorInfo(error);
    
    labLogger.error(
      `[${context}] Erro em mutation: ${errorInfo.message}`,
      error instanceof Error ? error : undefined,
      "TrpcErrorHandler"
    );
    
    // Re-lançar como TRPCError para o frontend
    throw toTRPCError(error);
  }
}

/**
 * Wrapper que retorna resposta padronizada (nunca lança exceção)
 * 
 * Útil para endpoints de status que devem sempre retornar algo válido.
 * 
 * @example
 * ```typescript
 * getStatus: protectedProcedure.query(() => 
 *   safeResponseHandler(async () => {
 *     return { isRunning: true, progress: 50 };
 *   })
 * ),
 * ```
 */
export async function safeResponseHandler<T>(
  handler: () => Promise<T> | T,
  options?: {
    context?: string;
  }
): Promise<StandardResponse<T>> {
  const { context = "ResponseHandler" } = options || {};
  
  try {
    const result = await handler();
    return createSuccessResponse(result);
  } catch (error) {
    const errorInfo = extractErrorInfo(error);
    
    labLogger.error(
      `[${context}] Erro capturado: ${errorInfo.message}`,
      error instanceof Error ? error : undefined,
      "TrpcErrorHandler"
    );
    
    return createErrorResponse(
      errorInfo.code,
      errorInfo.message
    );
  }
}

// ============================================================================
// STATUS ENDPOINT HELPERS
// ============================================================================

/**
 * Cria um handler de status seguro que nunca falha
 * 
 * Específico para endpoints de polling como getOptimizationStatus,
 * getBacktestStatus, etc.
 */
export function createSafeStatusHandler<T extends Record<string, any>>(
  handler: () => Promise<T> | T,
  defaultStatus: T,
  options?: {
    context?: string;
    addErrorField?: boolean;
  }
): () => Promise<T & { error?: string }> {
  const { context = "StatusHandler", addErrorField = true } = options || {};
  
  return async () => {
    try {
      return await handler();
    } catch (error) {
      const errorInfo = extractErrorInfo(error);
      
      labLogger.error(
        `[${context}] Erro ao obter status: ${errorInfo.message}`,
        error instanceof Error ? error : undefined,
        "TrpcErrorHandler"
      );
      
      if (addErrorField) {
        return {
          ...defaultStatus,
          error: errorInfo.message,
        };
      }
      
      return defaultStatus;
    }
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Valida input e lança TRPCError se inválido
 */
export function validateInput<T>(
  input: T,
  validator: (input: T) => { valid: boolean; error?: string }
): void {
  const result = validator(input);
  
  if (!result.valid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: result.error || "Input inválido",
      cause: { code: ErrorCodes.VALIDATION_ERROR },
    });
  }
}

/**
 * Verifica pré-condição e lança TRPCError se não atendida
 */
export function assertPrecondition(
  condition: boolean,
  message: string,
  code: ErrorCode = ErrorCodes.INTERNAL_ERROR
): void {
  if (!condition) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message,
      cause: { code },
    });
  }
}

/**
 * Verifica se recurso existe e lança TRPCError se não
 */
export function assertExists<T>(
  value: T | null | undefined,
  resourceName: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${resourceName} não encontrado`,
      cause: { code: ErrorCodes.NOT_FOUND },
    });
  }
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Log de erro estruturado para TRPC
 */
export function logTrpcError(
  error: unknown,
  context: string,
  additionalInfo?: Record<string, any>
): void {
  const errorInfo = extractErrorInfo(error);
  
  labLogger.error(
    `[TRPC:${context}] ${errorInfo.code}: ${errorInfo.message}`,
    error instanceof Error ? error : undefined,
    "TrpcErrorHandler"
  );
  
  if (additionalInfo) {
    labLogger.debug(
      `[TRPC:${context}] Info adicional: ${JSON.stringify(additionalInfo)}`,
      "TrpcErrorHandler"
    );
  }
}

/**
 * Log de sucesso para operações importantes
 */
export function logTrpcSuccess(
  operation: string,
  result?: Record<string, any>
): void {
  labLogger.info(
    `[TRPC:${operation}] Sucesso${result ? `: ${JSON.stringify(result)}` : ""}`,
    "TrpcErrorHandler"
  );
}
