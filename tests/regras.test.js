import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../assets/js/regras.js';
import { BARBEIROS, CONFIG, NOMES, PRODUTOS } from '../assets/js/dados.js';

const eduardo = BARBEIROS.find((b) => b.id === 'eduardo'); // trabalha de terça a sábado
const TERCA = '2026-11-17';
const SEGUNDA = '2026-11-16';

test('converte horas e minutos nos dois sentidos', () => {
  assert.equal(R.paraMin('09:30'), 570);
  assert.equal(R.paraHora(570), '09:30');
  assert.equal(R.paraHora(R.paraMin('20:00')), '20:00');
});

test('dataISO usa o dia local, não UTC', () => {
  assert.equal(R.dataISO(new Date(2026, 10, 14, 23, 50)), '2026-11-14');
  assert.equal(R.somarDias('2026-12-31', 1), '2027-01-01');
});

test('barbeiro de folga ou barbearia fechada não tem horários', () => {
  assert.equal(R.expediente(eduardo, SEGUNDA, CONFIG), null);
  assert.equal(R.expediente(eduardo, '2026-11-15', CONFIG), null); // domingo
  assert.deepEqual(R.expediente(eduardo, TERCA, CONFIG), { abre: 540, fecha: 1200 });
});

test('grade do dia pula o almoço', () => {
  const h = R.horariosDoDia({ barbeiro: eduardo, iso: TERCA, duracao: 30, agendamentos: [], config: CONFIG });
  const horas = h.map((x) => x.hora);
  assert.equal(horas[0], '09:00');
  assert.equal(horas.at(-1), '19:30');
  assert.ok(!horas.includes('12:00') && !horas.includes('12:30'));
  assert.ok(h.every((x) => x.estado === 'livre'));
});

test('horário ocupado e serviço que não cabe', () => {
  const agendamentos = [{ barbeiroId: 'eduardo', data: TERCA, inicio: '10:00', duracao: 60 }];
  const h = R.horariosDoDia({ barbeiro: eduardo, iso: TERCA, duracao: 60, agendamentos, config: CONFIG });
  const estado = (hora) => h.find((x) => x.hora === hora).estado;
  assert.equal(estado('09:00'), 'livre');
  assert.equal(estado('09:30'), 'curto'); // 60 min a partir de 9:30 bate no cliente das 10h
  assert.equal(estado('10:00'), 'ocupado');
  assert.equal(estado('10:30'), 'ocupado');
  assert.equal(estado('11:00'), 'livre');
  assert.equal(estado('11:30'), 'curto'); // bate no almoço
  assert.equal(estado('19:30'), 'curto'); // passa do fechamento
});

test('agendamento cancelado libera o horário', () => {
  const agendamentos = [{ barbeiroId: 'eduardo', data: TERCA, inicio: '10:00', duracao: 30, cancelado: true }];
  const h = R.horariosDoDia({ barbeiro: eduardo, iso: TERCA, duracao: 30, agendamentos, config: CONFIG });
  assert.equal(h.find((x) => x.hora === '10:00').estado, 'livre');
});

test('horários que já passaram ou estão em cima da hora ficam bloqueados', () => {
  const agora = new Date(2026, 10, 17, 14, 10); // terça 14:10, antecedência de 30 min
  const h = R.horariosDoDia({ barbeiro: eduardo, iso: TERCA, duracao: 30, agendamentos: [], agora, config: CONFIG });
  assert.equal(h.find((x) => x.hora === '14:30').estado, 'passado');
  assert.equal(h.find((x) => x.hora === '15:00').estado, 'livre');
  const ontem = R.horariosDoDia({ barbeiro: eduardo, iso: '2026-11-14', duracao: 30, agendamentos: [], agora, config: CONFIG });
  assert.ok(ontem.every((x) => x.estado === 'passado'));
});

test('situação agora: atendendo, livre, almoço e folga', () => {
  const ag = [{ barbeiroId: 'eduardo', data: TERCA, inicio: '15:00', duracao: 60 }];
  const s = (h, m, iso = TERCA) => {
    const [a, mes, d] = iso.split('-').map(Number);
    return R.situacaoAgora({ barbeiro: eduardo, agendamentos: ag, agora: new Date(a, mes - 1, d, h, m), config: CONFIG });
  };
  assert.deepEqual(s(15, 20), { estado: 'atendendo', ate: '16:00' });
  assert.deepEqual(s(16, 0), { estado: 'livre' });
  assert.equal(s(12, 15).estado, 'almoco');
  assert.equal(s(7, 0).estado, 'fechado');
  assert.equal(s(10, 0, SEGUNDA).estado, 'folga');
});

test('agenda de exemplo é sempre a mesma para o mesmo dia e não se sobrepõe', () => {
  const a = R.agendaDeExemplo(eduardo, TERCA, CONFIG, NOMES);
  const b = R.agendaDeExemplo(eduardo, TERCA, CONFIG, NOMES);
  assert.deepEqual(a, b);
  assert.ok(a.length > 3);
  const intervalos = a.map((x) => [R.paraMin(x.inicio), R.paraMin(x.inicio) + x.duracao]).sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < intervalos.length; i++) assert.ok(intervalos[i][0] >= intervalos[i - 1][1]);
  for (const [ini, fim] of intervalos) assert.ok(fim <= 720 || ini >= 780, 'não pode cair no almoço');
  assert.deepEqual(R.agendaDeExemplo(eduardo, SEGUNDA, CONFIG, NOMES), []);
});

test('validações de cadastro', () => {
  assert.equal(R.validarNome('Ed'), 'Digite seu nome completo.');
  assert.equal(R.validarNome('Eduardo Dias'), null);
  assert.equal(R.validarNome('<script>'), 'Use só letras no nome.');
  assert.equal(R.validarEmail('edu@barbearia.com'), null);
  assert.ok(R.validarEmail('edu@barbearia'));
  assert.equal(R.validarTelefone('(11) 91234-5678'), null);
  assert.ok(R.validarTelefone('1234'));
  assert.ok(R.validarSenha('abcdefgh'));
  assert.ok(R.validarSenha('1234567'));
  assert.equal(R.validarSenha('navalha77'), null);
  assert.ok(R.forcaSenha('Navalha#2026forte') > R.forcaSenha('navalha77'));
});

test('máscaras de telefone e CEP', () => {
  assert.equal(R.mascaraTelefone('11912345678'), '(11) 91234-5678');
  assert.equal(R.mascaraTelefone('1132345678'), '(11) 3234-5678');
  assert.equal(R.mascaraCEP('01001000'), '01001-000');
});

test('limitador bloqueia depois do máximo e libera quando a janela passa', () => {
  let t = 0;
  const l = new R.Limitador({ max: 3, janelaMs: 1000, agora: () => t });
  assert.ok(l.registrar('x').ok);
  assert.ok(l.registrar('x').ok);
  assert.ok(l.registrar('x').ok);
  const bloqueado = l.registrar('x');
  assert.equal(bloqueado.ok, false);
  assert.equal(bloqueado.esperaMs, 1000);
  assert.ok(l.registrar('outra-chave').ok, 'cada chave tem o próprio limite');
  t = 1001;
  assert.ok(l.registrar('x').ok);
});

test('filtro de spam', () => {
  assert.equal(R.pareceSpam('Quero o degradê igual da última vez'), false);
  assert.equal(R.pareceSpam(''), false);
  assert.ok(R.pareceSpam('olha isso https://golpe.com'));
  assert.ok(R.pareceSpam('GANHE DINHEIRO RÁPIDO COM ESSA OPORTUNIDADE'));
  assert.ok(R.pareceSpam('aposta no cassino online'));
  assert.ok(R.pareceSpam('kkkkkkkkkkkkkk'));
});

test('carrinho: subtotal, cupom e frete em centavos', () => {
  const itens = [{ id: 'pomada-matte', qtd: 2 }, { id: 'gel', qtd: 1 }]; // 2 x 39,90 + 24,90
  const r = R.resumoCarrinho(itens, PRODUTOS, { entrega: 'entrega', config: CONFIG });
  assert.equal(r.subtotal, 10470);
  assert.equal(r.frete, CONFIG.frete);
  assert.equal(r.total, 10470 + CONFIG.frete);
  assert.equal(r.qtdItens, 3);

  const c = R.resumoCarrinho(itens, PRODUTOS, { entrega: 'retirada', cupom: 'navalha10', config: CONFIG });
  assert.equal(c.desconto, 1047);
  assert.equal(c.frete, 0);
  assert.equal(c.total, 9423);

  const caro = R.resumoCarrinho([{ id: 'tesoura', qtd: 1 }], PRODUTOS, { entrega: 'entrega', config: CONFIG });
  assert.equal(caro.frete, 0, 'frete grátis acima do limite');
});

test('cupom inexistente não dá desconto', () => {
  const r = R.resumoCarrinho([{ id: 'gel', qtd: 1 }], PRODUTOS, { cupom: 'FAKE', config: CONFIG });
  assert.equal(r.desconto, 0);
  assert.equal(r.cupom, null);
});
