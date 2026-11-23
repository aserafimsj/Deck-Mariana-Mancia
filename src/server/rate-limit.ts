/**
 * Limite de requisições por chave (usuário ou IP), em memória.
 * Na Vercel cada instância tem a sua memória, então o limite é por instância:
 * barra abusos simples (cliques em loop, scripts); um limite global fica para a Etapa 8.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now: number): boolean {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
