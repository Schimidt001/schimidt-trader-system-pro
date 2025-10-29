import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Gerenciador da Engine de Predição Python
 * Inicia e monitora o servidor Python da engine proprietária
 */

export class EngineManager {
  private process: ChildProcess | null = null;
  private isRunning: boolean = false;
  private enginePath: string;
  private port: number = 5070;

  constructor() {
    this.enginePath = path.join(__dirname, "engine_server.py");
  }

  /**
   * Inicia o servidor da engine Python
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[EngineManager] Engine já está rodando");
      return;
    }

    return new Promise((resolve, reject) => {
      console.log("[EngineManager] Iniciando engine de predição proprietária...");

      // Spawn processo Python
      this.process = spawn("python3", [this.enginePath], {
        cwd: path.dirname(this.enginePath),
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Capturar stdout
      this.process.stdout?.on("data", (data) => {
        const output = data.toString();
        console.log(`[Engine] ${output.trim()}`);

        // Detectar quando engine estiver pronta
        if (output.includes("Running on")) {
          this.isRunning = true;
          console.log("[EngineManager] ✅ Engine iniciada com sucesso na porta 7070");
          resolve();
        }
      });

      // Capturar stderr
      this.process.stderr?.on("data", (data) => {
        const error = data.toString();
        console.error(`[Engine Error] ${error.trim()}`);
      });

      // Tratar erros
      this.process.on("error", (error) => {
        console.error("[EngineManager] ❌ Erro ao iniciar engine:", error);
        this.isRunning = false;
        reject(error);
      });

      // Tratar saída do processo
      this.process.on("exit", (code, signal) => {
        console.log(`[EngineManager] Engine encerrada (code: ${code}, signal: ${signal})`);
        this.isRunning = false;
        this.process = null;
      });

      // Timeout de 10 segundos
      setTimeout(() => {
        if (!this.isRunning) {
          console.warn("[EngineManager] ⚠️ Timeout ao iniciar engine");
          resolve(); // Não rejeitar, deixar o sistema tentar conectar depois
        }
      }, 10000);
    });
  }

  /**
   * Para o servidor da engine
   */
  async stop(): Promise<void> {
    if (!this.process) {
      console.log("[EngineManager] Engine não está rodando");
      return;
    }

    return new Promise((resolve) => {
      console.log("[EngineManager] Parando engine de predição...");

      this.process!.on("exit", () => {
        console.log("[EngineManager] ✅ Engine parada");
        this.isRunning = false;
        this.process = null;
        resolve();
      });

      // Enviar SIGTERM
      this.process!.kill("SIGTERM");

      // Forçar kill após 5 segundos
      setTimeout(() => {
        if (this.process) {
          console.warn("[EngineManager] ⚠️ Forçando encerramento da engine");
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);
    });
  }

  /**
   * Verifica se a engine está rodando
   */
  isEngineRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Obtém a porta da engine
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Reinicia a engine
   */
  async restart(): Promise<void> {
    console.log("[EngineManager] Reiniciando engine...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.start();
  }
}

// Singleton instance
export const engineManager = new EngineManager();

