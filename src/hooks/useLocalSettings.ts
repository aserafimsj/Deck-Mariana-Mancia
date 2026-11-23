"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  readLocalSettings,
  writeLocalSettings,
  type LocalSettings,
} from "@/lib/local-settings";

const EVENT = "scragbadum:settings";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Cache para o useSyncExternalStore receber sempre a mesma referência enquanto nada mudar.
let cachedRaw: string | null | undefined;
let cached: LocalSettings = DEFAULT_LOCAL_SETTINGS;

function getSnapshot(): LocalSettings {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(LOCAL_SETTINGS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = readLocalSettings(storage());
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === LOCAL_SETTINGS_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useLocalSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LOCAL_SETTINGS);

  const update = useCallback((patch: Partial<LocalSettings>) => {
    const saved = writeLocalSettings(storage(), { ...getSnapshot(), ...patch });
    window.dispatchEvent(new Event(EVENT));
    return saved;
  }, []);

  return { settings, update };
}
