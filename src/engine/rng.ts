/**
 * Gerador aleatório com semente (mulberry32). O estado fica salvo no GameState,
 * então a mesma sequência de ações sempre produz o mesmo resultado: dá para
 * reproduzir qualquer bug a partir do log de ações.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** Número em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let r = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Embaralhamento de Fisher-Yates (cópia nova). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
}

/** Semente a partir de bytes aleatórios do servidor. */
export function seedFromBytes(bytes: Uint8Array): number {
  let seed = 0;
  for (const b of bytes.slice(0, 4)) seed = ((seed << 8) | b) >>> 0;
  return seed;
}
