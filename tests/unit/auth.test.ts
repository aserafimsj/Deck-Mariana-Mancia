import { describe, expect, it, vi } from "vitest";
import { ensureAnonymousSession } from "@/lib/supabase/session";
import { extractBearerToken, getRequestUserId, supabaseTokenVerifier } from "@/server/auth";

describe("identificação do jogador no servidor", () => {
  it("extrai o token do cabeçalho Authorization", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer   xyz")).toBe("xyz");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
  });

  it("recusa requisição sem token sem nem consultar o verificador", async () => {
    const verify = vi.fn();
    expect(await getRequestUserId(new Request("http://x/"), verify)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("devolve o usuário quando o token é válido", async () => {
    const req = new Request("http://x/", { headers: { authorization: "Bearer bom" } });
    expect(await getRequestUserId(req, async (t) => (t === "bom" ? "user-1" : null))).toBe("user-1");
  });

  it("trata falha do verificador como não autenticado", async () => {
    const req = new Request("http://x/", { headers: { authorization: "Bearer qualquer" } });
    expect(
      await getRequestUserId(req, async () => {
        throw new Error("rede caiu");
      }),
    ).toBeNull();
  });

  it("adapta o Supabase Auth como verificador", async () => {
    const verify = supabaseTokenVerifier({
      getUser: async (t) => (t === "ok" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: new Error("inválido") }),
    });
    expect(await verify("ok")).toBe("u1");
    expect(await verify("ruim")).toBeNull();
  });
});

describe("sessão anônima", () => {
  const session = { access_token: "t" } as never;

  it("reaproveita a sessão existente (reconexão)", async () => {
    const auth = { getSession: vi.fn(async () => ({ data: { session }, error: null })), signInAnonymously: vi.fn() };
    expect(await ensureAnonymousSession(auth as never)).toBe(session);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("cria sessão anônima quando não existe", async () => {
    const auth = {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: vi.fn(async () => ({ data: { session, user: {} }, error: null })),
    };
    expect(await ensureAnonymousSession(auth as never)).toBe(session);
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("mostra mensagem clara quando não consegue conectar", async () => {
    const auth = {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => ({ data: { session: null, user: null }, error: new Error("429") }),
    };
    await expect(ensureAnonymousSession(auth as never)).rejects.toThrow(/Confere a internet/);
  });
});
