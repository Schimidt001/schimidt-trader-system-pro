/**
 * AsyncUtils - Utilitários Assíncronos para o Laboratório
 *
 * Fornece funções para multitarefa cooperativa, permitindo que operações
 * pesadas cedam controle ao Event Loop do Node.js para evitar bloqueios.
 *
 * @author Schimidt Trader Pro - Backtest Lab Institucional Plus
 * @version 1.0.0
 */

/**
 * Cede o controle ao Event Loop do Node.js.
 * Usa setImmediate para agendar a continuação da execução na próxima iteração do loop.
 * Isso permite que o servidor processe outras requisições (como health checks, status polling)
 * e evita erros de timeout ou "Event Loop Blocked".
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Versão do yieldToEventLoop que só cede se tiver passado um certo tempo.
 * Útil para loops muito rápidos onde setImmediate a cada iteração seria custoso.
 */
export async function yieldIfSlow(startTime: number, thresholdMs: number = 10): Promise<number> {
  const now = Date.now();
  if (now - startTime > thresholdMs) {
    await yieldToEventLoop();
    return Date.now(); // Retorna novo startTime
  }
  return startTime;
}
