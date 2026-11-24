// Teste de carga: várias salas jogando ao mesmo tempo, com jogadores simulados que se comportam
// como o app (sinal de vida a cada 2,5 s, respostas, julgamento, próxima rodada).
// Usa o login local de teste: rode contra um servidor com DEV_AUTH_SECRET (nunca em produção).
//
// Uso: node scripts/carga.mjs [url] [salas] [jogadores_por_sala] [segundos]
// Ex.: node scripts/carga.mjs http://localhost:3500 30 5 60

const BASE = process.argv[2] ?? "http://localhost:3500";
const ROOMS = Number(process.argv[3] ?? 30);
const PER_ROOM = Number(process.argv[4] ?? 5);
const SECONDS = Number(process.argv[5] ?? 60);
const POLL_MS = 2500;
// Salas começam espalhadas nos primeiros N segundos (grupos reais não começam no mesmo milissegundo).
// STAGGER=0 simula o pior caso: todas ao mesmo tempo.
const STAGGER_S = Number(process.env.STAGGER ?? 10);

const stats = new Map(); // endpoint -> { ms: number[], codes: Map }
let gamesFinished = 0;
let roundsJudged = 0;

function record(name, ms, status) {
  const s = stats.get(name) ?? { ms: [], codes: new Map() };
  s.ms.push(ms);
  s.codes.set(status, (s.codes.get(status) ?? 0) + 1);
  stats.set(name, s);
}

async function call(player, name, method, path, body) {
  const t = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        authorization: `Bearer ${player.token}`,
        "x-real-ip": player.ip, // cada jogador simulado com o próprio IP (limites são por IP; só funciona localmente)
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    status = -1;
  }
  record(name, performance.now() - t, status);
  return { status, json };
}

let ipCounter = 1;
async function newPlayer(name) {
  const res = await fetch(`${BASE}/api/dev/session`, { method: "POST" });
  const { token, userId } = await res.json();
  const n = ipCounter++;
  return { token, userId, name, ip: `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` };
}

// Como o app: em "ocupado" (409 BUSY), reenvia a mesma ação (mesmo id, idempotente) até 2 vezes.
async function act(p, code, action) {
  const body = { clientActionId: crypto.randomUUID(), action };
  let res = await call(p, `acao:${action.type}`, "POST", `/api/rooms/${code}/actions`, body);
  for (let i = 0; i < 2 && res.status === 409 && res.json?.error?.code === "BUSY"; i++) {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
    res = await call(p, `acao:${action.type} (nova tentativa)`, "POST", `/api/rooms/${code}/actions`, body);
  }
  return res;
}

async function playerLoop(p, code, host, until) {
  while (Date.now() < until) {
    const { status, json } = await call(p, "visao (sinal de vida)", "GET", `/api/rooms/${code}`);
    if (status === 200 && json?.view?.you) {
      const v = json.view;
      const r = v.round;
      if (v.phase === "submitting" && r && !v.you.isJudge && !v.you.submission && !v.you.waitingNextRound) {
        await act(p, code, { type: "SUBMIT", cardIds: v.you.hand.slice(0, r.blackCard.pick).map((c) => c.id) });
      } else if (v.phase === "judging" && v.you.isJudge) {
        const hidden = r.answers.filter((a) => a.cards === null).length;
        if (hidden > 0) await act(p, code, { type: "REVEAL_NEXT" });
        else {
          const res = await act(p, code, { type: "PICK_WINNER", answerIndex: 0 });
          if (res.status === 200) roundsJudged++;
        }
        continue; // juiz age rápido
      } else if (v.phase === "game_over" && p === host) {
        gamesFinished++;
        await act(p, code, { type: "PLAY_AGAIN" });
        await act(p, code, { type: "START_GAME" });
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS * (0.7 + Math.random() * 0.6)));
  }
}

async function room(i, until) {
  await new Promise((r) => setTimeout(r, Math.random() * STAGGER_S * 1000));
  const players = await Promise.all(Array.from({ length: PER_ROOM }, (_, k) => newPlayer(`J${i}-${k}`)));
  const host = players[0];
  const created = await call(host, "criar sala", "POST", "/api/rooms", { nickname: `Sala ${i}`, settings: { pointsToWin: 3, answerSeconds: 45 } });
  if (created.status !== 200) return;
  const code = created.json.code;
  for (const p of players.slice(1)) await call(p, "entrar", "POST", `/api/rooms/${code}/join`, { nickname: p.name });
  await act(host, code, { type: "START_GAME" });
  await Promise.all(players.map((p) => playerLoop(p, code, host, until)));
}

function pct(sorted, q) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
}

const started = Date.now();
const until = started + SECONDS * 1000;
console.log(`Carga: ${ROOMS} salas × ${PER_ROOM} jogadores = ${ROOMS * PER_ROOM} jogadores, ${SECONDS} s, início espalhado em ${STAGGER_S} s, contra ${BASE}`);
await Promise.all(Array.from({ length: ROOMS }, (_, i) => room(i, until)));

let total = 0;
let failures = 0;
const rows = [];
for (const [name, s] of [...stats].sort()) {
  const sorted = [...s.ms].sort((a, b) => a - b);
  total += sorted.length;
  const bad = [...s.codes].filter(([c]) => c < 200 || c >= 500).reduce((a, [, n]) => a + n, 0);
  failures += bad;
  rows.push({
    rota: name,
    chamadas: sorted.length,
    p50_ms: Math.round(pct(sorted, 0.5)),
    p95_ms: Math.round(pct(sorted, 0.95)),
    p99_ms: Math.round(pct(sorted, 0.99)),
    respostas: [...s.codes].map(([c, n]) => `${c}×${n}`).join(" "),
  });
}
console.table(rows);
const elapsed = (Date.now() - started) / 1000;
console.log(`Total: ${total} requisições em ${elapsed.toFixed(0)} s (${(total / elapsed).toFixed(1)}/s). Falhas (5xx ou rede): ${failures}.`);
console.log(`Rodadas julgadas: ${roundsJudged}. Partidas concluídas: ${gamesFinished}.`);
process.exit(failures > 0 ? 1 : 0);
