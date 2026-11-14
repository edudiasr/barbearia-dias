// Peças de interface usadas em todo o site: atalhos de DOM, avisos, modal e login obrigatório.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapa texto antes de colocar em HTML (nome de usuário, observação etc.). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

export const icone = (nome, classe = '') => `<svg class="${classe}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;

export function lerLocal(chave, padrao = null) {
  try {
    const v = localStorage.getItem(chave);
    return v == null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
}

export function gravarLocal(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: segue sem salvar */
  }
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDia = (d) => DIAS[d.getDay()];
export const nomeMes = (m) => MESES[m];
export const dataLonga = (d) => `${nomeDia(d)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
export const dataCurta = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// ---------- avisos ----------

export function avisar({ texto, tipo = 'info', img = null, simbolo = 'check', tempo = 4500 }) {
  const caixa = $('#avisos');
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.innerHTML = `${img ? `<img src="${img}" alt="">` : `<span class="aviso-icone">${icone(simbolo)}</span>`}<div>${texto}</div>`;
  caixa.prepend(el);
  while (caixa.children.length > 3) caixa.lastElementChild.remove();
  setTimeout(() => {
    el.classList.add('saindo');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, tempo);
}

// ---------- modal ----------

let aoFecharAtual = null;
let focoAnterior = null;

export const modal = {
  aberto: () => !$('#modal-fundo').hidden,

  abrir(html, { classe = '', aoFechar = null } = {}) {
    if (this.aberto()) this.fechar(true);
    focoAnterior = document.activeElement;
    const m = $('#modal');
    m.className = `modal ${classe}`;
    m.innerHTML = `<button type="button" class="icone-btn modal-fechar" data-fechar-modal aria-label="Fechar">${icone('fechar')}</button>${html}`;
    $('#modal-fundo').hidden = false;
    document.body.classList.add('travado');
    aoFecharAtual = aoFechar;
    requestAnimationFrame(() => (m.querySelector('input:not(.isca), select, textarea, .btn') ?? m.querySelector('[data-fechar-modal]')).focus({ preventScroll: true }));
    return m;
  },

  fechar(trocando = false) {
    if (!this.aberto()) return;
    $('#modal-fundo').hidden = true;
    $('#modal').innerHTML = '';
    if (!document.querySelector('.calendario.focado') && $('#carrinho').hidden) document.body.classList.remove('travado');
    const cb = aoFecharAtual;
    aoFecharAtual = null;
    cb?.(trocando);
    if (!trocando) focoAnterior?.focus?.({ preventScroll: true });
  },
};

export function iniciarModal() {
  $('#modal-fundo').addEventListener('mousedown', (e) => {
    if (e.target.id === 'modal-fundo') modal.fechar();
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-fechar-modal]')) modal.fechar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.aberto()) modal.fechar();
  });
}

/** Botão em estado de carregando enquanto a "API" responde. */
export async function carregando(botao, tarefa) {
  const original = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = `<span class="girando"></span>${botao.dataset.carregando ?? 'Aguarde'}`;
  try {
    return await tarefa();
  } finally {
    if (botao.isConnected) {
      botao.disabled = false;
      botao.innerHTML = original;
    }
  }
}

/** Mostra erro embaixo do campo (ou some com ele se `msg` for vazio). */
export function erroCampo(input, msg) {
  const campo = input.closest('.campo');
  campo.classList.toggle('erro', !!msg);
  let el = campo.querySelector('.campo-erro');
  if (!msg) return el?.remove();
  if (!el) {
    el = document.createElement('small');
    el.className = 'campo-erro';
    campo.append(el);
  }
  el.textContent = msg;
}

export function rolarPara(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
