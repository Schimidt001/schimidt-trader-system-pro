/**
 * ErrorDisplay - Componente para Exibição de Erros Estruturados
 * 
 * Exibe erros de forma padronizada com:
 * - Código do erro
 * - Mensagem descritiva
 * - Contexto adicional (se disponível)
 * - Ações sugeridas
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle,
  XCircle,
  ChevronDown,
  RefreshCw,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { PipelineError } from "../hooks/useInstitutionalLab";

// ============================================================================
// TYPES
// ============================================================================

interface ErrorDisplayProps {
  error: PipelineError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: "inline" | "card" | "toast";
}

// ============================================================================
// ERROR MESSAGES
// ============================================================================

const ERROR_SUGGESTIONS: Record<string, string[]> = {
  // Erros TRPC padrão
  PRECONDITION_FAILED: [
    "Verifique se os dados históricos foram baixados para o símbolo selecionado.",
    "Use a página de download de dados para obter os dados necessários.",
  ],
  CONFLICT: [
    "Aguarde a conclusão da operação atual ou aborte-a antes de iniciar uma nova.",
  ],
  INTERNAL_SERVER_ERROR: [
    "Tente novamente em alguns segundos.",
    "Se o problema persistir, verifique os logs do servidor.",
  ],
  TIMEOUT: [
    "A operação demorou mais do que o esperado.",
    "Tente com um período menor ou menos combinações.",
  ],
  UNAUTHORIZED: [
    "Sua sessão pode ter expirado. Faça login novamente.",
  ],
  BAD_REQUEST: [
    "Verifique os parâmetros de entrada.",
    "Certifique-se de que todos os campos obrigatórios estão preenchidos.",
  ],
  UNKNOWN_ERROR: [
    "Um erro inesperado ocorreu.",
    "Tente novamente ou entre em contato com o suporte.",
  ],
  
  // CORREÇÃO TAREFA 5: Erros estruturados do Laboratório (LAB_*)
  LAB_TOO_MANY_COMBINATIONS: [
    "Reduza o número de parâmetros habilitados para otimização.",
    "Diminua os ranges (min/max) dos parâmetros.",
    "Aumente o valor do passo (step) para reduzir combinações.",
    "Trave alguns parâmetros com valores fixos.",
  ],
  LAB_CONFIG_INVALID: [
    "Verifique se todos os parâmetros estão configurados corretamente.",
    "Certifique-se de que os valores estão dentro dos limites permitidos.",
  ],
  LAB_CONFIG_MISSING_REQUIRED: [
    "Preencha todos os campos obrigatórios antes de iniciar.",
    "Selecione pelo menos um símbolo e defina o período.",
  ],
  LAB_DATA_NOT_FOUND: [
    "Baixe os dados históricos para o símbolo selecionado.",
    "Verifique se o símbolo está correto.",
    "Use a aba 'Download de Dados' para obter os dados necessários.",
  ],
  LAB_DATA_INVALID_FORMAT: [
    "Os dados históricos podem estar corrompidos.",
    "Tente baixar os dados novamente.",
  ],
  LAB_DATA_INSUFFICIENT: [
    "O período selecionado não possui dados suficientes.",
    "Selecione um período maior ou baixe mais dados históricos.",
  ],
  LAB_EXECUTION_FAILED: [
    "A execução do backtest falhou.",
    "Verifique os parâmetros e tente novamente.",
  ],
  LAB_EXECUTION_TIMEOUT: [
    "A operação excedeu o tempo limite.",
    "Reduza o número de combinações ou o período de análise.",
  ],
  LAB_EXECUTION_ABORTED: [
    "A operação foi cancelada pelo usuário.",
    "Inicie novamente quando estiver pronto.",
  ],
  LAB_VALIDATION_FAILED: [
    "A validação dos parâmetros falhou.",
    "Verifique os valores configurados.",
  ],
  LAB_ISOLATION_VIOLATION: [
    "Operação não permitida em modo Laboratório.",
    "O Laboratório é isolado do sistema Live por segurança.",
  ],
  LAB_BROKER_ACCESS_DENIED: [
    "Acesso ao broker não permitido em modo Laboratório.",
    "Use dados históricos locais para backtesting.",
  ],
  LAB_METRICS_INVALID: [
    "Erro ao calcular métricas do backtest.",
    "Verifique se os dados estão corretos.",
  ],
  LAB_INTERNAL_ERROR: [
    "Erro interno do Laboratório.",
    "Tente novamente ou entre em contato com o suporte.",
  ],
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  variant = "inline",
}: ErrorDisplayProps) {
  const [isContextOpen, setIsContextOpen] = React.useState(false);

  if (!error) return null;

  const suggestions = ERROR_SUGGESTIONS[error.code] || ERROR_SUGGESTIONS.UNKNOWN_ERROR;

  const handleCopyError = () => {
    const errorText = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(errorText);
  };

  if (variant === "inline") {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle className="flex items-center justify-between">
          <span>Erro: {error.code}</span>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss} className="h-6 px-2">
              Fechar
            </Button>
          )}
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error.message}</p>
          
          {/* Sugestões */}
          {suggestions.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium mb-1">Sugestões:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {suggestions.map((suggestion, idx) => (
                  <li key={idx}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Contexto (colapsável) */}
          {error.context && Object.keys(error.context).length > 0 && (
            <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 mt-2">
                  <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${isContextOpen ? "rotate-180" : ""}`} />
                  Detalhes técnicos
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 mt-3">
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Tentar novamente
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleCopyError}>
              <Copy className="w-4 h-4 mr-1" />
              Copiar erro
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (variant === "card") {
    return (
      <div className="border border-destructive rounded-lg p-4 bg-destructive/5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-destructive/10 rounded-full">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-destructive">{error.code}</h4>
            <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
            
            {suggestions.length > 0 && (
              <div className="mt-3 p-3 bg-muted rounded">
                <p className="text-sm font-medium mb-2">O que você pode fazer:</p>
                <ul className="space-y-1">
                  {suggestions.map((suggestion, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              {onRetry && (
                <Button size="sm" onClick={onRetry}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Tentar novamente
                </Button>
              )}
              {onDismiss && (
                <Button variant="outline" size="sm" onClick={onDismiss}>
                  Fechar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Toast variant (simplified)
  return (
    <div className="flex items-center gap-3 p-3 bg-destructive text-destructive-foreground rounded-lg">
      <XCircle className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{error.code}</p>
        <p className="text-sm opacity-90 truncate">{error.message}</p>
      </div>
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} className="text-destructive-foreground hover:bg-destructive-foreground/10">
          Fechar
        </Button>
      )}
    </div>
  );
}

export default ErrorDisplay;
