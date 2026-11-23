"use client";

import { useState } from "react";
import { useLocalSettings } from "./useLocalSettings";

/** Campo de apelido que começa com o apelido padrão das Configurações e lembra o último usado. */
export function useNicknameField() {
  const { settings, update } = useLocalSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? settings.defaultNickname;
  return {
    value,
    setValue: setDraft,
    remember: (nickname: string) => update({ defaultNickname: nickname }),
  };
}
