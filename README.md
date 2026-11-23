# Scragbadum!

Nome provisório. Party game digital de humor coletivo: uma carta pergunta, cartas resposta e um juiz rotativo. Joga no celular, sem cadastro, entrando por código ou link.

**Status:** Etapas 3 e 4 concluídas. Etapa 5 (multiplayer e telas) jogável localmente; falta publicar no Supabase/Vercel.

- [Plano de desenvolvimento](docs/PLANO_DE_DESENVOLVIMENTO.md)
- [Identidade visual e protótipo](docs/identidade-visual/index.html)
- [Regras do jogo como o motor aplica](docs/REGRAS.md)

## O que já funciona

| Parte | Situação |
|---|---|
| Partida completa | Criar sala, entrar por código ou link, sala de espera, respostas, revelação, vencedor, placar, fim de partida e jogar novamente. Testado com 3 navegadores jogando juntos. |
| Tela inicial, Como jogar, Configurações | Funcionando. |
| Identidade visual (cores, fontes, cartas, botões) | Componentes prontos em `src/components`. |
| Banco de dados | Esquema completo, regras de acesso (RLS) e 22 cartas pergunta + 60 cartas resposta originais. |
| Gravação segura do estado da partida | Função atômica com controle de versão e proteção contra ação duplicada. |
| Login | Anônimo pelo Supabase (sem cadastro). Em desenvolvimento, login local de teste. |
| PWA | Manifesto e ícones; instalável. Funcionamento offline fica para a Etapa 6. |
| Motor do jogo | Regras completas em `src/engine/` (função pura, determinística): rodadas, juiz, tempo, desconexões, anfitrião, pausa. Cada jogador recebe só o que pode ver. |
| Servidor do jogo | Rotas em `src/app/api/rooms`: valida tudo, grava com controle de versão, repete sozinho se duas ações chegam juntas, ignora reenvios e avisa os celulares em tempo real. |
| Testes e CI | 101 testes unitários (incluindo partidas simuladas), 47 de banco, 10 ponta a ponta. GitHub Actions roda tudo a cada push. |

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

Abra http://localhost:3000.

### Jogar localmente, sem Supabase

Dá para jogar partidas de verdade no computador (abra várias janelas anônimas para simular os jogadores):

```bash
pnpm db:local
```

```bash
DATABASE_URL=postgres://postgres@localhost:54329/postgres node scripts/db-setup.mjs
```

Crie um `.env.local` com:

```
SUPABASE_DB_URL=postgres://postgres@localhost:54329/scragbadum_dev
DEV_AUTH_SECRET=um-segredo-qualquer-com-16-ou-mais
NEXT_PUBLIC_DEV_AUTH=1
```

e rode `pnpm dev`. Sem tempo real, os celulares se atualizam a cada 2,5 segundos.

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

5. Copie a URL do **Transaction pooler** (Painel > Connect, porta 6543) para `SUPABASE_DB_URL`.
6. Confira: `pnpm dev` e abra http://localhost:3000/api/health. Deve aparecer `"database": "ok"`.

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
| `pnpm test:e2e` | Telas reais num celular simulado, incluindo uma partida com 3 navegadores | Chromium do Playwright + `pnpm db:e2e` |
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
2. Em **Settings > Environment Variables**, cadastre as variáveis do Supabase e a `SUPABASE_DB_URL`. Não cadastre `DEV_AUTH_SECRET` nem `NEXT_PUBLIC_DEV_AUTH` na produção.
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
  server/           Só servidor: serviço do jogo, banco, autenticação, tempo real, limites
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
- Toda ação de jogo tem um `client_action_id`: reenvios não duplicam nada.
- O canal de tempo real só transporta o número da versão; cada celular busca a própria visão.
- Limite de requisições por usuário e por IP (por instância do servidor; um limite global fica para a Etapa 8).
- Pendências de segurança registradas para a Etapa 8: verificação do certificado do banco quando `SUPABASE_DB_CA_CERT` não estiver definido, CSP completa e lista de termos bloqueados em apelidos.
