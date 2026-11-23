import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "win" | "ghost" | "danger";

const BASE =
  "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] px-6 font-display text-[17px] uppercase tracking-[.02em] transition-[transform,box-shadow] duration-75 select-none active:translate-x-[3px] active:translate-y-[3px] disabled:pointer-events-none disabled:bg-breu-3 disabled:text-texto-2 disabled:shadow-none disabled:border-transparent";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-amarelo text-tinta shadow-dura-sm active:shadow-press",
  secondary: "border-2 border-papel text-papel",
  win: "bg-rosa text-white shadow-dura-sm active:shadow-press",
  ghost: "min-h-11 bg-breu-3 text-texto text-sm",
  danger: "bg-vermelho text-white shadow-dura-sm active:shadow-press",
};

function classes(variant: ButtonVariant, block: boolean, extra?: string) {
  return [BASE, VARIANTS[variant], block ? "w-full" : "", extra ?? ""].join(" ");
}

type CommonProps = { variant?: ButtonVariant; block?: boolean; children: ReactNode };

export function Button({ variant = "primary", block = false, className, type = "button", ...rest }: CommonProps & ComponentProps<"button">) {
  return <button type={type} className={classes(variant, block, className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", block = false, className, ...rest }: CommonProps & ComponentProps<typeof Link>) {
  return <Link className={classes(variant, block, className)} {...rest} />;
}
