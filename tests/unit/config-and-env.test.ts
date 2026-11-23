import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";
import { DEFAULT_ROOM_SETTINGS, HUMOR_LEVELS, humorLevelInfo, roomSettingsSchema } from "@/lib/game-config";
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY, readLocalSettings, writeLocalSettings } from "@/lib/local-settings";

describe("regras da sala", () => {
  it("tem padrões sensatos", () => {
    expect(DEFAULT_ROOM_SETTINGS).toEqual({
      pointsToWin: 7,
      handSize: 7,
      answerSeconds: 60,
      humorLevel: 2,
      maxPlayers: 8,
      maxRounds: null,
      categorySlugs: [],
    });
  });

  it("recusa valores fora dos limites", () => {
    expect(roomSettingsSchema.safeParse({ pointsToWin: 2 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ maxPlayers: 11 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ answerSeconds: 30 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ humorLevel: 5 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ handSize: 7.5 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ categorySlugs: ["Não Pode"] }).success).toBe(false);
  });

  it("aceita configuração personalizada válida", () => {
    const r = roomSettingsSchema.safeParse({ pointsToWin: 10, answerSeconds: 0, humorLevel: 4, maxRounds: 20 });
    expect(r.success).toBe(true);
    expect(r.data?.handSize).toBe(7);
  });

  it("descreve os 4 níveis de humor em ordem", () => {
    expect(HUMOR_LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    expect(humorLevelInfo(4).name).toBe("Sem Filtro");
  });
});

describe("variáveis de ambiente", () => {
  const good = {
    supabaseUrl: "https://abcd.supabase.co",
    supabasePublishableKey: "sb_publishable_1234567890abcdef",
    supabaseSecretKey: "sb_secret_1234567890abcdefghij",
  };

  it("aceita configuração completa", () => {
    expect(parsePublicEnv(good).ok).toBe(true);
    expect(parseServerEnv(good).ok).toBe(true);
  });

  it("lista pelo nome real o que está faltando", () => {
    const r = parseServerEnv({ supabaseUrl: "nao-e-url" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]);
    }
  });

  it("a configuração pública não exige a chave secreta", () => {
    expect(parsePublicEnv({ ...good, supabaseSecretKey: undefined }).ok).toBe(true);
  });
});

describe("preferências locais", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it("devolve o padrão sem armazenamento ou com dado corrompido", () => {
    expect(readLocalSettings(undefined)).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(readLocalSettings(memoryStorage({ [LOCAL_SETTINGS_KEY]: "{quebrado" }))).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it("corrige campos inválidos sem perder os válidos", () => {
    const s = memoryStorage({ [LOCAL_SETTINGS_KEY]: JSON.stringify({ sound: "sim", vibration: false }) });
    expect(readLocalSettings(s)).toEqual({ ...DEFAULT_LOCAL_SETTINGS, vibration: false });
  });

  it("salva e lê de volta", () => {
    const s = memoryStorage();
    expect(writeLocalSettings(s, { ...DEFAULT_LOCAL_SETTINGS, reducedMotion: true })).toBe(true);
    expect(readLocalSettings(s).reducedMotion).toBe(true);
  });

  it("não quebra se o navegador bloquear o armazenamento", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(readLocalSettings(blocked)).toEqual(DEFAULT_LOCAL_SETTINGS);
    expect(writeLocalSettings(blocked, DEFAULT_LOCAL_SETTINGS)).toBe(false);
  });
});
