"use client";

import { useEffect } from "react";
import { useLocalSettings } from "@/hooks/useLocalSettings";

/** Aplica a opção "Menos animação" das Configurações no documento inteiro. */
export function MotionPreference() {
  const { settings } = useLocalSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (settings.reducedMotion) root.dataset.motion = "reduced";
    else delete root.dataset.motion;
  }, [settings.reducedMotion]);
  return null;
}
