import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Tentar autenticação local primeiro (cookie user_session)
  const cookies = opts.req.headers.cookie || '';
  const userSessionMatch = cookies.match(/user_session=([^;]+)/);
  
  if (userSessionMatch) {
    try {
      const sessionData = JSON.parse(decodeURIComponent(userSessionMatch[1]));
      if (sessionData.userId) {
        // Buscar usuário pelo ID
        const { AuthService } = await import('../auth/authService');
        user = await AuthService.getUserById(sessionData.userId);
        if (user) {
          console.log(`[Auth] Usuário autenticado via sessão local: ${user.email}`);
        }
      }
    } catch (error) {
      console.error('[Auth] Erro ao processar sessão local:', error);
    }
  }

  // Se não encontrou usuário local, tentar OAuth
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      // Se OAuth não estiver configurado, não criar usuário mock
      // (o sistema de login local será usado)
      if (!process.env.OAUTH_SERVER_URL) {
        console.log("[Auth] OAuth não configurado, usando autenticação local");
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
