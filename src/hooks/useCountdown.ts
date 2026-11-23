"use client";

import { useEffect, useState } from "react";

/** Segundos restantes até `deadline` (hora do servidor). null = sem prazo. */
export function useCountdown(deadline: number | null, serverNow: () => number): number | null {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (deadline === null) return;
    const t = window.setInterval(() => setNow(serverNow()), 250);
    return () => window.clearInterval(t);
  }, [deadline, serverNow]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
