import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServidorDemo, memoria } from '../assets/js/servidor.js';
import * as R from '../assets/js/regras.js';

// terça, 17/11/2026, 10:00
function novoServidor() {
  const relogio = { t: new Date(2026, 10, 17, 10, 0).getTime() };
  const s = new ServidorDemo({ armazenamento: memoria(), agora: () => new Date(relogio.t), latencia: [0, 0], iteracoes: 1000 });
  return { s, relogio };
}

const cadastro = (relogio, extra = {}) => ({
  nome: 'Eduardo Dias',
  email: 'edu@exemplo.com',
  telefone: '11912345678',
  senha: 'navalha2026',
  abertoEm: relogio.t - 10000,
  ...extra,
});

async function logado() {
  const ctx = novoServidor();
  const r = await ctx.s.cadastrar(cadastro(ctx.relogio));
  assert.ok(r.ok, r.erro);
  return { ...ctx, token: r.token };
}

/** Acha um horário livre no dia para o serviço. */
function livre(s, barbeiroId, iso, servicoId = 'social') {
  return s.horarios({ barbeiroId, iso, servicoId }).find((h) => h.estado === 'livre')?.hora;
}

test('cadastro salva hash, nunca a senha', async () => {
  const { s, relogio } = novoServidor();
  const r = await s.cadastrar(cadastro(relogio));
  assert.ok(r.ok);
  assert.equal(r.usuario.email, 'edu@exemplo.com');
  const salvo = JSON.parse(s.db.getItem('bd:usuarios'))[0];
  assert.ok(!JSON.stringify(salvo).includes('navalha2026'));
  assert.equal(salvo.hash.length, 64);
  assert.equal(s.eu(r.token).nome, 'Eduardo Dias');
});

test('cadastro recusa e-mail repetido, robô e formulário rápido demais', async () => {
  const { s, relogio } = novoServidor();
  await s.cadastrar(cadastro(relogio));
  assert.equal((await s.cadastrar(cadastro(relogio, { email: 'EDU@exemplo.com' }))).codigo, 'duplicado');
  assert.equal((await s.cadastrar(cadastro(relogio, { email: 'b@b.com', site: 'http://spam' }))).codigo, 'spam');
  assert.equal((await s.cadastrar(cadastro(relogio, { email: 'c@c.com', abertoEm: relogio.t - 500 }))).codigo, 'rapido');
});

test('limite de cadastros por aparelho', async () => {
  const { s, relogio } = novoServidor();
  for (let i = 0; i < 3; i++) assert.ok((await s.cadastrar(cadastro(relogio, { email: `u${i}@x.com` }))).ok);
  assert.equal((await s.cadastrar(cadastro(relogio, { email: 'u9@x.com' }))).codigo, 'limite');
});

test('login certo, errado e bloqueio após 5 erros', async () => {
  const { s, relogio } = novoServidor();
  await s.cadastrar(cadastro(relogio));
  assert.ok((await s.entrar({ email: 'edu@exemplo.com', senha: 'navalha2026' })).ok);
  for (let i = 0; i < 5; i++) {
    assert.equal((await s.entrar({ email: 'edu@exemplo.com', senha: 'errada123' })).codigo, 'credenciais');
  }
  const bloqueado = await s.entrar({ email: 'edu@exemplo.com', senha: 'navalha2026' });
  assert.equal(bloqueado.codigo, 'limite', 'nem a senha certa passa durante o bloqueio');
  relogio.t += 5 * 60000 + 1;
  assert.ok((await s.entrar({ email: 'edu@exemplo.com', senha: 'navalha2026' })).ok);
});

test('sessão expira depois de 7 dias', async () => {
  const { s, relogio, token } = await logado();
  assert.ok(s.eu(token));
  relogio.t += 8 * 24 * 60 * 60000;
  assert.equal(s.eu(token), null);
});

test('agendar exige login', async () => {
  const { s, relogio } = novoServidor();
  const r = await s.agendar(null, { barbeiroId: 'eduardo', iso: '2026-11-18', inicio: '15:00', servicoId: 'social', abertoEm: relogio.t - 9000 });
  assert.equal(r.codigo, 'login');
});

test('agendamento ocupa o horário e ninguém marca em cima', async () => {
  const { s, relogio, token } = await logado();
  const iso = '2026-11-18';
  const hora = livre(s, 'eduardo', iso);
  const r = await s.agendar(token, { barbeiroId: 'eduardo', iso, inicio: hora, servicoId: 'social', abertoEm: relogio.t - 9000 });
  assert.ok(r.ok, r.erro);
  assert.equal(s.horarios({ barbeiroId: 'eduardo', iso, servicoId: 'social' }).find((h) => h.hora === hora).estado, 'ocupado');

  // outra pessoa tenta o mesmo horário
  const outro = await s.cadastrar(cadastro(relogio, { email: 'outro@x.com' }));
  const conflito = await s.agendar(outro.token, { barbeiroId: 'eduardo', iso, inicio: hora, servicoId: 'social', abertoEm: relogio.t - 9000 });
  assert.equal(conflito.codigo, 'ocupado');
});

test('regras de limite: um por dia e no máximo 3 ativos', async () => {
  const { s, relogio, token } = await logado();
  const base = { barbeiroId: 'eduardo', servicoId: 'social', abertoEm: relogio.t - 9000 };
  const dias = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
  assert.ok((await s.agendar(token, { ...base, iso: dias[0], inicio: livre(s, 'eduardo', dias[0]) })).ok);
  const mesmoDia = await s.agendar(token, { ...base, iso: dias[0], inicio: livre(s, 'eduardo', dias[0]) });
  assert.equal(mesmoDia.codigo, 'limite');
  assert.ok((await s.agendar(token, { ...base, iso: dias[1], inicio: livre(s, 'eduardo', dias[1]) })).ok);
  assert.ok((await s.agendar(token, { ...base, iso: dias[2], inicio: livre(s, 'eduardo', dias[2]) })).ok);
  const quarto = await s.agendar(token, { ...base, iso: dias[3], inicio: livre(s, 'eduardo', dias[3]) });
  assert.equal(quarto.codigo, 'limite');
});

test('não agenda em dia de folga, no passado ou com observação spam', async () => {
  const { s, relogio, token } = await logado();
  const base = { barbeiroId: 'eduardo', servicoId: 'social', abertoEm: relogio.t - 9000 };
  assert.equal((await s.agendar(token, { ...base, iso: '2026-11-16', inicio: '15:00' })).codigo, 'invalido'); // ontem
  assert.equal((await s.agendar(token, { ...base, iso: '2026-11-23', inicio: '15:00' })).codigo, 'ocupado'); // segunda, folga
  const spam = await s.agendar(token, { ...base, iso: '2026-11-18', inicio: livre(s, 'eduardo', '2026-11-18'), obs: 'visite www.golpe.com' });
  assert.equal(spam.codigo, 'spam');
});

test('cancelar libera o horário, mas só até 1h antes', async () => {
  const { s, relogio, token } = await logado();
  const iso = '2026-11-18';
  const hora = livre(s, 'eduardo', iso);
  const { agendamento } = await s.agendar(token, { barbeiroId: 'eduardo', iso, inicio: hora, servicoId: 'social', abertoEm: relogio.t - 9000 });
  assert.ok((await s.cancelar(token, agendamento.id)).ok);
  assert.equal(s.horarios({ barbeiroId: 'eduardo', iso, servicoId: 'social' }).find((h) => h.hora === hora).estado, 'livre');

  const hoje = R.dataISO(new Date(relogio.t));
  const cedo = livre(s, 'eduardo', hoje);
  const r = await s.agendar(token, { barbeiroId: 'eduardo', iso: hoje, inicio: cedo, servicoId: 'social', abertoEm: relogio.t - 9000 });
  assert.ok(r.ok, r.erro);
  relogio.t = new Date(2026, 10, 17, ...cedo.split(':').map(Number)).getTime() - 30 * 60000;
  assert.equal((await s.cancelar(token, r.agendamento.id)).codigo, 'prazo');
});

test('avisa a tela quando alguém agenda', async () => {
  const { s, relogio, token } = await logado();
  const eventos = [];
  s.addEventListener('mudou', (e) => eventos.push(e.detail));
  const iso = '2026-11-18';
  await s.agendar(token, { barbeiroId: 'eduarda', iso, inicio: livre(s, 'eduarda', iso), servicoId: 'social', abertoEm: relogio.t - 9000 });
  s.simularCliente(() => 0);
  assert.equal(eventos.length, 2);
  assert.ok(eventos.every((e) => e.tipo === 'agendou'));
});

test('pedido: login, endereço, estoque e cupom', async () => {
  const { s, token } = await logado();
  const itens = [{ id: 'tesoura', qtd: 2 }];
  assert.equal((await s.criarPedido(null, { itens, entrega: { tipo: 'retirada' }, pagamento: 'pix' })).codigo, 'login');
  assert.match((await s.criarPedido(token, { itens, entrega: { tipo: 'entrega', cep: '123' }, pagamento: 'pix' })).erro, /CEP/);
  assert.match((await s.criarPedido(token, { itens, entrega: { tipo: 'entrega', cep: '01001000', rua: 'Rua A', numero: '1', bairro: 'Sé', cidade: 'SP' }, pagamento: 'balcao' })).erro, /balcão/);
  assert.equal((await s.criarPedido(token, { itens: [{ id: 'tesoura', qtd: 99 }], entrega: { tipo: 'retirada' }, pagamento: 'pix' })).erro, 'Quantidade inválida.');

  const r = await s.criarPedido(token, { itens, entrega: { tipo: 'retirada' }, pagamento: 'balcao', cupom: 'NAVALHA10' });
  assert.ok(r.ok, r.erro);
  assert.equal(r.pedido.subtotal, 31980);
  assert.equal(r.pedido.desconto, 3198);
  assert.equal(r.pedido.total, 28782);
  assert.equal(s.estoque('tesoura'), 2);

  const semEstoque = await s.criarPedido(token, { itens: [{ id: 'tesoura', qtd: 3 }], entrega: { tipo: 'retirada' }, pagamento: 'pix' });
  assert.equal(semEstoque.codigo, 'estoque');
  assert.equal((await s.meusPedidos(token)).lista.length, 1);
});
