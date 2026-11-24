# Scragbadum!

Nome provisório. Party game digital de humor coletivo: uma carta pergunta, cartas resposta e um juiz rotativo. Joga no celular, sem cadastro, entrando por código ou link.

**Status:** Etapas 3, 4, 6 e 7 concluídas. Etapa 5 (multiplayer e telas) jogável localmente; falta publicar no Supabase/Vercel.

- [Plano de desenvolvimento](docs/PLANO_DE_DESENVOLVIMENTO.md)
- [Identidade visual e protótipo](docs/identidade-visual/index.html)
- [Regras do jogo como o motor aplica](docs/REGRAS.md)

## O que já funciona

| Parte | Situação |
|---|---|
| Partida completa | Criar sala, entrar por código ou link, sala de espera, respostas, revelação, vencedor, placar, fim de partida e jogar novamente. Testado com 3 navegadores jogando juntos. |
| Tela inicial, Como jogar, Configurações | Funcionando. |
| Identidade visual (cores, fontes, cartas, botões) | Componentes prontos em `src/components`. |
| Banco de dados | Esquema completo e regras de acesso (RLS). |
| Cartas | 107 perguntas e 308 respostas originais nos 4 níveis, em `content/baralho-base.json`. |
| Painel administrativo | `/admin`: números da semana, cartas que mais vencem e as encalhadas, gerenciar cartas (criar, editar, arquivar, importar CSV), categorias, partidas e equipe. Editor cuida do conteúdo; admin também apaga e gerencia a equipe. |
| Histórico | Cada partida, rodada, resposta e placar final fica gravado para as estatísticas. |
| Gravação segura do estado da partida | Função atômica com controle de versão e proteção contra ação duplicada. |
| Login | Anônimo pelo Supabase (sem cadastro). Em desenvolvimento, login local de teste. |
| Experiência | Sons (sem arquivos, gerados na hora), vibração, avisos de rodada, confete, tela sempre acesa durante a partida, botão principal sempre visível, anúncios para leitor de tela. Tudo respeita as Configurações. |
| PWA | Instalável (botão em Configurações), service worker com página offline. A API nunca é guardada em cache. |
| Qualidade | Lighthouse mobile: desempenho 92–100, acessibilidade 100. Auditoria automática de acessibilidade (axe) durante a partida. |
| Motor do jogo | Regras completas em `src/engine/` (função pura, determinística): rodadas, juiz, tempo, desconexões, anfitrião, pausa. Cada jogador recebe só o que pode ver. |
| Servidor do jogo | Rotas em `src/app/api/rooms`: valida tudo, grava com controle de versão, repete sozinho se duas ações chegam juntas, ignora reenvios e avisa os celulares em tempo real. |
| Testes e CI | 124 testes unitários, 59 de banco, 14 ponta a ponta (partida com 3 navegadores, painel, auditoria de acessibilidade). GitHub Actions roda tudo a cada push. |

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
6. **Certificado do banco (obrigatório em produção):** em **Project Settings > Database > SSL Configuration**, baixe o certificado e coloque o conteúdo em `SUPABASE_DB_CA_CERT` (pode trocar as quebras de linha por `\n`). Sem ele, em produção o jogo recusa a conexão por segurança e `/api/health` mostra a dica. Só para emergência: `SUPABASE_DB_SSL_INSECURE=1` cifra sem verificar (não recomendado).
7. Confira: `pnpm dev` e abra http://localhost:3000/api/health. Deve aparecer `"database": "ok"`.

### Limpeza automática de salas

Salas sem atividade há 2 horas são fechadas pela função `close_inactive_rooms`. Para agendar, ative a extensão **pg_cron** (Database > Extensions) e rode no SQL Editor:

```sql
select cron.schedule('fechar-salas-inativas', '*/15 * * * *', $$select public.close_inactive_rooms()$$);
select cron.schedule('limpar-limites', '17 4 * * *', $$select public.purge_rate_limits()$$);
```

### Primeiro administrador

Crie o usuário em **Authentication > Users > Add user** e rode no SQL Editor, trocando o e-mail:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'voce@exemplo.com';
```

Depois, entre em `/admin` com esse e-mail: você recebe um link de acesso (sem senha). Novos membros da equipe são adicionados pela tela Equipe, desde que a conta já exista no Supabase.

Para o link funcionar, cadastre em **Authentication > URL Configuration** o endereço do site (ex.: `https://seu-dominio/admin`) como URL de redirecionamento.

## Cartas

As cartas ficam em `content/baralho-base.json` (texto, nível de 1 a 4, categoria). Lacunas são `___`; duas lacunas viram carta "ESCOLHA 2".
Depois de editar, gere o seed e rode os testes, que conferem repetições, tamanhos, lacunas e se cada nível tem cartas para uma sala cheia:

```bash
pnpm cartas
```

```bash
pnpm test
```

No dia a dia, use o painel (`/admin` > Cartas): criar, editar, arquivar e importar CSV, sem mexer em código. O JSON continua sendo o baralho inicial de cada banco novo.

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
  seed.sql          Gerado a partir de content/baralho-base.json (pnpm cartas)
  config.toml       Configuração da CLI do Supabase
tests/
  unit/  db/  e2e/
content/            Cartas do baralho base (fonte do seed)
docs/               Plano, identidade visual, regras
```

## Segurança e carga

- [Revisão de segurança](docs/SEGURANCA.md): ameaças, proteções, como cada uma é testada e pendências da publicação.
- [Teste de carga](docs/CARGA.md): 150 jogadores com p95 abaixo de 70 ms; 600 jogadores sem falha. Rode com `node scripts/carga.mjs`.
- [Roteiro dos testes com pessoas reais](docs/PLAYTESTS.md).

Resumo: o servidor decide tudo e cada jogador recebe só o que pode ver; nenhuma tabela de jogo aceita escrita do navegador; a chave secreta só existe no servidor; reenvios nunca duplicam; limites de requisição compartilhados entre servidores para criar e entrar em salas; CSP e HSTS; conexão com o banco verificada por certificado.

Variáveis opcionais: `DB_POOL_MAX` (conexões por instância, padrão 5). `GAME_SILENCE_MS` só nos testes (tempo sem sinal de vida até marcar offline; padrão 20 s).
