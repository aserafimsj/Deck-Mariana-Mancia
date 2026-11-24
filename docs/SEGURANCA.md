# Segurança do Scragbadum!

Revisão da Etapa 8 (24/11/2026). Para cada ameaça: a proteção e como ela é verificada.

## Princípios

1. **O servidor decide tudo.** O celular só pede ações; regras, pontos e prazos são calculados no servidor (`src/engine`).
2. **Cada jogador recebe só o que pode ver.** O estado completo nunca sai do servidor; `projectFor` monta a visão de cada um.
3. **O banco não confia no navegador.** Nenhuma tabela de jogo aceita escrita direta de cliente (RLS).
4. **Falha segura.** Na dúvida, recusar (ex.: banco sem certificado em produção).

## Ameaças e proteções

| Ameaça | Proteção | Verificação |
|---|---|---|
| Ver mão alheia, respostas antes da hora ou autor antes da escolha | Projeção por jogador; canal de tempo real só leva o número da versão | Teste de sigilo em cada passo de 2.000 partidas simuladas; testes de projeção |
| Manipular pontos, votar duas vezes, responder duas vezes | Toda regra no motor; `UNIQUE` no banco; reenvio com o mesmo `client_action_id` não duplica | Testes do motor, de banco e de serviço (inclui clique duplo e ações simultâneas) |
| Ações simultâneas corrompendo o estado | Controle otimista de versão + novas tentativas com espera aleatória | Teste com 8 gravações simultâneas; carga com 600 jogadores sem falha |
| Jogador acessando o painel ou o banco direto | API do painel confere o papel em cada rota (401/403); RLS em todas as tabelas; `game_states` sem nenhuma política de leitura | Testes de RLS (anônimo, jogador, editor, admin); teste ponta a ponta da API do painel com token de jogador |
| Editor apagando conteúdo ou mexendo na equipe | Papéis separados: só admin apaga cartas e gerencia a equipe; ninguém remove o último admin nem a si mesmo | Testes de banco e ponta a ponta |
| Chave secreta vazando para o navegador | Só em variáveis sem `NEXT_PUBLIC_`; código de servidor protegido por `server-only` | Revisão; o build falha se um componente de cliente importar código de servidor |
| Injeção de SQL | Consultas parametrizadas; ordenação por lista fixa; busca com caracteres especiais escapados | Teste de busca com `%_\` |
| XSS (texto malicioso em carta ou apelido) | React escapa todo texto; nenhum HTML de usuário é injetado; CSP restringe origens | Revisão; apelidos só aceitam letras, números e `._-` |
| Página do jogo embutida em outro site (clickjacking) | `frame-ancestors 'none'` e `X-Frame-Options: DENY` | Teste ponta a ponta dos cabeçalhos |
| Conexões para servidores de terceiros | CSP `connect-src` só para o próprio site e o Supabase do projeto | Teste ponta a ponta dos cabeçalhos |
| Abuso: criar salas em massa, testar códigos de sala | Limite compartilhado entre servidores (Postgres): 10 salas/hora por usuário, 30/hora por IP, 60 entradas/minuto por IP; por instância: 120 ações/minuto por usuário e 1.200 sinais de vida/minuto por IP | Testes da função de limite (inclui 20 tentativas simultâneas) |
| Requisições gigantes | Corpo limitado a 16 KB nas rotas de jogo (600 KB só na importação de CSV do painel) | Revisão |
| Avisos falsos no canal de tempo real (canal público) | O canal não traz dados; o celular limita a 1 busca a cada 500 ms disparada por aviso | Revisão; ver pendência 1 |
| Interceptação da conexão com o banco | TLS com verificação do certificado do Supabase; em produção, sem certificado, a conexão é recusada | Testes unitários da configuração de TLS |
| Apelidos ofensivos | Lista curta de termos de ódio, comparada sem acento, sem leetspeak e sem separadores; termos curtos só como palavra inteira | Testes com tentativas de disfarce e com 32 nomes comuns (falsos positivos) |
| Login de teste ativo em produção | Exige `DEV_AUTH_SECRET` e é sempre desligado quando `VERCEL_ENV=production` | Teste unitário |
| Admin entrando com conta criada por qualquer um | Link de acesso só para contas já cadastradas (`shouldCreateUser: false`); papel dado por um admin | Revisão |
| Dependências com falhas conhecidas | `pnpm audit` | Nenhuma vulnerabilidade conhecida em 24/11/2026 |

## Pendências (dependem do projeto publicado, Etapa 9)

1. **Canal de tempo real privado.** Ativar "Private channels" no Supabase Realtime com política em `realtime.messages` para só membros da sala (`is_room_member`) ouvirem. Hoje o canal é público, mas só transporta números de versão.
2. **CAPTCHA no login anônimo.** O Supabase limita logins anônimos por IP (padrão: 30/hora). Se houver abuso, ativar Cloudflare Turnstile no Supabase Auth; o app precisa enviar o token do CAPTCHA (mudança pequena em `ensureAnonymousSession`).
3. **Certificado do banco.** Configurar `SUPABASE_DB_CA_CERT` na Vercel (passo a passo no README). Sem ele, o jogo não conecta em produção (falha segura); `/api/health` mostra a dica.
4. **CSP sem `'unsafe-inline'` em scripts.** Possível com SRI (hoje experimental no Next.js) ou nonces (exigem renderização dinâmica e deixam as páginas mais lentas). Reavaliar quando o SRI estabilizar.
5. **Backups e monitoramento** do Supabase (plano Pro tem backup diário) e alertas de erro (Sentry).

## Riscos aceitos

- **Limites por IP são altos de propósito.** Muita gente compartilha IP (Wi-Fi de bar, operadoras móveis com CGNAT). Um limite baixo por IP bloqueou um grupo inteiro no teste ponta a ponta; por isso o controle principal é por usuário, e criar sessões em massa já é limitado pelo Supabase Auth.
- **Força bruta de código de sala:** 31⁵ ≈ 28 milhões de códigos. Com 100 salas abertas e 60 tentativas por minuto por IP, um atacante acharia uma sala a cada ~3 dias por IP, e só veria apelidos e a pergunta da rodada (entrar exige apelido, aparece para todos e pode ser removido pelo anfitrião).
- **Limite de ações por instância:** o limite de 120 ações/minuto vale por instância do servidor. Os limites que importam para abuso (criar e entrar) são globais.
