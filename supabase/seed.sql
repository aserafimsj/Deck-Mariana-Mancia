-- Scragbadum! — conteúdo inicial para desenvolvimento e playtests.
-- Todas as cartas são originais. Lacunas: ___ (três sublinhados).
-- Níveis: 1 De Leve · 2 Picante · 3 Pesado · 4 Sem Filtro (cartas do nível 4 entram depois).
-- Idempotente: pode rodar mais de uma vez.

insert into public.decks (slug, name, description, is_free, sort_order)
values ('base', 'Baralho Base', 'O baralho que vem com o jogo.', true, 0)
on conflict (slug) do nothing;

insert into public.categories (slug, name, color, sort_order) values
  ('cotidiano', 'Cotidiano', '#3FE0CF', 0),
  ('familia', 'Família', '#FFCC1A', 1),
  ('trabalho', 'Trabalho', '#AE9FBB', 2),
  ('internet', 'Internet', '#FF3D8B', 3),
  ('relacionamentos', 'Relacionamentos', '#FF4B3E', 4),
  ('absurdo', 'Absurdo', '#F3EFE7', 5)
on conflict (slug) do nothing;

with d as (select id from public.decks where slug = 'base'),
c as (select id, slug from public.categories),
src (text, pick, humor_level, category) as (values
  ('Qual é o segredo para conquistar alguém?', 1, 1, 'relacionamentos'),
  ('Qual é o verdadeiro motivo do grupo da família estar em silêncio?', 1, 1, 'familia'),
  ('Minha terapeuta disse que eu preciso parar com ___.', 1, 1, 'cotidiano'),
  ('O síndico mandou um comunicado proibindo ___ na piscina.', 1, 1, 'cotidiano'),
  ('___ + ___ = sexta-feira perfeita.', 2, 1, 'absurdo'),
  ('Na reunião de segunda, o chefe apresentou a nova estratégia: ___.', 1, 1, 'trabalho'),
  ('O que a vovó guarda dentro do pote de sorvete?', 1, 1, 'familia'),
  ('Qual é o próximo grande sucesso das redes sociais?', 1, 1, 'internet'),
  ('No meu currículo, em "outras habilidades": ___.', 1, 1, 'trabalho'),
  ('O que estragou o churrasco de domingo?', 1, 1, 'familia'),
  ('Meu horóscopo de hoje: cuidado com ___.', 1, 1, 'absurdo'),
  ('Primeiro encontro perfeito: jantar, vinho e ___.', 1, 2, 'relacionamentos'),
  ('O que tem no histórico de pesquisa do seu tio?', 1, 2, 'internet'),
  ('Eu não estava bêbado, eu só estava ___.', 1, 2, 'cotidiano'),
  ('Meu ex me trocou por ___.', 1, 2, 'relacionamentos'),
  ('Fui demitido por causa de ___ e, sinceramente, faria de novo.', 1, 2, 'trabalho'),
  ('Na despedida de solteiro, tudo deu errado por causa de ___ e ___.', 2, 2, 'relacionamentos'),
  ('O que o padre confessou para o padre?', 1, 2, 'absurdo'),
  ('A nova fantasia de Carnaval mais vendida do ano: ___.', 1, 2, 'cotidiano'),
  ('O que realmente acontece no motel da beira da estrada?', 1, 3, 'relacionamentos'),
  ('Meu testamento tem uma cláusula só: ___.', 1, 3, 'familia'),
  ('O que me faz pensar na morte toda segunda-feira?', 1, 3, 'trabalho')
)
insert into public.black_cards (deck_id, category_id, text, pick, humor_level)
select d.id, c.id, src.text, src.pick, src.humor_level
from src cross join d left join c on c.slug = src.category
on conflict (deck_id, lower(text)) do nothing;

with d as (select id from public.decks where slug = 'base'),
c as (select id, slug from public.categories),
src (text, humor_level, category) as (values
  ('Um áudio de 7 minutos da sogra.', 1, 'familia'),
  ('Um pombo com problemas de autoestima.', 1, 'absurdo'),
  ('Pix de R$ 3,50 com a descrição "saudades".', 1, 'relacionamentos'),
  ('Uma reunião que poderia ser um e-mail.', 1, 'trabalho'),
  ('O tio do pavê em modo turbo.', 1, 'familia'),
  ('Chinelo voador de alta precisão.', 1, 'familia'),
  ('Coach quântico de autoconhecimento.', 1, 'internet'),
  ('Um boleto vencido.', 1, 'cotidiano'),
  ('A última coxinha da festa.', 1, 'cotidiano'),
  ('Responder "kkkk" sem ter rido.', 1, 'internet'),
  ('Dançar forró com o ex no casamento do primo.', 1, 'relacionamentos'),
  ('Um grupo de WhatsApp chamado "Família 100% Unida".', 1, 'familia'),
  ('Um ventilador de teto girando no máximo.', 1, 'absurdo'),
  ('Fingir que está digitando para não atender a ligação.', 1, 'internet'),
  ('Uma planilha com abas coloridas e nenhum propósito.', 1, 'trabalho'),
  ('O vizinho furando a parede às 7h de domingo.', 1, 'cotidiano'),
  ('Um pastel de vento.', 1, 'cotidiano'),
  ('A cobrança do condomínio.', 1, 'cotidiano'),
  ('Uma capivara influencer.', 1, 'internet'),
  ('A senha do Wi-Fi escrita num guardanapo.', 1, 'cotidiano'),
  ('O cachorro do vizinho latindo em código Morse.', 1, 'absurdo'),
  ('Uma tia que manda bom dia com GIF de flor.', 1, 'familia'),
  ('Um estagiário com acesso de administrador.', 1, 'trabalho'),
  ('Um "vamos marcar" que nunca vai acontecer.', 1, 'relacionamentos'),
  ('Trinta abas abertas no navegador.', 1, 'internet'),
  ('Um sofá que já foi de três donos.', 1, 'cotidiano'),
  ('O silêncio constrangedor do elevador.', 1, 'cotidiano'),
  ('Uma pochete cheia de moedas de cinco centavos.', 1, 'absurdo'),
  ('A tampa de pote que não fecha nenhum pote.', 1, 'familia'),
  ('Uma live de três horas sobre produtividade.', 1, 'internet'),
  ('Um feedback "construtivo" na frente de todo mundo.', 1, 'trabalho'),
  ('Um bolo de pote sem bolo.', 1, 'absurdo'),
  ('Um cupom de desconto vencido ontem.', 1, 'cotidiano'),
  ('Um ganso com crise existencial.', 1, 'absurdo'),
  ('Acordar com uma música de comercial na cabeça.', 1, 'absurdo'),
  ('Ficar de olho no status "online" do crush.', 2, 'relacionamentos'),
  ('Uma ressaca que dura até quarta-feira.', 2, 'cotidiano'),
  ('Um nude acidentalmente enviado no grupo do trabalho.', 2, 'trabalho'),
  ('Beijar alguém só porque o bloco parou.', 2, 'relacionamentos'),
  ('Um "oi sumida" às 3 da manhã.', 2, 'relacionamentos'),
  ('A conta do bar dividida igualmente mesmo eu tendo bebido água.', 2, 'cotidiano'),
  ('Uma tatuagem com o nome do ex.', 2, 'relacionamentos'),
  ('Fingir orgasmo e fingir que gostou do presente no mesmo dia.', 2, 'relacionamentos'),
  ('Um date que levou a mãe.', 2, 'relacionamentos'),
  ('Um banheiro químico no terceiro dia de festival.', 2, 'cotidiano'),
  ('O primo que vende curso de enriquecimento.', 2, 'internet'),
  ('Uma cueca da sorte que nunca foi lavada.', 2, 'absurdo'),
  ('Vomitar no Uber e dar cinco estrelas para o motorista.', 2, 'cotidiano'),
  ('Uma calcinha esquecida no carro do pai.', 2, 'familia'),
  ('Um happy hour que virou sequestro emocional.', 2, 'trabalho'),
  ('Mandar áudio chorando e depois apagar.', 2, 'relacionamentos'),
  ('Um sexo tão ruim que virou amizade.', 3, 'relacionamentos'),
  ('Uma diarreia em pleno casamento.', 3, 'familia'),
  ('O velório mais animado da cidade.', 3, 'familia'),
  ('Um brinquedo erótico que vibra sozinho na reunião.', 3, 'trabalho'),
  ('Herdar só as dívidas.', 3, 'familia'),
  ('Uma camisinha furada e muita fé.', 3, 'relacionamentos'),
  ('A carne misteriosa do churrasco de beira de estrada.', 3, 'cotidiano'),
  ('O plano de saúde negando tudo, inclusive a sua existência.', 3, 'cotidiano'),
  ('Uma suruba organizada por planilha.', 3, 'trabalho')
)
insert into public.white_cards (deck_id, category_id, text, humor_level)
select d.id, c.id, src.text, src.humor_level
from src cross join d left join c on c.slug = src.category
on conflict (deck_id, lower(text)) do nothing;
