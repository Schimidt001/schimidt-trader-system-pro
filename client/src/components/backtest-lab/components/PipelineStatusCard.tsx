/**
 * PipelineStatusCard - Card de Status Padronizado para Pipelines
 * 
 * Exibe o status de qualquer pipeline do laboratório com:
 * - Status visual (IDLE, RUNNING, COMPLETED, ERROR, ABORTED)
 * - Barra de progresso
 * - Tempo decorrido e estimado
 * - Mensagens de erro estruturadas
 * 
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Play,
  Square,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
} from "lucide-react";
import type { PipelineState, PipelineStatus } from "../hooks/useInstitutionalLab";

// ============================================================================
// TYPES
// ============================================================================

interface PipelineStatusCardProps {
  title: string;
  description?: string;
  state: PipelineState;
  onStart?: () => void;
  onAbort?: () => void;
  onReset?: () => void;
  isStartDisabled?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

// ============================================================================
// HELPERS
// ============================================================================

const STATUS_CONFIG: Record<PipelineStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}> = {
  IDLE: {
    label: "Aguardando",
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    icon: <Clock className="w-4 h-4" />,
  },
  STARTING: {
    label: "Iniciando",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  RUNNING: {
    label: "Executando",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: <RefreshCw className="w-4 h-4 animate-spin" />,
  },
  COMPLETED: {
    label: "Concluído",
    color: "text-green-600",
    bgColor: "bg-green-100",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  ABORTED: {
    label: "Abortado",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  ERROR: {
    label: "Erro",
    color: "text-red-600",
    bgColor: "bg-red-100",
    icon: <XCircle className="w-4 h-4" />,
  },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatDateTime(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PipelineStatusCard({
  title,
  description,
  state,
  onStart,
  onAbort,
  onReset,
  isStartDisabled = false,
  isLoading = false,
  icon,
  children,
}: PipelineStatusCardProps) {
  const statusConfig = STATUS_CONFIG[state.status];
  const isRunning = state.status === "RUNNING" || state.status === "STARTING";
  const canStart = state.status === "IDLE" || state.status === "COMPLETED" || state.status === "ERROR" || state.status === "ABORTED";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle>{title}</CardTitle>
          </div>
          <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
            {statusConfig.icon}
            <span className="ml-1">{statusConfig.label}</span>
          </Badge>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        {state.progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{state.progress.currentPhase}</span>
              <span className="font-medium">{state.progress.percentComplete.toFixed(1)}%</span>
            </div>
            <Progress value={state.progress.percentComplete} className="h-2" />
            <p className="text-sm text-muted-foreground">{state.progress.message}</p>
            
            {/* Time Info */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
              {state.progress.elapsedTime !== undefined && (
                <span>Decorrido: {formatDuration(state.progress.elapsedTime)}</span>
              )}
              {state.progress.estimatedTimeRemaining !== undefined && state.progress.estimatedTimeRemaining > 0 && (
                <span>Restante: ~{formatDuration(state.progress.estimatedTimeRemaining)}</span>
              )}
            </div>
          </div>
        )}

        {/* Time Stamps */}
        {(state.startedAt || state.finishedAt) && (
          <div className="grid grid-cols-2 gap-4 text-sm">
            {state.startedAt && (
              <div>
                <span className="text-muted-foreground">Início:</span>
                <span className="ml-2">{formatDateTime(state.startedAt)}</span>
              </div>
            )}
            {state.finishedAt && (
              <div>
                <span className="text-muted-foreground">Fim:</span>
                <span className="ml-2">{formatDateTime(state.finishedAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* Run ID */}
        {state.runId && (
          <div className="text-xs text-muted-foreground">
            Run ID: <code className="bg-muted px-1 py-0.5 rounded">{state.runId}</code>
          </div>
        )}

        {/* Error Alert */}
        {state.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro: {state.error.code}</AlertTitle>
            <AlertDescription>{state.error.message}</AlertDescription>
          </Alert>
        )}

        {/* Children (custom content) */}
        {children}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          {canStart && onStart && (
            <Button 
              onClick={onStart} 
              disabled={isStartDisabled || isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {isLoading ? "Iniciando..." : "Iniciar"}
            </Button>
          )}

          {isRunning && onAbort && (
            <Button 
              variant="destructive" 
              onClick={onAbort}
              className="flex-1"
            >
              <Square className="w-4 h-4 mr-2" />
              Abortar
            </Button>
          )}

          {(state.status === "COMPLETED" || state.status === "ERROR" || state.status === "ABORTED") && onReset && (
            <Button 
              variant="outline" 
              onClick={onReset}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Resetar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PipelineStatusCard;
