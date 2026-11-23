import { z } from "zod";

/** Preferências que ficam só no aparelho (não vão para o servidor). */
export const localSettingsSchema = z.object({
  sound: z.boolean().catch(true),
  vibration: z.boolean().catch(true),
  reducedMotion: z.boolean().catch(false),
  defaultNickname: z.string().max(32).catch(""),
});

export type LocalSettings = z.infer<typeof localSettingsSchema>;

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  sound: true,
  vibration: true,
  reducedMotion: false,
  defaultNickname: "",
};

export const LOCAL_SETTINGS_KEY = "scragbadum:settings:v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** Nunca lança erro: armazenamento bloqueado ou dado corrompido viram o padrão. */
export function readLocalSettings(storage: Storage | undefined): LocalSettings {
  try {
    const raw = storage?.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_LOCAL_SETTINGS;
    const parsed = localSettingsSchema.safeParse({ ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(raw) });
    return parsed.success ? parsed.data : DEFAULT_LOCAL_SETTINGS;
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export function writeLocalSettings(storage: Storage | undefined, settings: LocalSettings): boolean {
  try {
    storage?.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
    return storage !== undefined;
  } catch {
    return false;
  }
}
