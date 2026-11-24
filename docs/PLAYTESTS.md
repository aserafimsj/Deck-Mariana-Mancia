# Roteiro dos testes com pessoas reais

Objetivo: descobrir se o Scragbadum! **é divertido** e **fácil de entender**, antes de investir em novas funções.
Regra de ouro: quem conduz o teste **não explica nada**. Se for preciso explicar, é um problema a corrigir.

## As três ondas

| Onda | Quando | Quem | Formato | Pergunta principal |
|---|---|---|---|---|
| 0 · Cartas impressas | Agora (não precisa do app publicado) | 4 a 6 amigos | Imprimir ~30 perguntas e ~120 respostas do `content/baralho-base.json` | As cartas têm graça? Quais morrem na mesa? |
| 1 · Presencial observado | Logo após publicar (Etapa 9) | 2 a 3 grupos de 4 a 8 pessoas | Mesma sala, cada um no seu celular, alguém observando | Alguém trava? O que gera risada? |
| 2 · Remoto sem supervisão | 1 a 2 semanas depois | 10 a 20 grupos | Link no WhatsApp, presencial ou por chamada de vídeo, formulário no fim | Eles jogam de novo sem a gente pedir? |

## Onda 0: cartas impressas

1. Imprima perguntas e respostas dos níveis que o grupo topar (comece no 2, Picante).
2. Jogue 3 a 4 rodadas por pessoa como juiz.
3. Marque em cada carta: **R** (risada de verdade), **S** (sorriso educado), **N** (nada).
4. Depois do jogo, pergunte: "qual carta você tiraria do baralho?" e "qual faltou?".
5. No painel (`/admin` > Cartas), arquive as cartas com N repetido e anote ideias novas.

## Onda 1: presencial observado

### Antes

- [ ] Celulares carregados, internet funcionando (testar a rede do local).
- [ ] Ninguém do grupo viu o jogo antes.
- [ ] Observador com a ficha abaixo (papel ou celular) e cronômetro.

### Durante

1. Mande **só o link** no grupo do WhatsApp: "bora testar um jogo?". Não explique nada.
2. Cronometre e anote na ficha.
3. Deixe jogar uma partida inteira (7 pontos; ~15 a 25 minutos).
4. Se pedirem para jogar de novo, deixe. Isso é o melhor sinal possível.

### Ficha de observação

| O que medir | Anotação |
|---|---|
| Tempo do link até todos na sala de espera | |
| Tempo da sala de espera até a primeira resposta enviada | |
| Momentos de dúvida ("e agora?", "onde eu clico?") e em qual tela | |
| Toques errados ou botões procurados | |
| Risadas: em qual carta, e se foi a mesa toda | |
| Alguém se distraiu ou largou o celular? Quando? | |
| Problemas técnicos (travou, caiu, som, vibração) e em qual celular | |
| Pediram para jogar de novo? | |

### Depois (5 perguntas, conversa rápida)

1. O que foi mais divertido?
2. O que irritou ou confundiu?
3. Jogaria de novo? Com quem?
4. Indicaria para alguém? Por quê?
5. Se pudesse mudar uma coisa, qual seria?

## Onda 2: remoto sem supervisão

- Divulgue o link com uma frase curta ("o jogo das respostas que você não devia dar, joga com a galera e me conta").
- Ao fim da partida, peça para responder um formulário (Google Forms) com as 5 perguntas acima mais: idade aproximada, quantas pessoas jogaram, presencial ou chamada de vídeo, nível de humor usado.
- Não acompanhe em tempo real: o objetivo é ver o uso natural.

## Métricas (painel `/admin`)

| Métrica | Onde ver | Meta inicial | O que indica |
|---|---|---|---|
| % de partidas que terminam | Painel > "Partidas (7 dias)" | > 70% | Ritmo e engajamento |
| Duração média | Painel | 15 a 25 min | Ritmo (muito curto = pouco envolvimento; muito longo = cansa) |
| Partidas por sala ("jogar novamente") | Painel > "Partidas por sala" | > 1,5 | **Diversão real**: métrica principal |
| Respostas que mais vencem | Painel | — | Inspiração para novas cartas |
| Respostas jogadas 5+ vezes sem vencer | Painel | Arquivar | Curadoria contínua |
| Jogadores na semana | Painel | — | Alcance |

## Critério para seguir para a Fase 2

Se **partidas por sala > 1,5** e **% de partidas terminadas > 70%** na onda 2, a mecânica está validada: vale investir em salas públicas, contas e pacotes de cartas.
Se não, a prioridade é **conteúdo e ritmo** (cartas, tempo de resposta, número de pontos), não funções novas.

## Rotina de curadoria (semanal, 15 minutos)

1. Painel: arquive as respostas que nunca vencem (5+ jogadas).
2. Cartas > ordenar por "Mais vitórias": entenda o padrão das campeãs e escreva cartas parecidas.
3. Importe as cartas novas por CSV (confira antes de importar).
