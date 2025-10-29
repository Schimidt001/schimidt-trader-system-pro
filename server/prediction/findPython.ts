import { execSync } from "child_process";

/**
 * Encontra o comando Python disponível no sistema
 * Tenta várias variações comuns
 */
export function findPythonCommand(): string {
  const pythonCommands = [
    "python3.11",
    "python3",
    "python",
    "/nix/store/*/bin/python3.11",
    "/nix/store/*/bin/python3",
  ];

  for (const cmd of pythonCommands) {
    try {
      // Tentar executar --version para verificar se o comando existe
      if (cmd.includes("*")) {
        // Para paths com wildcard, tentar encontrar via which
        continue;
      }
      
      execSync(`${cmd} --version`, { stdio: "ignore" });
      console.log(`[FindPython] Comando Python encontrado: ${cmd}`);
      return cmd;
    } catch (error) {
      // Comando não existe, tentar próximo
      continue;
    }
  }

  // Fallback para python3
  console.warn("[FindPython] Nenhum comando Python encontrado, usando fallback: python3");
  return "python3";
}
