"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Modal";

/** Aviso do nível Sem Filtro (decisão D2): lista o que aparece e o que nunca aparece. */
export function Level4Warning({ open, confirmLabel, onConfirm, onCancel }: { open: boolean; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const [checked, setChecked] = useState(false);
  const id = useId();
  return (
    <Sheet open={open} title="Sem Filtro. Sério mesmo." tone="danger" onClose={onCancel}>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-texto-2">
        <li>Humor negro com morte, doença e tragédias</li>
        <li>Sexo explícito, sem rodeios</li>
        <li>Religião, política e drogas</li>
        <li>Combinações que podem ofender de verdade</li>
      </ul>
      <p className="text-sm font-bold">O que não aparece nem aqui: conteúdo sexual com menores, cartas feitas para atacar um grupo e nomes de pessoas reais.</p>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm font-extrabold">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 size-[22px] shrink-0 accent-vermelho" />
        Tenho 18 anos ou mais e topo jogar assim.
      </label>
      <Button block variant="danger" disabled={!checked} onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button block variant="ghost" onClick={onCancel}>
        Melhor não
      </Button>
    </Sheet>
  );
}
