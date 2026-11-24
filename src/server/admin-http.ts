import "server-only";

import type { Role } from "@/lib/admin-schemas";
import { AdminError, createAdminStore, type AdminStore } from "./admin-store";
import { authenticate, errorResponse, errors, json } from "./http";
import { getPool } from "./store";

export type StaffContext = { userId: string; roles: Role[]; isAdmin: boolean; store: AdminStore };

/**
 * Porteiro do painel: só passa quem tem papel de equipe (editor ou admin).
 * `admin: true` exige administrador (apagar, gerenciar equipe).
 * Responde 401 sem sessão, 403 sem permissão — jogadores comuns nunca chegam às consultas.
 */
export async function requireStaff(request: Request, opts: { admin?: boolean } = {}): Promise<StaffContext | Response> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return errors.notConfigured();
  const userId = await authenticate(request);
  if (!userId) return errors.unauthorized();
  const store = createAdminStore(getPool(dbUrl));
  const roles = await store.rolesOf(userId);
  const isAdmin = roles.includes("admin");
  if (roles.length === 0) return errorResponse(403, "FORBIDDEN", "Área restrita à equipe do Scragbadum!.");
  if (opts.admin && !isAdmin) return errorResponse(403, "ADMIN_ONLY", "Só administradores podem fazer isso.");
  return { userId, roles, isAdmin, store };
}

/** Executa a ação do painel e traduz erros conhecidos em respostas claras. */
export async function adminAction(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof AdminError) return errorResponse(e.status, e.code, e.message);
    console.error("erro no painel", e);
    return errorResponse(500, "SERVER_ERROR", "Algo deu errado no servidor. Tenta de novo.");
  }
}
