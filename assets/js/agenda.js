// Agenda ao vivo: linha do tempo do dia, calendário que abre em foco, horários livres e confirmação.

import * as R from './regras.js';
import { BARBEIROS, CONFIG, SERVICOS, CATEGORIAS_SERVICO } from './dados.js';
import { servidor, sessao, ouvir } from './estado.js';
import { exigirLogin } from './conta.js';
import { $, $$, esc, icone, avisar, modal, carregando, dataLonga, nomeDia, nomeMes } from './ui.js';

const sel = {
  barbeiro: null,
  servico: 'degrade',
  mes: null, // primeiro dia do mês visível
  dia: null,
  hora: null,
};
let abertoEm = 0; // anti-robô: quando a pessoa começou a mexer na agenda
let blocosConhecidos = null;
let ultimaAtualizacao = Date.now();

const barbeiroDe = (id) => BARBEIROS.find((b) => b.id === id);
const servicoDe = (id) => SERVICOS.find((s) => s.id === id);
const agora = () => new Date();

// ---------- linha do tempo ("Hoje na Dias") ----------

/** Se hoje a barbearia está fechada, mostra o próximo dia aberto. */
function diaDaLinha() {
  let iso = R.dataISO(agora());
  for (let i = 0; i < 7 && !CONFIG.horarios[R.deISO(iso).getDay()]; i++) iso = R.somarDias(iso, 1);
  return iso;
}

function desenharLinhaTempo() {
  const iso = diaDaLinha();
  const ehHoje = iso === R.dataISO(agora());
  const d = R.deISO(iso);
  const [abre, fecha] = CONFIG.horarios[d.getDay()].map(R.paraMin);
  const total = fecha - abre;
  const pct = (min) => ((min - abre) / total) * 100;
  const agenda = servidor.agendaDoDia(iso);
  const minAgora = agora().getHours() * 60 + agora().getMinutes();

  $('.hoje-topo h3').firstChild.textContent = ehHoje ? 'Hoje na Dias ' : `${nomeDia(d)[0].toUpperCase()}${nomeDia(d).slice(1)} na Dias `;
  $('#hoje-data').textContent = `${d.getDate()} de ${nomeMes(d.getMonth())}`;

  let horas = '';
  for (let h = Math.ceil(abre / 60) * 60; h <= fecha; h += 60) horas += `<span style="left:${pct(h)}%">${h / 60}h</span>`;

  const novos = new Set();
  const linhas = BARBEIROS.map((b) => {
    const exp = R.expediente(b, iso, CONFIG);
    const quem = `<div class="lt-quem"><img src="${b.foto}" alt=""><div><b>${esc(b.nome.split(' ')[0])}</b><small>${exp ? `${R.paraHora(exp.abre)}–${R.paraHora(exp.fecha)}` : 'folga'}</small></div></div>`;
    if (!exp) return `<div class="lt-linha">${quem}<div class="lt-trilho folga">Folga hoje</div></div>`;
    const blocos = agenda.filter((a) => a.barbeiroId === b.id).map((a) => {
      const ini = R.paraMin(a.inicio);
      const meu = sessao.usuario && a.usuarioId === sessao.usuario.id;
      const passou = ehHoje && ini + a.duracao <= minAgora;
      const chave = `${b.id}|${a.inicio}`;
      novos.add(chave);
      const animar = blocosConhecidos && !blocosConhecidos.has(chave);
      const nome = meu ? 'Você' : a.cliente ?? 'Cliente';
      return `<div class="lt-bloco ${meu ? 'meu' : ''} ${passou ? 'passou' : ''} ${animar ? 'novo' : ''}"
        style="left:${pct(ini)}%;width:calc(${(a.duracao / total) * 100}% - 3px)"
        title="${a.inicio} · ${esc(nome)} (${a.duracao} min)">${a.duracao >= 60 ? `${a.inicio} ${esc(nome)}` : esc(nome)}</div>`;
    }).join('');
    const [ai, af] = CONFIG.almoco.map(R.paraMin);
    const almoco = `<div class="lt-almoco" style="left:${pct(ai)}%;width:${((af - ai) / total) * 100}%">ALMOÇO</div>`;
    const linhaAgora = ehHoje && minAgora >= abre && minAgora <= fecha ? `<div class="lt-agora" style="left:${pct(minAgora)}%"></div>` : '';
    return `<div class="lt-linha">${quem}<div class="lt-trilho" style="--meia:${(R.PASSO / total) * 100}%">${almoco}${blocos}${linhaAgora}</div></div>`;
  }).join('');

  $('#linha-tempo').innerHTML = `<div class="lt-horas"><span></span><div class="lt-trilho" style="position:relative">${horas}</div></div>${linhas}`;
  blocosConhecidos = novos;
}

// ---------- escolha de barbeiro e serviço ----------

function desenharEscolhas() {
  $('#escolha-barbeiro').innerHTML = BARBEIROS.map((b) => `
    <button type="button" class="op-barbeiro" role="radio" aria-checked="${b.id === sel.barbeiro}" data-barbeiro="${b.id}">
      <img src="${b.foto}" alt=""><span>${esc(b.nome.split(' ')[0])}</span>
    </button>`).join('');

  $('#escolha-servico').innerHTML = CATEGORIAS_SERVICO.filter((c) => c.id !== 'todos').map((c) => `
    <optgroup label="${c.nome}">
      ${SERVICOS.filter((s) => s.cat === c.id).map((s) => `<option value="${s.id}" ${s.id === sel.servico ? 'selected' : ''}>${esc(s.nome)} · ${R.formatarReais(s.preco)}</option>`).join('')}
    </optgroup>`).join('');
  atualizarDica();
}

function atualizarDica() {
  const s = servicoDe(sel.servico);
  const b = barbeiroDe(sel.barbeiro);
  $('#dica-servico').innerHTML = `${icone('relogio')} ${s.duracao} min · ${b.nome.split(' ')[0]} atende ${diasTexto(b.dias)}`;
}

function diasTexto(dias) {
  const curtos = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return dias.map((d) => curtos[d]).join(', ');
}

export function escolherBarbeiro(id, { abrir = false } = {}) {
  sel.barbeiro = id;
  sel.hora = null;
  $$('.op-barbeiro').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.barbeiro === id)));
  atualizarDica();
  if (sel.dia && !diaDisponivel(sel.dia)) sel.dia = null;
  desenharCalendario();
  desenharHorarios();
  if (abrir) focar();
}

export function escolherServico(id) {
  sel.servico = id;
  sel.hora = null;
  $('#escolha-servico').value = id;
  atualizarDica();
  desenharHorarios();
  const passo = $('#escolha-servico').closest('.passo');
  passo.animate([{ boxShadow: '0 0 0 2px #d4a24c' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 });
}

// ---------- calendário ----------

function infoDia(iso) {
  const b = barbeiroDe(sel.barbeiro);
  const hoje = R.dataISO(agora());
  if (iso < hoje || iso > R.somarDias(hoje, CONFIG.diasAFrente)) return { fora: true };
  const o = R.ocupacaoDoDia({ barbeiro: b, iso, agendamentos: servidor.agendaDoDia(iso), agora: agora(), config: CONFIG });
  return o;
}

const diaDisponivel = (iso) => {
  const i = infoDia(iso);
  return !i.fora && !i.fechado && !i.encerrado && i.livres > 0;
};

function desenharCalendario() {
  const m = sel.mes;
  $('#cal-mes').textContent = `${nomeMes(m.getMonth())} ${m.getFullYear()}`;
  const hoje = R.dataISO(agora());
  const primeiro = new Date(m.getFullYear(), m.getMonth(), 1);
  const diasNoMes = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < primeiro.getDay(); i++) html += '<span class="cal-dia fora"></span>';
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const iso = R.dataISO(new Date(m.getFullYear(), m.getMonth(), dia));
    const info = infoDia(iso);
    let nivel = 'q-zero';
    let rotulo = 'indisponível';
    let largura = 0;
    const indisponivel = info.fora || info.fechado || info.encerrado || info.livres === 0;
    if (!indisponivel) {
      const taxa = info.livres / info.total;
      largura = Math.max(12, taxa * 100);
      nivel = taxa > 0.5 ? 'q-alta' : taxa > 0.25 ? 'q-media' : 'q-baixa';
      rotulo = `${info.livres} horários livres`;
    } else if (info.fechado) rotulo = 'fechado ou folga';
    else if (!info.fora) rotulo = 'lotado';
    html += `<button type="button" class="cal-dia ${indisponivel ? 'indisponivel' : ''} ${iso === hoje ? 'hoje' : ''}"
      data-dia="${iso}" aria-pressed="${iso === sel.dia}" ${indisponivel ? 'aria-disabled="true"' : ''}
      aria-label="${dia} de ${nomeMes(m.getMonth())}, ${rotulo}" tabindex="${focado() ? 0 : -1}">
      ${dia}<span class="barra"><i class="${nivel}" style="width:${largura}%"></i></span></button>`;
  }
  $('#cal-dias').innerHTML = html;

  const mesHoje = new Date(agora().getFullYear(), agora().getMonth(), 1);
  const limite = R.deISO(R.somarDias(hoje, CONFIG.diasAFrente));
  $('#cal-ant').disabled = m <= mesHoje;
  $('#cal-prox').disabled = new Date(m.getFullYear(), m.getMonth() + 1, 1) > limite;
}

const focado = () => $('#calendario').classList.contains('focado');

function focar() {
  const cal = $('#calendario');
  if (focado()) return;
  if (!abertoEm) abertoEm = Date.now();
  const antes = cal.getBoundingClientRect();
  $('#calendario-lugar').style.minHeight = `${antes.height}px`;
  cal.classList.add('focado');
  cal.setAttribute('role', 'dialog');
  cal.setAttribute('aria-modal', 'true');
  cal.removeAttribute('aria-label');
  $('#foco-fundo').hidden = false;
  document.body.classList.add('travado');
  const depois = cal.getBoundingClientRect();
  const dx = antes.left + antes.width / 2 - (depois.left + depois.width / 2);
  const dy = antes.top + antes.height / 2 - (depois.top + depois.height / 2);
  const escala = antes.width / depois.width;
  cal.animate(
    [
      { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${escala})`, opacity: 0.6 },
      { transform: 'translate(-50%, -50%)', opacity: 1 },
    ],
    { duration: 520, easing: 'cubic-bezier(.2,.9,.25,1)' },
  );
  desenharCalendario();
  desenharHorarios();
  setTimeout(() => ($('.cal-dia[aria-pressed="true"]') ?? $('.cal-dia:not(.indisponivel):not(.fora)') ?? $('#cal-fechar')).focus({ preventScroll: true }), 60);
}

function desfocar() {
  const cal = $('#calendario');
  if (!focado()) return;
  const anim = cal.animate(
    [{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: 'translate(-50%, -46%) scale(0.92)', opacity: 0 }],
    { duration: 220, easing: 'ease-in' },
  );
  anim.onfinish = () => {
    cal.classList.remove('focado');
    cal.setAttribute('role', 'button');
    cal.removeAttribute('aria-modal');
    cal.setAttribute('aria-label', 'Abrir calendário');
    $('#foco-fundo').hidden = true;
    $('#calendario-lugar').style.minHeight = '';
    if (!modal.aberto()) document.body.classList.remove('travado');
    desenharCalendario();
    cal.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300 });
  };
}

// ---------- horários do dia ----------

function desenharHorarios({ tomado = null } = {}) {
  const alvo = $('#cal-horarios');
  if (!sel.dia) {
    alvo.innerHTML = `<div class="vazio">${icone('calendario')}<p>Escolha um dia para ver os horários livres de ${esc(barbeiroDe(sel.barbeiro).nome.split(' ')[0])}.</p></div>`;
    return;
  }
  const b = barbeiroDe(sel.barbeiro);
  const s = servicoDe(sel.servico);
  const lista = servidor.horarios({ barbeiroId: b.id, iso: sel.dia, servicoId: s.id });
  const livres = lista.filter((h) => h.estado === 'livre');
  if (sel.hora && !livres.some((h) => h.hora === sel.hora)) {
    tomado = sel.hora;
    sel.hora = null;
  }

  const grupos = [
    ['Manhã', (m) => m < 720],
    ['Tarde', (m) => m >= 720 && m < 1080],
    ['Noite', (m) => m >= 1080],
  ];
  const titulos = { ocupado: 'Ocupado', passado: 'Já passou', curto: `Não cabe ${s.duracao} min aqui` };
  const blocos = grupos.map(([nome, filtro]) => {
    const doGrupo = lista.filter((h) => filtro(R.paraMin(h.hora)));
    if (!doGrupo.length) return '';
    return `<div class="hr-grupo"><h5>${nome}</h5><div class="hr-lista">${doGrupo.map((h, i) => `
      <button type="button" class="hr ${h.estado} ${h.hora === tomado ? 'tomado' : ''}" data-hora="${h.hora}"
        ${h.estado !== 'livre' ? `disabled title="${titulos[h.estado]}"` : ''} aria-pressed="${h.hora === sel.hora}"
        style="animation-delay:${i * 18}ms">${h.hora}</button>`).join('')}</div></div>`;
  }).join('');

  const d = R.deISO(sel.dia);
  // a área da confirmação fica separada para não apagar o que a pessoa está digitando
  // quando a lista de horários se atualiza sozinha
  if (!$('#hr-area', alvo)) {
    alvo.innerHTML = '<div id="hr-area"></div><div class="confirmar" id="confirmar"></div>';
    chaveConfirmacao = '';
  }
  $('#hr-area', alvo).innerHTML = `
    <div class="hr-topo">
      <h4>${dataLonga(d)}</h4>
      <p>${esc(b.nome)} · ${esc(s.nome)} (${s.duracao} min) · <b>${livres.length} horário${livres.length === 1 ? '' : 's'} livre${livres.length === 1 ? '' : 's'}</b></p>
    </div>
    ${livres.length ? '' : `<p class="hr-nada">Nenhum horário livre para ${esc(s.nome)} nesse dia. ${s.duracao > 30 ? 'Tenta um serviço mais curto ou ' : 'Tenta '}outro dia.</p>`}
    ${blocos}`;
  desenharConfirmacao();
}

let chaveConfirmacao = '';

function desenharConfirmacao() {
  const alvo = $('#confirmar');
  if (!alvo) return;
  const chave = sel.hora ? `${sel.barbeiro}|${sel.servico}|${sel.dia}|${sel.hora}|${!!sessao.usuario}` : '';
  if (chave === chaveConfirmacao) return;
  chaveConfirmacao = chave;
  const obsAntes = $('textarea', alvo)?.value ?? '';
  if (!sel.hora) return (alvo.innerHTML = '');
  const b = barbeiroDe(sel.barbeiro);
  const s = servicoDe(sel.servico);
  const fim = R.paraHora(R.paraMin(sel.hora) + s.duracao);
  alvo.innerHTML = `<form class="confirmar-caixa" id="form-agendar" novalidate>
    <div class="confirmar-resumo">
      <img src="${b.foto}" alt="">
      <div><b>${esc(s.nome)}</b><span>${sel.hora} às ${fim} com ${esc(b.nome.split(' ')[0])}</span></div>
      <span class="preco"><small>R$</small>${(s.preco / 100).toFixed(0)}</span>
    </div>
    <label class="campo"><span>Observação (opcional)</span><textarea name="obs" maxlength="200" rows="2" placeholder="Ex.: quero manter o topo comprido"></textarea></label>
    <label class="isca" aria-hidden="true">Site<input class="isca" name="site" tabindex="-1" autocomplete="off"></label>
    <button class="btn btn-ouro btn-cheio" data-carregando="Reservando">${icone('check')}${sessao.usuario ? 'Confirmar agendamento' : 'Entrar e confirmar'}</button>
  </form>`;
  $('#form-agendar textarea').value = obsAntes;
  $('#form-agendar').addEventListener('submit', confirmar);
}

async function confirmar(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const botao = $('button.btn', form);
  const dados = Object.fromEntries(new FormData(form));
  if (!(await exigirLogin('Entre ou crie sua conta para garantir o horário. Leva 20 segundos.'))) return;
  const pedido = { barbeiroId: sel.barbeiro, iso: sel.dia, inicio: sel.hora, servicoId: sel.servico, obs: dados.obs, site: dados.site, abertoEm };
  const r = await carregando(botao, () => servidor.agendar(sessao.token, pedido));
  if (!r.ok) {
    avisar({ texto: esc(r.erro), tipo: 'erro', simbolo: 'fechar', tempo: 6000 });
    if (r.codigo === 'ocupado') desenharHorarios();
    return;
  }
  sel.hora = null;
  desfocar();
  atualizarTudo();
  mostrarSucesso(r.agendamento);
}

function linkGoogleAgenda(ag) {
  const s = servicoDe(ag.servicoId);
  const b = barbeiroDe(ag.barbeiroId);
  const ini = R.deISO(ag.data);
  ini.setMinutes(R.paraMin(ag.inicio));
  const fim = new Date(ini.getTime() + ag.duracao * 60000);
  const fmt = (d) => `${R.dataISO(d).replaceAll('-', '')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${s.nome} · Barbearia Dias`,
    dates: `${fmt(ini)}/${fmt(fim)}`,
    details: `Com ${b.nome}.`,
    location: CONFIG.endereco,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function mostrarSucesso(ag) {
  const s = servicoDe(ag.servicoId);
  const b = barbeiroDe(ag.barbeiroId);
  const m = modal.abrir(`<div class="sucesso">
    <div class="sucesso-icone">${icone('check')}</div>
    <h2 id="modal-titulo">Horário garantido!</h2>
    <p class="modal-sub">Já tá na agenda ao vivo. Chega uns 5 minutinhos antes.</p>
    <div class="ticket">
      <div><span>Serviço</span><b>${esc(s.nome)}</b></div>
      <div><span>Barbeiro</span><b>${esc(b.nome)}</b></div>
      <div><span>Quando</span><b>${dataLonga(R.deISO(ag.data))}, ${ag.inicio}</b></div>
      <div><span>Valor</span><b>${R.formatarReais(ag.preco)} (paga na hora)</b></div>
      <div><span>Código</span><b>#${esc(ag.id.replace('ag_', '').toUpperCase())}</b></div>
    </div>
    <div class="botoes-linha" style="width:100%">
      <a class="btn btn-linha btn-pequeno" href="${linkGoogleAgenda(ag)}" target="_blank" rel="noopener">${icone('calendario')}Google Agenda</a>
      <button type="button" class="btn btn-ouro btn-pequeno" data-fechar-modal>Fechou!</button>
    </div>
  </div>`);
  $('.btn-ouro', m).focus();
}

// ---------- tempo real ----------

export function atualizarTudo({ evento = null } = {}) {
  ultimaAtualizacao = Date.now();
  const at = $('#atualizado');
  at.classList.add('agora');
  at.textContent = 'Atualizado agora';
  setTimeout(() => at.classList.remove('agora'), 1500);
  desenharLinhaTempo();
  desenharCalendario();
  if (focado()) desenharHorarios();
  else if (sel.hora && !servidor.horarios({ barbeiroId: sel.barbeiro, iso: sel.dia, servicoId: sel.servico }).some((h) => h.hora === sel.hora && h.estado === 'livre')) {
    sel.hora = null;
  }
  if (evento) {
    const ag = evento.ag;
    if (focado() && ag.barbeiroId === sel.barbeiro && ag.data === sel.dia && evento.tipo === 'agendou' && !ag.meu) {
      const botao = $(`.hr[data-hora="${ag.inicio}"]`);
      botao?.classList.add('tomado');
    }
  }
}

function avisarMovimento(e) {
  if (e.tipo !== 'agendou' || e.ag?.meu) return;
  const b = barbeiroDe(e.ag.barbeiroId);
  const hoje = R.dataISO(agora());
  const quando = e.ag.data === hoje ? 'hoje' : e.ag.data === R.somarDias(hoje, 1) ? 'amanhã' : dataLonga(R.deISO(e.ag.data));
  avisar({
    texto: `<b>${esc(e.ag.cliente)}</b> acabou de marcar ${quando} às <b>${e.ag.inicio}</b> com ${esc(b.nome.split(' ')[0])}`,
    img: b.foto,
  });
}

/** Outro "cliente" marca um horário de tempos em tempos, para a agenda ter vida. */
function agendarSimulacao() {
  const espera = 22000 + Math.random() * 26000;
  setTimeout(() => {
    if (document.visibilityState === 'visible') servidor.simularCliente();
    agendarSimulacao();
  }, espera);
}

// ---------- início ----------

export function iniciarAgenda() {
  const hoje = R.dataISO(agora());
  sel.barbeiro = (BARBEIROS.find((b) => R.expediente(b, hoje, CONFIG)) ?? BARBEIROS[0]).id;
  sel.mes = new Date(agora().getFullYear(), agora().getMonth(), 1);

  desenharEscolhas();
  desenharLinhaTempo();
  desenharCalendario();
  desenharHorarios();

  $('#escolha-barbeiro').addEventListener('click', (e) => {
    const b = e.target.closest('[data-barbeiro]');
    if (b) escolherBarbeiro(b.dataset.barbeiro);
  });
  $('#escolha-servico').addEventListener('change', (e) => escolherServico(e.target.value));

  const cal = $('#calendario');
  cal.addEventListener('click', (e) => {
    if (!focado()) return focar();
    if (e.target.closest('#cal-fechar')) return desfocar();
    if (e.target.closest('#cal-ant')) {
      sel.mes = new Date(sel.mes.getFullYear(), sel.mes.getMonth() - 1, 1);
      return desenharCalendario();
    }
    if (e.target.closest('#cal-prox')) {
      sel.mes = new Date(sel.mes.getFullYear(), sel.mes.getMonth() + 1, 1);
      return desenharCalendario();
    }
    const dia = e.target.closest('.cal-dia');
    if (dia && !dia.classList.contains('indisponivel') && !dia.classList.contains('fora')) {
      sel.dia = dia.dataset.dia;
      sel.hora = null;
      $$('.cal-dia').forEach((d) => d.setAttribute('aria-pressed', String(d === dia)));
      desenharHorarios();
      if (matchMedia('(max-width: 960px)').matches) $('#cal-horarios').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const hora = e.target.closest('.hr:not(:disabled)');
    if (hora) {
      sel.hora = hora.dataset.hora;
      $$('.hr').forEach((h) => h.setAttribute('aria-pressed', String(h === hora)));
      desenharConfirmacao();
      $('#confirmar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  cal.addEventListener('keydown', (e) => {
    if (!focado() && (e.key === 'Enter' || e.key === ' ') && e.target === cal) {
      e.preventDefault();
      focar();
    }
  });
  $('#foco-fundo').addEventListener('click', desfocar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && focado() && !modal.aberto()) desfocar();
  });

  ouvir('agenda', (e) => {
    if (e.tipo === 'estoque') return;
    atualizarTudo({ evento: e });
    avisarMovimento(e);
  });
  ouvir('sessao', () => {
    desenharLinhaTempo();
    desenharConfirmacao();
  });

  // relógio: move a linha do "agora", atualiza o "há X s" e vira o dia à meia-noite
  setInterval(() => {
    const s = Math.round((Date.now() - ultimaAtualizacao) / 1000);
    if (!$('#atualizado').classList.contains('agora')) {
      $('#atualizado').textContent = s < 5 ? 'Atualizado agora' : s < 60 ? `Atualizado há ${s}s` : `Atualizado há ${Math.floor(s / 60)} min`;
    }
  }, 1000);
  setInterval(() => {
    desenharLinhaTempo();
    if (focado()) desenharHorarios();
    else desenharCalendario();
  }, 30000);

  agendarSimulacao();
  setTimeout(() => document.visibilityState === 'visible' && servidor.simularCliente(), 9000);
}

export const agendaSel = sel;
