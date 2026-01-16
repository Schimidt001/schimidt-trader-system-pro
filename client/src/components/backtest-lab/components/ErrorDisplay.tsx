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
