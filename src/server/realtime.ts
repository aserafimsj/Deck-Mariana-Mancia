import type { Notifier } from "./game-service";

/** Nome do canal de tempo real de uma sala. Só trafega o número da versão, nunca dados do jogo. */
export function roomChannel(code: string) {
  return `room:${code}`;
}

export const STATE_EVENT = "state";

/**
 * Avisa os celulares da sala que o estado mudou, pela API REST de broadcast do Supabase Realtime.
 * Cada celular então busca a própria visão. Se o aviso falhar, os celulares descobrem pelo sinal de vida.
 */
export function supabaseNotifier(supabaseUrl: string, secretKey: string, fetchImpl: typeof fetch = fetch): Notifier {
  return async (code, version) => {
    const res = await fetchImpl(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: secretKey },
      body: JSON.stringify({ messages: [{ topic: roomChannel(code), event: STATE_EVENT, payload: { version }, private: false }] }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`broadcast ${res.status}`);
  };
}

export const noopNotifier: Notifier = async () => {};
