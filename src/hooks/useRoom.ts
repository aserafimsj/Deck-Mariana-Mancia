"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAction } from "@/lib/api-schemas";
import { api, type ApiError, type ApiResult } from "@/lib/client/api";
import { getPublicEnv } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { RoomResponse } from "@/server/game-service";

const REALTIME = getPublicEnv().ok;
/** Sinal de vida + atualização: mais frequente sem tempo real, para o jogo não parecer travado. */
const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS) || (REALTIME ? 8_000 : 2_500);

export type RoomState = {
  data: RoomResponse | null;
  /** Erro que impede mostrar a sala (sala não existe, removido...). */
  fatal: ApiError | null;
  /** Erro passageiro de uma ação (mostrado como aviso). */
  notice: ApiError | null;
  offline: boolean;
  busy: boolean;
};

/**
 * Mantém a sala sincronizada com o servidor:
 * - escuta o aviso de "versão nova" pelo tempo real e busca a própria visão;
 * - dá sinal de vida periodicamente (o que também faz o servidor conferir prazos);
 * - ressincroniza ao voltar do segundo plano ou recuperar a internet.
 */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState>({ data: null, fatal: null, notice: null, offline: false, busy: false });
  const version = useRef(0);
  const offset = useRef(0);

  const apply = useCallback((r: ApiResult, fromAction = false) => {
    if (r.ok) {
      offset.current = r.data.serverNow - Date.now();
      // Respostas podem chegar fora de ordem: nunca volta para uma versão mais antiga.
      if (r.data.version < version.current) return;
      version.current = r.data.version;
      setState((s) => ({ ...s, data: r.data, fatal: null, offline: false, notice: fromAction ? null : s.notice }));
      return;
    }
    const e = r.error;
    if (e.code === "OFFLINE") return setState((s) => ({ ...s, offline: true }));
    if (["ROOM_NOT_FOUND", "KICKED", "NOT_CONFIGURED"].includes(e.code)) return setState((s) => ({ ...s, fatal: e, offline: false }));
    setState((s) => ({ ...s, notice: e, offline: false }));
  }, []);

  const refresh = useCallback(async () => apply(await api.view(code)), [apply, code]);

  useEffect(() => {
    let alive = true;
    const run = () => alive && void refresh();
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, POLL_MS);
    const onWake = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", run);
    window.addEventListener("focus", run);

    let unsubscribe = () => {};
    if (REALTIME) {
      // O canal só diz "mudou" (nunca traz dados). Como qualquer um com a chave pública poderia
      // mandar avisos falsos, as buscas disparadas por ele são limitadas a uma a cada 500 ms.
      let lastRealtimeFetch = 0;
      let pendingFetch: number | null = null;
      const throttledRun = () => {
        const wait = 500 - (Date.now() - lastRealtimeFetch);
        if (wait <= 0) {
          lastRealtimeFetch = Date.now();
          run();
        } else if (pendingFetch === null) {
          pendingFetch = window.setTimeout(() => {
            pendingFetch = null;
            lastRealtimeFetch = Date.now();
            run();
          }, wait);
        }
      };
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel(`room:${code}`)
        .on("broadcast", { event: "state" }, (msg) => {
          const v = Number((msg.payload as { version?: number })?.version);
          if (Number.isFinite(v) && v > version.current) throttledRun();
        })
        .subscribe();
      unsubscribe = () => {
        if (pendingFetch !== null) window.clearTimeout(pendingFetch);
        void supabase.removeChannel(channel);
      };
    }

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", run);
      window.removeEventListener("focus", run);
      unsubscribe();
    };
  }, [code, refresh]);

  const send = useCallback(
    async (action: ClientAction) => {
      setState((s) => ({ ...s, busy: true }));
      const r = await api.act(code, action);
      apply(r, true);
      setState((s) => ({ ...s, busy: false }));
      return r.ok;
    },
    [apply, code],
  );

  const join = useCallback(
    async (nickname: string, acceptedLevel4?: boolean) => {
      setState((s) => ({ ...s, busy: true }));
      const r = await api.join(code, nickname, acceptedLevel4);
      apply(r, true);
      setState((s) => ({ ...s, busy: false }));
      return r;
    },
    [apply, code],
  );

  const dismissNotice = useCallback(() => setState((s) => ({ ...s, notice: null })), []);
  /** Hora do servidor (para os cronômetros não dependerem do relógio do celular). */
  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { ...state, send, join, refresh, dismissNotice, serverNow };
}
