# Regras do Scragbadum! (como o motor decide)

Este é o comportamento implementado em `src/engine/`. Tudo é decidido no servidor; o celular só pede ações.
Se alguma regra não for a que você quer, ela muda num lugar só e os testes avisam o que mais é afetado.

## Partida

| Situação | Regra |
|---|---|
| Começar | Só o anfitrião. Mínimo de 3 jogadores presentes. Em sala Sem Filtro, todos precisam ter aceitado o aviso. |
| Cartas na mão | 7 por padrão (5 a 10). A mão é completada no início de cada rodada. |
| Primeiro juiz | Sorteado entre os presentes. Depois, segue a ordem de chegada na sala. Todos são juiz uma vez antes de alguém repetir. |
| Responder | Quem não é juiz escolhe 1 carta (ou 2, nas cartas "ESCOLHA 2", na ordem escolhida). Só cartas da própria mão. Uma vez por rodada. |
| Fim das respostas | Assim que todos os esperados responderem, começa o julgamento. |
| Julgamento | Respostas aparecem embaralhadas e sem autor. O juiz revela uma a uma e só escolhe depois de revelar todas. |
| Ponto | A resposta escolhida dá 1 ponto ao autor. O autor de cada resposta aparece para todos só depois da escolha. |
| Tela de resultado | Fica 8 segundos (ou até o anfitrião avançar) e a próxima rodada começa sozinha. |
| Fim da partida | Quando alguém chega aos pontos (7 por padrão) ou, se houver limite, quando acabam as rodadas. Empate no limite de rodadas: todos os empatados vencem. |
| Jogar novamente | Anfitrião volta todos para a sala de espera com o placar zerado. |

## Tempo (quando o temporizador está ligado)

| Situação | Regra |
|---|---|
| Prazo para responder | 45, 60 ou 90 segundos. |
| Tempo acabou com 2+ respostas | Vai para o julgamento só com quem respondeu. |
| Tempo acabou com 0 ou 1 resposta | Rodada anulada, cartas voltam para a mão, próximo juiz. |
| Prazo do juiz | O maior entre 60 segundos e o prazo de resposta. |
| Juiz não escolheu a tempo | O sistema sorteia a vencedora. |
| Temporizador desligado | Ninguém é apressado. |

## Conexão, entradas e saídas

| Situação | Regra |
|---|---|
| Caiu da rede | Aparece como offline na hora. A vaga e as cartas ficam guardadas. Pode voltar a qualquer momento pelo mesmo link. |
| Ausente por mais de 1 minuto | Deixa de ser esperado na rodada (o jogo não trava por ele). Continua com pontos e cartas. |
| Juiz ausente por mais de 1 minuto ou saiu | Rodada anulada, respostas voltam para as mãos, próximo juiz assume. |
| Anfitrião ausente por mais de 30 segundos ou saiu | A função passa para o jogador conectado mais antigo. O anfitrião também pode passar a função manualmente. |
| Saiu no meio das respostas | A resposta dele é descartada. Mantém os pontos se voltar. |
| Removido pelo anfitrião | Não consegue voltar para a mesma sala. |
| Entrou no meio da rodada | Recebe cartas na hora e joga a partir da próxima rodada. |
| Menos de 3 presentes | A partida pausa (a rodada atual é anulada) e volta sozinha quando houver 3 de novo. |

## Sigilo (testado automaticamente em cada passo de milhares de partidas simuladas)

- Ninguém vê a mão de outro jogador.
- Durante as respostas, todos veem **quem** já respondeu, nunca **o quê**.
- No julgamento, as respostas aparecem sem autor e só depois de reveladas.
- O baralho e as próximas perguntas nunca saem do servidor.
- O motor nunca usa carta acima do nível de humor da sala, mesmo que receba uma por engano.

## Pontos em aberto para você decidir

1. **Tempo acabou com 1 resposta só**: hoje a rodada é anulada. Alternativa: dar o ponto para quem respondeu.
2. **Juiz não escolheu a tempo**: hoje é sorteio. Alternativa: ninguém pontua.
3. **"Trocar a mão"** (uma vez por partida, custando 1 ponto) está no plano para a Fase 2.
