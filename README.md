# Barbearia Dias

Site de uma barbearia com **agenda ao vivo**, contas de cliente, **loja com checkout** e suporte pelo WhatsApp.
Feito em HTML, CSS e JavaScript puro, sem framework e sem etapa de build.

## O que dá pra fazer

- **Agenda ao vivo:** linha do tempo do dia com os horários de cada barbeiro e uma linha que marca a hora atual.
  - Quando alguém agenda (outra aba ou um cliente simulado), o horário ocupa na hora e aparece um aviso.
- **Calendário em foco:**
  - Ao clicar, o calendário amplia e mostra a lotação de cada dia (livre, enchendo, últimas vagas).
  - Ao escolher um dia, aparecem os horários livres daquela data.
- **Agendamento só com login:**
  - Se a pessoa não tiver conta, o site pede o login ou o cadastro e depois continua de onde parou.
  - Depois de agendar, dá pra salvar o horário no Google Agenda.
  - Os horários podem ser cancelados em "Meus horários".
- **Serviços:** cortes, barba, especiais (freestyle, platinado, Corte do Patrão) e combos, com duração e preço. O botão "Agendar" já leva o serviço escolhido para a agenda.
- **Loja:**
  - Pomadas, gel, óleos, navalhas e kits, com controle de estoque.
  - Carrinho lateral com cupom e barra de frete grátis.
  - Checkout em 3 etapas: retirada na barbearia ou entrega com busca de CEP pelo ViaCEP, Pix ou pagamento no balcão, e revisão do pedido.
- **Patrocínio:** pop-up do patrocinador com cupom. Ele aparece uma vez por visita, não interrompe quem está no meio de outra ação e tem a opção "não mostrar de novo hoje".
- **WhatsApp:** janela de conversa no canto da tela. A pessoa escreve a mensagem e, ao enviar, abre o WhatsApp com o texto já preenchido.
- **Barra lateral:** menu, status de aberto/fechado e acesso à conta. No celular, vira um menu deslizante.

## Anti-spam e segurança

O backend recusa ou freia:

| Proteção | Como funciona |
| --- | --- |
| Campo-isca (honeypot) | Campo invisível para pessoas. Se vier preenchido, é robô. |
| Tempo mínimo | Formulário enviado em menos de 2,5 s após abrir é recusado. |
| Limite de tentativas | Login: 5 erros por e-mail a cada 5 min. Cadastro: 3 por aparelho por hora. Agendamento e pedidos também têm limite por janela de tempo. |
| Regras da agenda | No máximo 3 horários ativos por cliente, 1 por dia, e nada em cima da hora (30 min de antecedência). |
| Conflito de horário | O backend confere de novo se o horário está livre antes de salvar. Dois clientes não pegam o mesmo horário. |
| Filtro de texto | As observações recusam links, textos promocionais, CAIXA ALTA e repetição de caracteres. |
| Senhas | Hash PBKDF2-SHA256 com sal aleatório (Web Crypto). A senha nunca é salva. |
| HTML | Todo texto digitado pelo usuário é escapado antes de ir pra tela. |

## Backend de demonstração

Para rodar no GitHub Pages sem servidor, o "backend" ([`servidor.js`](assets/js/servidor.js)) roda no próprio navegador e guarda tudo no `localStorage`. Mesmo assim, ele foi escrito como uma API de verdade:

- os métodos são assíncronos e simulam latência de rede;
- toda validação acontece nele, sem confiar na tela;
- as respostas vêm sempre no formato `{ ok, ... }` ou `{ ok: false, erro, codigo }`.

Para trocar por um servidor real (Node, Spring etc.), só esse arquivo muda.

A agenda não abre vazia porque cada barbeiro tem clientes de exemplo gerados por um sorteio com semente fixa (barbeiro + dia). Assim, a mesma data mostra sempre a mesma agenda, sem precisar salvar nada. De tempos em tempos, um cliente simulado marca um horário para a agenda ter movimento. Com duas abas abertas, um agendamento numa aparece na outra na hora, via `BroadcastChannel`.

## Estrutura

```
index.html
assets/css/estilo.css
assets/js/
  dados.js      horários, barbeiros, serviços, produtos, cupons
  regras.js     regras puras: grade de horários, validações, limitador, carrinho
  servidor.js   backend de demonstração (contas, agenda, pedidos)
  estado.js     sessão do usuário e eventos entre as partes do site
  ui.js         modal, avisos e utilidades de tela
  agenda.js     linha do tempo, calendário e agendamento
  loja.js       vitrine, carrinho e checkout
  conta.js      login, cadastro, meus horários, meus pedidos
  app.js        junta tudo: hero, serviços, barbeiros, patrocínio, WhatsApp
tests/          testes das regras e do backend (node --test)
```

## Rodando

Precisa de um servidor local, porque os módulos ES não carregam via `file://`:

```bash
python -m http.server 8000
```

Abra http://localhost:8000.

Testes (Node 20 ou mais novo):

```bash
npm test
```

São 27 testes: grade de horários, almoço, horários passados, conflito entre clientes, limite de tentativas no login, expiração de sessão, cupom e frete em centavos, estoque e endereço no checkout.

## Personalizar

Em [`assets/js/dados.js`](assets/js/dados.js):

- `CONFIG.whatsapp`: número que recebe as mensagens (DDI + DDD + número);
- `CONFIG.endereco`, `CONFIG.horarios`, `CONFIG.almoco`, cupons e frete;
- barbeiros, serviços, produtos e patrocinador.

## Créditos

As fotos são do [Unsplash](https://unsplash.com) (licença Unsplash). Marcas, barbeiros e produtos são fictícios.

Licença MIT.
