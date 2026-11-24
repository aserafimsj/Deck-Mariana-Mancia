# Teste de carga

Script: `scripts/carga.mjs`. Simula salas inteiras jogando pelo HTTP, como o app: sinal de vida a cada ~2,5 s, respostas, revelação, escolha do juiz, próxima rodada e "jogar novamente". Cada jogador simulado tem sessão e IP próprios.

```bash
STAGGER=10 node scripts/carga.mjs http://localhost:3500 30 5 60
```

Argumentos: URL, salas, jogadores por sala, segundos. `STAGGER` espalha o início das salas (0 = todas no mesmo instante, o pior caso). Use só contra um servidor com o login de teste (`DEV_AUTH_SECRET`), nunca em produção.

## Ambiente da medição (24/11/2026)

Uma única máquina de 4 núcleos rodando **ao mesmo tempo** o gerador de carga, o servidor Next.js (build de produção, uma instância) e o Postgres. É um cenário pessimista: em produção, a Vercel distribui os jogadores por várias instâncias e o banco roda em máquina própria.

## Resultados

Tempos em milissegundos (p95 = 95% das requisições foram mais rápidas que isso).

**150 jogadores, 30 salas, início espalhado em 10 s (realista)** — 5.749 requisições, 0 falhas

| Rota | p50 | p95 | p99 |
|---|---|---|---|
| Sinal de vida (visão) | 7 | 19 | 31 |
| Enviar resposta | 11 | 38 | 67 |
| Revelar resposta | 10 | 18 | 31 |
| Escolher vencedora | 16 | 33 | 46 |
| Começar partida | 16 | 48 | 59 |
| Criar sala | 9 | 32 | 40 |
| Entrar na sala | 12 | 34 | 56 |

**150 jogadores, todas as salas começando no mesmo instante (pior caso)** — 0 falhas. Sinal de vida p95 23 ms; enviar resposta p95 614 ms (pico de todos respondendo ao mesmo tempo no início).

**600 jogadores, 100 salas, início espalhado em 20 s (saturação)** — 18.168 requisições (288/s), 0 falhas, 0 recusas. A máquina satura (p95 de resposta ~1,1 s): é o limite de uma instância dividindo 4 núcleos com o gerador e o banco.

Meta do plano: p95 < 500 ms. **Atendida com folga no cenário realista** (abaixo de 70 ms em todas as rotas, em várias rodadas de medição).

## O que o teste revelou e foi corrigido

1. **Muitas idas ao banco por requisição.** O sinal de vida fazia 5 consultas; agora faz 1 (sala, sinal de vida, quem sumiu, reenvio e estado numa consulta só). Sinal de vida p95: 39 → 19 ms.
2. **Espelho público regravado sem necessidade.** A lista pública de jogadores só é regravada quando muda (antes, a cada jogada).
3. **Respostas simultâneas esgotando as tentativas.** Com 6 pessoas respondendo no mesmo instante, ~4% das respostas voltavam "ocupado". Agora o servidor tenta até 8 vezes com espera aleatória, e o app reenvia sozinho (com o mesmo id, sem duplicar). Recusas: 87 → 0.
4. **Conexões com o banco configuráveis** (`DB_POOL_MAX`, padrão 5).
