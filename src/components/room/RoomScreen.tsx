"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { LevelBadge } from "@/components/game/LevelBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Hint, Label, TextInput } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Screen } from "@/components/ui/ScreenHeader";
import { useNicknameField } from "@/hooks/useDefaultNickname";
import { useRoom } from "@/hooks/useRoom";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/nickname";
import { normalizeRoomCode } from "@/lib/room-code";
import { Level4Warning } from "./Level4Warning";
import { GameOverPhase, JudgingPhase, LobbyPhase, PausedPhase, RoundResultPhase, SubmittingPhase, type PhaseProps } from "./phases";

/** Tela da sala: uma rota só, que muda conforme a fase da partida. */
export function RoomScreen() {
  const params = useParams<{ code: string }>();
  const code = normalizeRoomCode(params.code ?? "");
  const router = useRouter();
  const room = useRoom(code);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function leave() {
    setConfirmLeave(false);
    await room.send({ type: "LEAVE" });
    router.push("/");
  }

  if (room.fatal) return <FatalScreen code={room.fatal.code} message={room.fatal.message} />;
  if (!room.data) {
    return (
      <Screen className="items-center justify-center">
        <p className="font-display text-xl text-texto-2 animate-pulse" role="status">
          {room.offline ? "SEM CONEXÃO..." : "ENTRANDO NA SALA..."}
        </p>
      </Screen>
    );
  }

  const { view } = room.data;
  const props: PhaseProps = { code, view, send: room.send, busy: room.busy, serverNow: room.serverNow };

  return (
    <Screen>
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (view.you ? setConfirmLeave(true) : router.push("/"))}
          aria-label="Sair da sala"
          className="grid size-11 place-items-center rounded-xl bg-breu-2 text-xl font-black"
        >
          ←
        </button>
        <span className="font-display text-[22px] tracking-[.08em] text-papel">{code}</span>
        <LevelBadge level={view.settings.humorLevel} />
      </header>
      {room.offline && (
        <p role="status" className="rounded-xl bg-breu-3 px-3 py-2 text-center text-sm font-bold">
          Sem conexão. Tentando de novo...
        </p>
      )}

      {!view.you ? (
        <JoinGate code={code} levelFour={view.settings.humorLevel === 4} join={room.join} busy={room.busy} full={view.players.length >= view.settings.maxPlayers} />
      ) : view.you.needsLevel4Accept ? (
        <Level4Warning open confirmLabel="Topo, continuar" onConfirm={() => void room.send({ type: "ACCEPT_LEVEL4" })} onCancel={() => void leave()} />
      ) : view.phase === "lobby" ? (
        <LobbyPhase {...props} />
      ) : view.phase === "submitting" ? (
        <SubmittingPhase key={view.round?.number} {...props} />
      ) : view.phase === "judging" ? (
        <JudgingPhase key={view.round?.number} {...props} />
      ) : view.phase === "round_result" ? (
        <RoundResultPhase {...props} />
      ) : view.phase === "paused" ? (
        <PausedPhase {...props} />
      ) : (
        <GameOverPhase {...props} onLeave={() => void leave()} />
      )}

      <Sheet open={confirmLeave} title="Sair da sala?" onClose={() => setConfirmLeave(false)}>
        <p className="text-sm text-texto-2">Você pode voltar depois pelo mesmo código. Seus pontos ficam guardados.</p>
        <Button block variant="danger" onClick={() => void leave()}>
          Sair
        </Button>
        <Button block variant="ghost" onClick={() => setConfirmLeave(false)}>
          Ficar
        </Button>
      </Sheet>
      <Notice message={room.notice?.message ?? null} onClose={room.dismissNotice} />
    </Screen>
  );
}

function JoinGate({ code, levelFour, join, busy, full }: { code: string; levelFour: boolean; join: ReturnType<typeof useRoom>["join"]; busy: boolean; full: boolean }) {
  const nickname = useNicknameField();
  const [error, setError] = useState<string | null>(null);
  const [askLevel4, setAskLevel4] = useState(false);

  async function go(accepted?: boolean) {
    const parsed = nicknameSchema.safeParse(nickname.value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Apelido inválido.");
    if (levelFour && !accepted) return setAskLevel4(true);
    const r = await join(parsed.data, accepted);
    if (r.ok) nickname.remember(parsed.data);
    else setError(r.error.message);
  }

  return (
    <form
      className="flex flex-1 flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <section className="grid gap-2 text-center">
        <h1 className="font-display text-2xl text-papel">TE CHAMARAM PRA FARRA!</h1>
        <p className="text-texto-2">Escolhe um apelido para entrar na sala {code}.</p>
      </section>
      <div className="grid gap-1.5">
        <Label htmlFor="join-nick">Seu apelido</Label>
        <TextInput
          id="join-nick"
          value={nickname.value}
          onChange={(e) => {
            nickname.setValue(e.target.value);
            setError(null);
          }}
          maxLength={NICKNAME_MAX + 8}
          autoComplete="nickname"
          aria-invalid={error !== null}
          aria-describedby="join-hint"
          autoFocus
        />
        <Hint id="join-hint" error={error !== null}>
          {error ?? (full ? "A sala está cheia no momento." : `Até ${NICKNAME_MAX} caracteres.`)}
        </Hint>
      </div>
      <Button type="submit" block disabled={busy} className="mt-auto">
        {busy ? "Entrando..." : "Entrar na sala"}
      </Button>
      <Level4Warning
        open={askLevel4}
        confirmLabel="Topo, entrar"
        onConfirm={() => {
          setAskLevel4(false);
          void go(true);
        }}
        onCancel={() => setAskLevel4(false)}
      />
    </form>
  );
}

function FatalScreen({ code, message }: { code: string; message: string }) {
  return (
    <Screen className="justify-center text-center">
      <h1 className="font-display text-3xl text-amarelo">{code === "KICKED" ? "VOCÊ SAIU DA FARRA" : code === "NOT_CONFIGURED" ? "QUASE LÁ" : "SALA NÃO ENCONTRADA"}</h1>
      <p className="text-texto-2">{message}</p>
      <div className="grid gap-2.5">
        <ButtonLink href="/entrar" block>
          Entrar em outra sala
        </ButtonLink>
        <Link href="/" className="font-extrabold text-ciano underline underline-offset-4">
          Voltar ao menu
        </Link>
      </div>
    </Screen>
  );
}
