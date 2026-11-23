"use client";

import { useEffect, useState } from "react";
import { GameCard } from "@/components/game/GameCard";
import { LevelBadge } from "@/components/game/LevelBadge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";
import { StickyActions } from "@/components/ui/StickyActions";
import { useCountdown } from "@/hooks/useCountdown";
import { useLocalSettings } from "@/hooks/useLocalSettings";
import { play } from "@/lib/client/feedback";
import type { PlayerView } from "@/engine";
import type { ClientAction } from "@/lib/api-schemas";
import { fillCard } from "@/lib/card-text";
import { LIMITS } from "@/lib/game-config";
import { PlayerList, Progress, Scoreboard, TimerRing } from "./parts";
import { SettingsControls } from "./SettingsControls";

export type PhaseProps = {
  code: string;
  view: PlayerView;
  send: (a: ClientAction) => Promise<boolean>;
  busy: boolean;
  serverNow: () => number;
};

const nick = (view: PlayerView, id: string | null) => view.players.find((p) => p.id === id)?.nickname ?? "Alguém";

// ---------------------------------------------------------------------------
// Sala de espera
// ---------------------------------------------------------------------------

export function LobbyPhase({ code, view, send, busy }: PhaseProps) {
  const me = view.you!;
  const [editing, setEditing] = useState(false);
  const [kick, setKick] = useState<{ id: string; nickname: string } | null>(null);
  const [shared, setShared] = useState(false);
  const online = view.players.filter((p) => p.online).length;
  const missing = Math.max(0, LIMITS.players.min - online);

  async function share() {
    const url = `${window.location.origin}/s/${code}`;
    const text = `Bora jogar Scragbadum? Entra na minha sala: ${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Scragbadum!", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      /* a pessoa cancelou o compartilhamento */
    }
  }

  return (
    <>
      <section className="grid gap-1.5 text-center" aria-label="Código da sala">
        <span className="text-xs font-black tracking-[.1em] text-texto-2 uppercase">Código da sala</span>
        <p className="rounded-[14px] border-2 border-dashed border-amarelo bg-carta-preta py-2 font-display text-[40px] tracking-[.12em] text-amarelo">{code}</p>
      </section>
      <Button variant="secondary" block onClick={share}>
        {shared ? "Convite copiado!" : "Chamar a galera"}
      </Button>

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black tracking-[.1em] text-texto-2 uppercase">
          Jogadores · {view.players.length}/{view.settings.maxPlayers}
        </h2>
        <span className="text-[13px] text-texto-2">Mínimo {LIMITS.players.min}</span>
      </div>
      <PlayerList players={view.players} meId={me.id} onKick={me.isHost ? (p) => setKick(p) : undefined} />

      <section className="grid gap-2 rounded-[14px] bg-breu-2 p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <LevelBadge level={view.settings.humorLevel} />
          <span>{view.settings.pointsToWin} pontos</span>
          <span className="text-texto-2">·</span>
          <span>{view.settings.answerSeconds ? `${view.settings.answerSeconds} s por resposta` : "sem tempo"}</span>
        </div>
        {me.isHost && (
          <button type="button" onClick={() => setEditing(true)} className="justify-self-start text-sm font-extrabold text-ciano underline underline-offset-4">
            Mudar regras
          </button>
        )}
      </section>

      <StickyActions>
        {me.isHost ? (
          <>
            <Button block disabled={busy || missing > 0} onClick={() => send({ type: "START_GAME" })}>
              {missing > 0 ? `Falta${missing > 1 ? "m" : ""} ${missing}` : "Começar a farra"}
            </Button>
            {missing > 0 && <p className="text-center text-sm text-texto-2">Falta{missing > 1 ? "m" : ""} {missing} pessoa{missing > 1 ? "s" : ""} para a farra começar.</p>}
          </>
        ) : (
          <p className="rounded-[14px] bg-breu-2 p-4 text-center font-bold text-texto-2">Esperando {nick(view, view.hostId)} começar a farra...</p>
        )}
      </StickyActions>

      <Sheet open={editing} title="Regras da sala" onClose={() => setEditing(false)}>
        <SettingsControls value={view.settings} onChange={(patch) => void send({ type: "UPDATE_SETTINGS", settings: patch })} />
        <Button block onClick={() => setEditing(false)}>
          Pronto
        </Button>
      </Sheet>
      <Sheet open={kick !== null} title={`Remover ${kick?.nickname ?? ""}?`} tone="danger" onClose={() => setKick(null)}>
        <p className="text-sm text-texto-2">A pessoa sai da sala e não consegue voltar com este código.</p>
        <Button
          block
          variant="danger"
          onClick={() => {
            if (kick) void send({ type: "KICK", playerId: kick.id });
            setKick(null);
          }}
        >
          Remover
        </Button>
        <Button block variant="ghost" onClick={() => setKick(null)}>
          Cancelar
        </Button>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rodada: cabeçalho comum
// ---------------------------------------------------------------------------

function RoundHud({ view, serverNow }: Pick<PhaseProps, "view" | "serverNow">) {
  const r = view.round!;
  const seconds = useCountdown(r.deadline, serverNow);
  const { settings } = useLocalSettings();
  // Tique nos últimos 5 segundos para quem ainda precisa agir.
  const mustAct = view.phase === "submitting" ? !view.you?.isJudge && !view.you?.submission && !view.you?.waitingNextRound : Boolean(view.you?.isJudge);
  useEffect(() => {
    if (settings.sound && mustAct && seconds !== null && seconds > 0 && seconds <= 5) play("tick");
  }, [seconds, settings.sound, mustAct]);
  const total = view.phase === "judging" ? Math.max(60, view.settings.answerSeconds) : view.settings.answerSeconds;
  return (
    <div className="flex items-center gap-3">
      <TimerRing seconds={seconds} total={total || 60} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span className="font-display text-sm text-texto-2">
          RODADA {r.number} · {view.players.length} JOGADORES
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ciano px-2 py-[3px] text-[11px] font-black tracking-[.06em] text-tinta uppercase">Juiz: {nick(view, r.judgeId)}</span>
          {view.phase === "submitting" && (
            <span className="text-[13px] text-texto-2">
              {r.submittedCount} de {r.requiredCount} responderam
            </span>
          )}
        </div>
        {view.phase === "submitting" && <Progress done={r.submittedCount} total={r.requiredCount} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export function SubmittingPhase({ view, send, busy, serverNow }: PhaseProps) {
  const me = view.you!;
  const r = view.round!;
  const { settings } = useLocalSettings();
  const [picked, setPicked] = useState<string[]>([]);
  const need = r.blackCard.pick;

  function toggle(id: string) {
    if (settings.sound) play("tap");
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : need === 1 ? [id] : [...cur, id].slice(-need)));
  }

  async function submit() {
    if (picked.length !== need) return;
    const ok = await send({ type: "SUBMIT", cardIds: picked });
    if (ok && settings.sound) play("send");
    if (ok && settings.vibration) navigator.vibrate?.(30);
  }

  return (
    <>
      <RoundHud view={view} serverNow={serverNow} />
      <div className="mx-auto w-[58%] max-w-[220px]">
        <GameCard kind="question" text={r.blackCard.text} pick={r.blackCard.pick} level={view.settings.humorLevel} size="md" />
      </div>

      {me.isJudge ? (
        <section className="grid gap-3 text-center">
          <h2 className="font-display text-xl text-ciano">VOCÊ É O JUIZ. SEJA JUSTO. OU NÃO.</h2>
          <p className="text-sm text-texto-2">Quando todo mundo responder, você revela as respostas e escolhe a melhor.</p>
          <PlayerList players={view.players} meId={me.id} showSubmitted />
        </section>
      ) : me.waitingNextRound ? (
        <p className="rounded-[14px] bg-breu-2 p-4 text-center font-bold text-texto-2">Você entrou no meio da rodada. Na próxima você joga.</p>
      ) : me.submission ? (
        <section className="grid justify-items-center gap-3 text-center animate-[rise_.25s_ease-out]">
          <div className="flex gap-2">
            {me.submission.map((c) => (
              <div key={c.id} className="w-[120px] -rotate-3">
                <GameCard kind="answer" text={c.text} size="sm" />
              </div>
            ))}
          </div>
          <h2 className="font-display text-xl text-ciano">ENVIADA. AGORA É REZAR.</h2>
          <p className="text-sm text-texto-2">Ninguém vê quem mandou o quê até o juiz decidir.</p>
        </section>
      ) : (
        <section className="grid gap-2" aria-label="Sua mão">
          <h2 className="text-xs font-black tracking-[.1em] text-texto-2 uppercase">
            Sua mão · {need === 2 ? "escolha 2, na ordem" : "toque para escolher"}
          </h2>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-4 pb-3">
            {me.hand.map((c, i) => {
              const order = picked.indexOf(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={order >= 0}
                  className={`relative w-[140px] shrink-0 snap-center text-left transition-transform duration-150 ${i % 2 ? "rotate-2" : "-rotate-2"}`}
                >
                  <GameCard kind="answer" text={c.text} selected={order >= 0} />
                  {need === 2 && order >= 0 && (
                    <span className="absolute -top-1 -left-1 grid size-7 place-items-center rounded-full bg-amarelo font-display text-sm text-tinta shadow-[2px_2px_0_#000]">{order + 1}</span>
                  )}
                </button>
              );
            })}
          </div>
          <StickyActions>
            <Button block disabled={busy || picked.length !== need} onClick={submit}>
              {busy ? "Mandando..." : picked.length === need ? "Mandar essa" : need === 2 ? `Escolha ${need - picked.length} carta${need - picked.length > 1 ? "s" : ""}` : "Escolha uma carta"}
            </Button>
          </StickyActions>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Julgamento
// ---------------------------------------------------------------------------

export function JudgingPhase({ view, send, busy, serverNow }: PhaseProps) {
  const me = view.you!;
  const r = view.round!;
  const [chosen, setChosen] = useState<number | null>(null);
  const allRevealed = r.answers.every((a) => a.cards !== null);
  const nextHidden = r.answers.findIndex((a) => a.cards === null);
  const isJudge = me.isJudge;

  return (
    <>
      <RoundHud view={view} serverNow={serverNow} />
      <div className="mx-auto w-[50%] max-w-[190px]">
        <GameCard kind="question" text={r.blackCard.text} pick={r.blackCard.pick} size="md" />
      </div>
      <p className="text-center text-sm text-texto-2" aria-live="polite">
        {isJudge
          ? allRevealed
            ? "Agora toque na sua favorita."
            : "Toque na carta em destaque para revelar. Lê em voz alta, faz suspense."
          : allRevealed
            ? `${nick(view, r.judgeId)} está escolhendo...`
            : `${nick(view, r.judgeId)} está revelando as respostas.`}
      </p>
      <div className="grid grid-cols-2 gap-3.5">
        {r.answers.map((a) => {
          const hidden = a.cards === null;
          // As respostas são reveladas em ordem: só a próxima da fila pode ser tocada, e é ela que vira.
          const isNext = hidden && a.index === nextHidden;
          return (
            <button
              key={a.index}
              type="button"
              disabled={!isJudge || (hidden && !isNext)}
              aria-label={hidden ? `Resposta ${a.index + 1}, escondida${isNext && isJudge ? ", toque para revelar" : ""}` : a.cards!.map((c) => c.text).join(" + ")}
              aria-pressed={hidden ? undefined : chosen === a.index}
              onClick={() => {
                if (isNext) void send({ type: "REVEAL_NEXT" });
                else if (!hidden && allRevealed) setChosen(a.index);
              }}
              className="text-left disabled:cursor-default"
            >
              {hidden ? (
                <div
                  className={`grid aspect-[5/7] place-items-center rounded-carta border-2 border-dashed font-display text-4xl ${
                    isNext && isJudge ? "border-amarelo bg-breu-2 text-amarelo animate-pulse" : "border-breu-3 bg-breu-2 text-texto-2/50"
                  }`}
                >
                  ?
                </div>
              ) : (
                <div className={`grid gap-1 animate-[flip-in_.35s_ease-out] ${chosen === a.index ? "rounded-carta shadow-[0_0_0_3px_var(--color-rosa)]" : ""}`}>
                  {a.cards!.map((c) => (
                    <GameCard key={c.id} kind="answer" text={c.text} size="sm" />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {isJudge && (
        <StickyActions>
          <Button variant="win" block disabled={busy || !allRevealed || chosen === null} onClick={() => chosen !== null && send({ type: "PICK_WINNER", answerIndex: chosen })}>
            {!allRevealed ? "Revele todas" : chosen === null ? "Escolha a melhor" : "Essa é a melhor"}
          </Button>
        </StickyActions>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Resultado da rodada
// ---------------------------------------------------------------------------

export function RoundResultPhase({ view, send, busy, serverNow }: PhaseProps) {
  const r = view.round!;
  const winner = r.answers.find((a) => a.winner);
  const seconds = useCountdown(r.nextRoundAt, serverNow);
  const parts = winner?.cards ? fillCard(r.blackCard.text, winner.cards.map((c) => c.text)) : [];
  return (
    <>
      <span className="text-center font-display text-sm text-texto-2">RODADA {r.number} · RESULTADO</span>
      <div className="relative mx-auto w-[68%] max-w-[260px]">
        <div className="relative flex aspect-[5/7] flex-col justify-between rounded-carta border-2 border-breu-3 bg-carta-preta px-4 pt-[18px] pb-3.5 font-extrabold text-papel shadow-rosa [font-stretch:92%]">
          <p className="text-lg leading-[1.2]">
            {parts.map((p, i) => (
              <span key={i} className={p.type === "answer" ? "text-amarelo" : ""}>
                {p.value}
              </span>
            ))}
          </p>
          <span className="font-display text-[9px] text-texto-2">SCRAGBADUM!</span>
          <span className="absolute top-[70%] left-1/2 rounded-[10px] border-4 border-[#d61f6e] bg-papel/90 px-2.5 py-0.5 font-display text-[26px] text-[#d61f6e] animate-[stamp_.5s_ease-out_both] [transform:translate(-50%,-50%)_rotate(-14deg)]">
            VENCEU!
          </span>
        </div>
      </div>
      <div className="grid gap-1 text-center">
        <span className="text-sm text-texto-2">Resposta de</span>
        <strong className="font-display text-2xl text-rosa">{nick(view, r.winnerId).toUpperCase()}</strong>
        <span className="text-sm text-texto-2">+1 ponto</span>
      </div>
      <Scoreboard players={view.players} highlight={r.winnerId} pointsToWin={view.settings.pointsToWin} />
      <StickyActions>
        {view.you?.isHost && (
          <Button block disabled={busy} onClick={() => send({ type: "NEXT_ROUND" })}>
            Próxima rodada
          </Button>
        )}
        {seconds !== null && <p className="text-center text-sm text-texto-2">Próxima rodada em {seconds} s</p>}
      </StickyActions>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pausa e fim
// ---------------------------------------------------------------------------

export function PausedPhase({ view }: PhaseProps) {
  return (
    <section className="my-auto grid gap-4 text-center">
      <h2 className="font-display text-2xl text-amarelo">PARTIDA PAUSADA</h2>
      <p className="text-texto-2">Ficou pouca gente na sala. O jogo volta sozinho quando houver pelo menos {LIMITS.players.min} pessoas.</p>
      <PlayerList players={view.players} meId={view.you?.id ?? null} />
    </section>
  );
}

function formatDuration(ms: number) {
  const min = Math.round(ms / 60000);
  return min < 1 ? "menos de 1 minuto" : `${min} minuto${min > 1 ? "s" : ""}`;
}

export function GameOverPhase({ view, send, busy, onLeave }: PhaseProps & { onLeave: () => void }) {
  const res = view.result!;
  const names = res.winners.map((id) => nick(view, id) || res.ranking.find((r) => r.id === id)?.nickname);
  const fastest = res.stats.fastest;
  const champion = res.stats.winningCards.at(-1);
  return (
    <>
      <section className="mt-2 grid gap-1.5 text-center animate-[pop-in_.3s_ease-out]">
        <span className="text-xs font-black tracking-[.1em] text-texto-2 uppercase">Fim da partida</span>
        <h2 className="font-display text-3xl leading-tight text-papel">
          <span className="text-amarelo">{names.join(" e ").toUpperCase()}</span>
          <br />
          {names.length > 1 ? "EMPATARAM!" : "VENCEU O SCRAGBADUM!"}
        </h2>
      </section>
      <ol className="grid gap-2" aria-label="Ranking final">
        {res.ranking.map((r) => (
          <li key={r.id} className={`flex items-center gap-2.5 rounded-xl bg-breu-2 px-3 py-2 ${r.rank === 1 ? "shadow-[inset_0_0_0_2px_var(--color-amarelo)]" : ""}`}>
            <span className="w-8 font-display text-texto-2">{r.rank}º</span>
            <span className="min-w-0 flex-1 truncate font-extrabold">{r.nickname}</span>
            <span className="font-display text-lg text-amarelo tabular-nums">{r.score}</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-2.5">
        <Stat label="Rodadas" value={String(res.stats.rounds)} />
        <Stat label="Duração" value={formatDuration(res.stats.durationMs)} />
        {fastest && <Stat label="Mais rápido" value={`${nick(view, fastest.playerId)} · ${Math.round(fastest.avgMs / 1000)} s`} />}
        {champion && <Stat label="Resposta decisiva" value={champion.text} />}
      </dl>
      <StickyActions>
        {view.you?.isHost ? (
          <Button block disabled={busy} onClick={() => send({ type: "PLAY_AGAIN" })}>
            Jogar novamente
          </Button>
        ) : (
          <p className="text-center text-sm text-texto-2">Se {nick(view, view.hostId)} quiser jogar de novo, você vai junto.</p>
        )}
        <Button block variant="secondary" onClick={onLeave}>
          Voltar ao menu
        </Button>
      </StickyActions>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-breu-2 p-3">
      <dt className="text-[11px] font-extrabold tracking-[.06em] text-texto-2 uppercase">{label}</dt>
      <dd className="text-[15px] font-bold">{value}</dd>
    </div>
  );
}
