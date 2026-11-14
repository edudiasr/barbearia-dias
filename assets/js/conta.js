// Login, cadastro, "Meus horários" e "Meus pedidos".

import * as R from './regras.js';
import { BARBEIROS, SERVICOS } from './dados.js';
import { servidor, sessao, entrou, saiu, ouvir } from './estado.js';
import { $, esc, icone, modal, avisar, carregando, erroCampo, dataLonga, nomeMes, rolarPara } from './ui.js';

// ---------- login obrigatório ----------

/**
 * Garante que a pessoa está logada antes de continuar. Se não estiver, abre o login e
 * resolve com true quando ela entrar (ou false se fechar a janela).
 */
export function exigirLogin(motivo = 'Entre na sua conta para continuar.') {
  if (sessao.usuario) return Promise.resolve(true);
  return new Promise((resolve) => abrirLogin({ motivo, aoTerminar: resolve }));
}

export function abrirLogin({ aba = 'entrar', motivo = '', aoTerminar = null } = {}) {
  let concluiu = false;
  const abertoEm = Date.now();
  const m = modal.abrir(
    `<h2 id="modal-titulo">Sua conta</h2>
     <p class="modal-sub">${esc(motivo || 'Entre para agendar horários e comprar na loja.')}</p>
     <div class="abas" role="tablist">
       <button type="button" role="tab" data-aba="entrar">Entrar</button>
       <button type="button" role="tab" data-aba="criar">Criar conta</button>
     </div>
     <div id="area-conta"></div>
     <p class="seguro">${icone('escudo')}Senha protegida com hash PBKDF2. Conta de demonstração.</p>`,
    { aoFechar: () => { if (!concluiu) aoTerminar?.(false); } },
  );

  const sucesso = (r) => {
    concluiu = true;
    entrou(r);
    modal.fechar();
    avisar({ texto: `Fala, <b>${esc(r.usuario.nome.split(' ')[0])}</b>! Você está dentro. 👊`, tipo: 'ok' });
    aoTerminar?.(true);
  };

  const trocar = (qual) => {
    m.querySelectorAll('[data-aba]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aba === qual)));
    $('#area-conta', m).innerHTML = qual === 'entrar' ? formEntrar() : formCriar();
    const f = $('form', m);
    f.querySelector('input:not(.isca)').focus();
    if (qual === 'entrar') ligarEntrar(f, sucesso);
    else ligarCriar(f, abertoEm, sucesso);
  };
  m.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => trocar(b.dataset.aba)));
  trocar(aba);
}

const isca = `<label class="isca" aria-hidden="true">Site<input class="isca" name="site" tabindex="-1" autocomplete="off"></label>`;

function formEntrar() {
  return `<form class="form" novalidate>
    <label class="campo"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
    <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="current-password" required></label>
    ${isca}
    <div class="erro-geral" hidden></div>
    <button class="btn btn-ouro btn-cheio" data-carregando="Entrando">${icone('usuario')}Entrar</button>
    <p class="dica" style="text-align:center">Primeira vez? Clique em <b>Criar conta</b>, leva 20 segundos.</p>
  </form>`;
}

function formCriar() {
  return `<form class="form" novalidate>
    <label class="campo"><span>Nome completo</span><input name="nome" autocomplete="name" maxlength="60" required></label>
    <div class="duas">
      <label class="campo"><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="campo"><span>WhatsApp</span><input name="telefone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 91234-5678" required></label>
    </div>
    <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="new-password" required>
      <span class="forca" data-n="0"><i></i><i></i><i></i><i></i></span>
    </label>
    ${isca}
    <div class="erro-geral" hidden></div>
    <button class="btn btn-ouro btn-cheio" data-carregando="Criando conta">${icone('check')}Criar conta</button>
  </form>`;
}

function mostrarErro(form, msg) {
  const el = $('.erro-geral', form);
  el.hidden = !msg;
  el.textContent = msg ?? '';
  if (msg) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }
}

function ligarEntrar(form, sucesso) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const erroEmail = R.validarEmail(d.email);
    erroCampo(form.email, erroEmail);
    erroCampo(form.senha, d.senha ? null : 'Digite a senha.');
    if (erroEmail || !d.senha) return;
    mostrarErro(form, null);
    const r = await carregando($('button.btn', form), () => servidor.entrar(d));
    if (r.ok) sucesso(r);
    else mostrarErro(form, r.erro);
  });
}

function ligarCriar(form, abertoEm, sucesso) {
  form.telefone.addEventListener('input', () => (form.telefone.value = R.mascaraTelefone(form.telefone.value)));
  form.senha.addEventListener('input', () => ($('.forca', form).dataset.n = R.forcaSenha(form.senha.value)));
  const regras = { nome: R.validarNome, email: R.validarEmail, telefone: R.validarTelefone, senha: R.validarSenha };
  for (const [campo, fn] of Object.entries(regras)) {
    form[campo].addEventListener('blur', () => form[campo].value && erroCampo(form[campo], fn(form[campo].value)));
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    let ok = true;
    for (const [campo, fn] of Object.entries(regras)) {
      const erro = fn(d[campo]);
      erroCampo(form[campo], erro);
      if (erro && ok) form[campo].focus();
      if (erro) ok = false;
    }
    if (!ok) return;
    mostrarErro(form, null);
    const r = await carregando($('button.btn', form), () => servidor.cadastrar({ ...d, abertoEm }));
    if (r.ok) sucesso(r);
    else mostrarErro(form, r.erro);
  });
}

// ---------- barra lateral ----------

function atualizarLateral() {
  const u = sessao.usuario;
  const av = $('#avatar-lateral');
  av.classList.toggle('logado', !!u);
  av.innerHTML = u ? esc(u.nome.trim()[0].toUpperCase()) : icone('usuario');
  $('#nome-lateral').textContent = u ? u.nome.split(' ')[0] : 'Entrar';
  $('#sub-lateral').textContent = u ? 'Minha conta' : 'ou criar conta';
}

// ---------- minha conta ----------

const barbeiroDe = (id) => BARBEIROS.find((b) => b.id === id);
const servicoDe = (id) => SERVICOS.find((s) => s.id === id);

export async function abrirMeusHorarios() {
  if (!(await exigirLogin('Entre para ver seus horários.'))) return;
  const m = modal.abrir(
    `${topoConta()}
     <h2 id="modal-titulo">Meus horários</h2>
     <p class="modal-sub">Cancelamento grátis até 1 hora antes.</p>
     <div class="lista-conta" id="lista-horarios"><p class="dica">Carregando…</p></div>`,
    { classe: 'largo' },
  );
  ligarSair(m);
  const desenhar = async () => {
    const r = await servidor.meusAgendamentos(sessao.token);
    const alvo = $('#lista-horarios', m);
    if (!alvo) return;
    if (!r.ok) return (alvo.innerHTML = `<p class="erro-geral">${esc(r.erro)}</p>`);
    if (!r.lista.length) {
      alvo.innerHTML = `<div class="vazio">${icone('calendario')}<p>Nenhum horário marcado ainda.</p>
        <button type="button" class="btn btn-ouro btn-pequeno" data-marcar>Marcar agora</button></div>`;
      $('[data-marcar]', alvo).addEventListener('click', () => { modal.fechar(); rolarPara('agenda'); });
      return;
    }
    const agora = new Date();
    alvo.innerHTML = r.lista.map((a) => {
      const b = barbeiroDe(a.barbeiroId);
      const s = servicoDe(a.servicoId);
      const d = R.deISO(a.data);
      const quando = new Date(d);
      quando.setMinutes(R.paraMin(a.inicio));
      const futuro = quando > agora;
      const etiqueta = a.cancelado ? '<span class="etiqueta vermelha">Cancelado</span>'
        : futuro ? `<button type="button" class="btn btn-vermelho btn-pequeno" data-cancelar="${a.id}" data-carregando="Cancelando">Cancelar</button>`
        : '<span class="etiqueta cinza">Concluído</span>';
      return `<div class="cartao-conta ${!futuro || a.cancelado ? 'velho' : ''}">
        <div class="data-bloco"><b>${d.getDate()}</b><small>${nomeMes(d.getMonth()).slice(0, 3)}</small></div>
        <div><b>${esc(s?.nome ?? 'Serviço')} · ${a.inicio}</b>
          <small>${dataLonga(d)} com ${esc(b?.nome ?? '')} · ${R.formatarReais(a.preco ?? s?.preco ?? 0)}</small></div>
        ${etiqueta}
      </div>`;
    }).join('');
    alvo.querySelectorAll('[data-cancelar]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Cancelar esse horário?')) return;
      const c = await carregando(btn, () => servidor.cancelar(sessao.token, btn.dataset.cancelar));
      if (c.ok) {
        avisar({ texto: 'Horário cancelado. Ele já voltou pra agenda.', tipo: 'ok' });
        desenhar();
      } else avisar({ texto: esc(c.erro), tipo: 'erro', simbolo: 'fechar' });
    }));
  };
  desenhar();
}

export async function abrirMeusPedidos() {
  if (!(await exigirLogin('Entre para ver seus pedidos.'))) return;
  const m = modal.abrir(
    `${topoConta()}
     <h2 id="modal-titulo">Meus pedidos</h2>
     <p class="modal-sub">Compras feitas na loja da barbearia.</p>
     <div class="lista-conta" id="lista-pedidos"><p class="dica">Carregando…</p></div>`,
    { classe: 'largo' },
  );
  ligarSair(m);
  const r = await servidor.meusPedidos(sessao.token);
  const alvo = $('#lista-pedidos', m);
  if (!alvo) return;
  if (!r.ok) return (alvo.innerHTML = `<p class="erro-geral">${esc(r.erro)}</p>`);
  if (!r.lista.length) {
    alvo.innerHTML = `<div class="vazio">${icone('sacola')}<p>Você ainda não comprou nada na loja.</p>
      <button type="button" class="btn btn-ouro btn-pequeno" data-loja>Ver produtos</button></div>`;
    $('[data-loja]', alvo).addEventListener('click', () => { modal.fechar(); rolarPara('loja'); });
    return;
  }
  alvo.innerHTML = r.lista.map((p) => {
    const d = new Date(p.criadoEm);
    const itens = p.itens.map((i) => `${i.qtd}× ${esc(i.nome)}`).join(', ');
    const cor = p.status.startsWith('Aguardando') ? 'ouro' : '';
    return `<div class="cartao-conta">
      <div class="aviso-icone">${icone(p.entrega.tipo === 'entrega' ? 'moto' : 'loja')}</div>
      <div><b>Pedido ${esc(p.id)} · ${R.formatarReais(p.total)}</b>
        <small>${d.toLocaleDateString('pt-BR')} · ${p.entrega.tipo === 'entrega' ? 'Entrega' : 'Retirada na barbearia'} · ${itens}</small></div>
      <span class="etiqueta ${cor}">${esc(p.status)}</span>
    </div>`;
  }).join('');
}

function topoConta() {
  const u = sessao.usuario;
  return `<div class="conta-topo">
    <span class="avatar logado">${esc(u.nome.trim()[0].toUpperCase())}</span>
    <div><b>${esc(u.nome)}</b><small>${esc(u.email)}</small></div>
    <button type="button" class="btn btn-linha btn-pequeno" data-sair>${icone('sair')}Sair</button>
  </div>`;
}

function ligarSair(m) {
  $('[data-sair]', m).addEventListener('click', async () => {
    await saiu();
    modal.fechar();
    avisar({ texto: 'Você saiu da conta. Até a próxima!', simbolo: 'sair' });
  });
}

export function iniciarConta() {
  atualizarLateral();
  ouvir('sessao', atualizarLateral);
  $('#btn-conta').addEventListener('click', () => (sessao.usuario ? abrirMeusHorarios() : abrirLogin()));
}
