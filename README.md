# Scragbadum!

Nome provisório. Party game digital de humor coletivo: uma carta pergunta, cartas resposta e um juiz rotativo. Joga no celular, sem cadastro, entrando por código ou link.

**Status:** Etapas 3 (Fundação) e 4 (motor do jogo) concluídas. Próxima: Etapa 5 (multiplayer e telas da partida).

- [Plano de desenvolvimento](docs/PLANO_DE_DESENVOLVIMENTO.md)
- [Identidade visual e protótipo](docs/identidade-visual/index.html)
- [Regras do jogo como o motor aplica](docs/REGRAS.md)

## O que já funciona

| Parte | Situação |
|---|---|
| Tela inicial, Como jogar, Configurações | Funcionando. Os botões de sala aparecem desligados até a Etapa 5. |
| Identidade visual (cores, fontes, cartas, botões) | Componentes prontos em `src/components`. |
| Banco de dados | Esquema completo, regras de acesso (RLS) e 22 cartas pergunta + 60 cartas resposta originais. |
| Gravação segura do estado da partida | Função atômica com controle de versão e proteção contra ação duplicada. |
| Login anônimo | Código pronto (`ensureAnonymousSession`); entra em uso na Etapa 5. |
| PWA | Manifesto e ícones; instalável. Funcionamento offline fica para a Etapa 6. |
| Motor do jogo | Regras completas em `src/engine/` (função pura, determinística): rodadas, juiz, tempo, desconexões, anfitrião, pausa. Cada jogador recebe só o que pode ver. |
| Testes e CI | 94 testes unitários (incluindo simulação de partidas aleatórias), 33 de banco, 6 ponta a ponta. GitHub Actions roda tudo a cada push. |

## Tecnologias

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS 4 · Supabase (Postgres, Auth anônima, Realtime) · Zod · Vitest · Playwright · Vercel.

Motivos de cada escolha: seção 4 do [plano](docs/PLANO_DE_DESENVOLVIMENTO.md).

## Rodar no computador

Pré-requisitos: Node.js 22 ou mais novo e pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

Abra http://localhost:3000. Sem Supabase configurado, as telas atuais funcionam normalmente e `/api/health` responde `"supabase": "not_configured"`.

## Configurar o Supabase

1. Crie um projeto em https://supabase.com, região **South America (São Paulo)**.
2. Ative o login anônimo: **Authentication > Sign In / Providers > Anonymous Sign-Ins**.
3. Copie `.env.example` para `.env.local` e preencha com os valores de **Project Settings > API Keys**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a chave antiga "anon" também funciona)
   - `SUPABASE_SECRET_KEY` (a chave antiga "service_role" também funciona). **Nunca** coloque essa chave com prefixo `NEXT_PUBLIC_`.
4. Aplique o banco (migrations + cartas iniciais) com a CLI do Supabase:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push --include-seed
```

   Sem a CLI: cole no **SQL Editor** do painel, nesta ordem, os arquivos de `supabase/migrations/` e depois `supabase/seed.sql`.

5. Confira: `pnpm dev` e abra http://localhost:3000/api/health. Deve aparecer `"database": "ok"`.

### Limpeza automática de salas

Salas sem atividade há 2 horas são fechadas pela função `close_inactive_rooms`. Para agendar, ative a extensão **pg_cron** (Database > Extensions) e rode no SQL Editor:

```sql
select cron.schedule('fechar-salas-inativas', '*/15 * * * *', $$select public.close_inactive_rooms()$$);
```

### Primeiro administrador

Crie o usuário em **Authentication > Users > Add user** e rode no SQL Editor, trocando o e-mail:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'voce@exemplo.com';
```

O painel administrativo chega na Etapa 7.

## Testes

| Comando | O que testa | Precisa de |
|---|---|---|
| `pnpm test` | Motor do jogo (inclui 200 partidas simuladas), validações, texto das cartas, autenticação | Nada |
| `pnpm test:db` | Migrations, seed, RLS, restrições, gravação atômica do estado | Postgres (abaixo) |
| `pnpm test:e2e` | Telas reais num celular simulado | Chromium do Playwright |
| `pnpm check` | Lint + tipos + testes unitários | Nada |

Os testes de banco criam um banco temporário, aplicam tudo e apagam no final. Para ter um Postgres local sem Docker:

```bash
pnpm db:local
```

```bash
DATABASE_URL=postgres://postgres@localhost:54329/postgres pnpm test:db
```

O script usa os binários do Postgres instalados na máquina (`/usr/lib/postgresql/*/bin`). O arquivo `tests/db/supabase-stub.sql` simula o mínimo do Supabase (papéis, `auth.users`, `auth.uid()`) para testar as políticas de acesso num Postgres comum.

Para os testes ponta a ponta, instale o navegador uma vez com `pnpm exec playwright install chromium`.

## Publicar na Vercel

1. Importe o repositório em https://vercel.com/new.
2. Em **Settings > Environment Variables**, cadastre as três variáveis do Supabase.
3. Em **Settings > Functions**, escolha a região **São Paulo (gru1)**, perto do banco.
4. Depois do deploy, abra `/api/health` no domínio publicado para conferir.

## Estrutura

```
src/
  app/              Rotas: telas e /api
  components/       ui/ (botões, cabeçalho) · brand/ (logo) · game/ (cartas, selos)
  hooks/            Hooks de React (preferências locais)
  engine/           Motor do jogo: regras, projeção por jogador (sem I/O, sem relógio)
  lib/              Regras e validações compartilhadas (sem dependência de servidor)
  lib/supabase/     Cliente do navegador e sessão anônima
  server/           Só servidor: cliente com chave secreta, autenticação de requisições
supabase/
  migrations/       Esquema e políticas de acesso, versionados
  seed.sql          Cartas iniciais (originais)
  config.toml       Configuração da CLI do Supabase
tests/
  unit/  db/  e2e/
docs/               Plano, identidade visual
```

## Regras de segurança do projeto

- O servidor é a única fonte da verdade. O navegador só pede ações; quem valida e grava é o servidor.
- Nenhuma tabela de jogo aceita escrita direta do navegador (RLS). O estado completo da partida (`game_states`) não é legível por jogadores.
- A chave secreta do Supabase só existe no servidor (`src/server/`, protegido por `server-only`).
- Toda ação de jogo terá um `client_action_id`: reenvios não duplicam nada.
