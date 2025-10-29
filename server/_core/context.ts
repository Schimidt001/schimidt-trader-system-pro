import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    // Se OAuth não estiver configurado, criar usuário mock
    if (!process.env.OAUTH_SERVER_URL) {
      // Criar ou buscar usuário padrão "admin"
      const { getUserByOpenId, createUser } = await import("../db");
      const mockOpenId = "railway-admin";
      
      user = await getUserByOpenId(mockOpenId);
      
      if (!user) {
        await createUser({
          openId: mockOpenId,
          name: "Admin",
          email: "admin@railway.app",
          loginMethod: "mock",
          role: "admin",
        });
        user = await getUserByOpenId(mockOpenId);
      }
      
      console.log("[Auth] Usando usuário mock (OAuth não configurado)");
    } else {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
