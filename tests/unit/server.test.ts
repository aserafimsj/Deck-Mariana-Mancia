import { describe, expect, it, vi } from "vitest";
import { actionBody, clientActionSchema } from "@/lib/api-schemas";
import { devAuthEnabled, issueDevToken, verifyDevToken } from "@/server/dev-auth";
import { createRateLimiter } from "@/server/rate-limit";
import { roomChannel, supabaseNotifier } from "@/server/realtime";

const SECRET = "segredo-de-teste-123456";

describe("login local (só desenvolvimento)", () => {
  it("fica desligado sem segredo e sempre na produção da Vercel", () => {
    expect(devAuthEnabled({ DEV_AUTH_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(devAuthEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(devAuthEnabled({ DEV_AUTH_SECRET: "curto" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(devAuthEnabled({ DEV_AUTH_SECRET: SECRET, VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("aceita o próprio token e recusa adulterados", () => {
    const { token, userId } = issueDevToken(SECRET);
    expect(verifyDevToken(token, SECRET)).toBe(userId);
    expect(verifyDevToken(token, "outro-segredo-qualquer")).toBeNull();
    const [, id, sig] = token.split(".");
    const otherId = "00000000-0000-4000-8000-000000000000";
    expect(verifyDevToken(`dev.${otherId}.${sig}`, SECRET)).toBeNull();
    expect(verifyDevToken(`dev.${id}.x${sig}`, SECRET)).toBeNull();
    expect(verifyDevToken("qualquer coisa", SECRET)).toBeNull();
  });
});

describe("limite de requisições", () => {
  it("bloqueia acima do limite e libera depois da janela", () => {
    const allow = createRateLimiter(3, 1000);
    expect([allow("a", 0), allow("a", 10), allow("a", 20), allow("a", 30)]).toEqual([true, true, true, false]);
    expect(allow("b", 30)).toBe(true);
    expect(allow("a", 1001)).toBe(true);
  });
});

describe("aviso em tempo real", () => {
  it("manda só o número da versão para o canal da sala", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    await supabaseNotifier("https://x.supabase.co", "sb_secret_abc", fetchMock as unknown as typeof fetch)("KZ7PA", 12);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ topic: roomChannel("KZ7PA"), event: "state", payload: { version: 12 }, private: false }] });
  });

  it("falha do serviço vira erro (o servidor registra e segue)", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    await expect(supabaseNotifier("https://x", "k".repeat(20), fetchMock as unknown as typeof fetch)("KZ7PA", 1)).rejects.toThrow(/500/);
  });
});

describe("formato das ações vindas do celular", () => {
  it("aceita ações de jogo válidas", () => {
    expect(clientActionSchema.safeParse({ type: "SUBMIT", cardIds: ["a"] }).success).toBe(true);
    expect(actionBody.safeParse({ clientActionId: crypto.randomUUID(), action: { type: "START_GAME" } }).success).toBe(true);
  });

  it("recusa ações de sistema e dados malformados", () => {
    for (const bad of [
      { type: "SET_CONNECTION", playerId: "x", connected: true },
      { type: "TICK" },
      { type: "JOIN", nickname: "x" },
      { type: "SUBMIT", cardIds: [] },
      { type: "SUBMIT", cardIds: ["a", "b", "c"] },
      { type: "PICK_WINNER", answerIndex: -1 },
      { type: "KICK", playerId: "nao-uuid" },
    ]) {
      expect(clientActionSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(actionBody.safeParse({ clientActionId: "123", action: { type: "START_GAME" } }).success).toBe(false);
  });
});

describe("TLS da conexão com o banco", async () => {
  const { sslConfig } = await import("@/server/store");
  const remote = "postgres://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
  const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

  it("local não usa TLS", () => {
    expect(sslConfig("postgres://postgres@localhost:54329/x", env({}))).toBeUndefined();
  });

  it("com o certificado do Supabase, verifica", () => {
    expect(sslConfig(remote, env({ SUPABASE_DB_CA_CERT: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----", VERCEL_ENV: "production" }))).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("produção sem certificado: falha segura (verifica e recusa)", () => {
    expect(sslConfig(remote, env({ VERCEL_ENV: "production" }))).toEqual({ rejectUnauthorized: true });
  });

  it("liberação explícita ou fora da produção: cifra sem verificar", () => {
    expect(sslConfig(remote, env({ VERCEL_ENV: "production", SUPABASE_DB_SSL_INSECURE: "1" }))).toEqual({ rejectUnauthorized: false });
    expect(sslConfig(remote, env({ VERCEL_ENV: "preview" }))).toEqual({ rejectUnauthorized: false });
  });
});
