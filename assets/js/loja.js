// Loja: vitrine, carrinho (gaveta lateral) e checkout em 3 etapas.

import * as R from './regras.js';
import { CONFIG, PRODUTOS, CATEGORIAS_PRODUTO } from './dados.js';
import { servidor, sessao, ouvir } from './estado.js';
import { exigirLogin, abrirMeusPedidos } from './conta.js';
import { $, $$, esc, icone, avisar, modal, carregando, erroCampo, lerLocal, gravarLocal } from './ui.js';

let carrinho = lerLocal('bd:carrinho', []).filter((i) => PRODUTOS.some((p) => p.id === i.id));
let cupom = lerLocal('bd:cupom', null);
let filtro = 'todos';
let busca = '';

const produtoDe = (id) => PRODUTOS.find((p) => p.id === id);
const salvar = () => {
  gravarLocal('bd:carrinho', carrinho);
  gravarLocal('bd:cupom', cupom);
};

// ---------- vitrine ----------

function desenharFiltros() {
  $('#filtro-produtos').innerHTML = CATEGORIAS_PRODUTO.map((c) =>
    `<button type="button" class="chip" role="tab" aria-selected="${c.id === filtro}" data-cat="${c.id}">${c.nome}</button>`).join('');
}

function desenharProdutos() {
  const termo = busca.trim().toLowerCase();
  const lista = PRODUTOS.filter((p) => (filtro === 'todos' || p.cat === filtro) &&
    (!termo || `${p.nome} ${p.marca} ${p.detalhe}`.toLowerCase().includes(termo)));
  $('#lista-produtos').innerHTML = lista.length ? lista.map((p, i) => {
    const estoque = servidor.estoque(p.id);
    const noCarrinho = carrinho.find((c) => c.id === p.id)?.qtd ?? 0;
    const selos = [
      p.novo && '<span class="selo selo-novo">Novo</span>',
      p.de && `<span class="selo selo-oferta">-${Math.round((1 - p.preco / p.de) * 100)}%</span>`,
      estoque > 0 && estoque <= 5 && `<span class="selo selo-pouco">Últimas ${estoque}</span>`,
      estoque === 0 && '<span class="selo">Esgotado</span>',
    ].filter(Boolean).join('');
    return `<article class="produto" style="animation-delay:${Math.min(i, 12) * 35}ms">
      <div class="produto-foto">
        <img src="${p.foto}" alt="${esc(p.nome)}" loading="lazy" width="640" height="640">
        <div class="produto-selos">${selos}</div>
      </div>
      <div class="produto-corpo">
        <span class="produto-marca">${esc(p.marca)}</span>
        <h3>${esc(p.nome)}</h3>
        <p class="produto-detalhe">${esc(p.detalhe)}</p>
        <span class="nota">${icone('estrela')}${p.nota.toFixed(1).replace('.', ',')}</span>
        <div class="produto-rodape">
          <div>${p.de ? `<span class="de">${R.formatarReais(p.de)}</span>` : ''}<span class="preco"><small>R$</small>${(p.preco / 100).toFixed(2).replace('.', ',')}</span></div>
          <button type="button" class="add" data-add="${p.id}" aria-label="Adicionar ${esc(p.nome)} ao carrinho"
            ${estoque <= noCarrinho ? 'disabled' : ''}>${icone('mais')}</button>
        </div>
      </div>
    </article>`;
  }).join('') : `<p class="loja-vazia">Nada encontrado para “${esc(busca)}”.</p>`;
}

function voarParaCarrinho(img) {
  const destino = $$('.carrinho-btn').find((b) => b.offsetParent !== null);
  if (!img || !destino) return;
  const de = img.getBoundingClientRect();
  const para = destino.getBoundingClientRect();
  const voo = document.createElement('img');
  voo.src = img.src;
  voo.className = 'voando';
  voo.style.left = `${de.left + de.width / 2 - 30}px`;
  voo.style.top = `${de.top + de.height / 2 - 30}px`;
  document.body.append(voo);
  const dx = para.left + para.width / 2 - (de.left + de.width / 2);
  const dy = para.top + para.height / 2 - (de.top + de.height / 2);
  voo.animate(
    [
      { transform: 'translate(0,0) scale(1.4)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 80}px) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.4 },
    ],
    { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)' },
  ).onfinish = () => voo.remove();
}

export function adicionar(id, origem = null) {
  const p = produtoDe(id);
  const item = carrinho.find((c) => c.id === id);
  const qtd = (item?.qtd ?? 0) + 1;
  if (qtd > Math.min(10, servidor.estoque(id))) {
    return avisar({ texto: `Limite de ${p.nome} atingido.`, tipo: 'erro', simbolo: 'fechar' });
  }
  if (item) item.qtd = qtd;
  else carrinho.push({ id, qtd: 1 });
  salvar();
  voarParaCarrinho(origem);
  setTimeout(() => atualizarContador(true), 650);
  desenharProdutos();
  desenharCarrinho();
  avisar({ texto: `<b>${esc(p.nome)}</b> foi pro carrinho.`, img: p.foto, tempo: 2600 });
}

// ---------- carrinho ----------

function atualizarContador(pulo = false) {
  const n = carrinho.reduce((s, i) => s + i.qtd, 0);
  $$('[data-qtd-carrinho]').forEach((b) => {
    b.hidden = n === 0;
    b.textContent = n;
    if (pulo) {
      b.classList.remove('pulou');
      void b.offsetWidth;
      b.classList.add('pulou');
    }
  });
}

const resumo = (entrega = 'retirada') => R.resumoCarrinho(carrinho, PRODUTOS, { entrega, cupom, config: CONFIG });

function desenharCarrinho() {
  const r = resumo('entrega');
  const corpo = $('#carrinho-itens');
  const pe = $('#carrinho-pe');
  if (!carrinho.length) {
    corpo.innerHTML = `<div class="carrinho-vazio">${icone('sacola')}<p>Seu carrinho está vazio.<br>Que tal uma pomada nova?</p>
      <button type="button" class="btn btn-linha btn-pequeno" data-ver-loja>Ver produtos</button></div>`;
    pe.innerHTML = '';
    return;
  }
  corpo.innerHTML = r.linhas.map((l) => `
    <div class="item">
      <img src="${l.foto}" alt="">
      <div><b>${esc(l.nome)}</b><small>${R.formatarReais(l.preco)} un.</small><br>
        <span class="qtd">
          <button type="button" data-menos="${l.id}" aria-label="Diminuir">${icone('menos')}</button>
          <span>${l.qtd}</span>
          <button type="button" data-mais="${l.id}" aria-label="Aumentar" ${l.qtd >= Math.min(10, servidor.estoque(l.id)) ? 'disabled' : ''}>${icone('mais')}</button>
        </span>
      </div>
      <div class="item-dir"><b>${R.formatarReais(l.total)}</b><button type="button" data-tirar="${l.id}" aria-label="Remover">${icone('lixo')}</button></div>
    </div>`).join('');

  const pctFrete = Math.min(100, ((r.subtotal - r.desconto) / CONFIG.freteGratisAcima) * 100);
  pe.innerHTML = `
    <div class="frete-barra">${r.faltaFreteGratis > 0
      ? `Faltam <b>${R.formatarReais(r.faltaFreteGratis)}</b> para frete grátis na entrega`
      : '🎉 <b>Frete grátis</b> liberado para entrega'}<div class="trilho"><i style="width:${pctFrete}%"></i></div></div>
    <form class="cupom" id="form-cupom">
      <input name="cupom" placeholder="Cupom" value="${esc(cupom ?? '')}" aria-label="Cupom de desconto" maxlength="20">
      <button class="btn btn-linha btn-pequeno">${cupom ? 'Trocar' : 'Aplicar'}</button>
    </form>
    <div class="linha-valor"><span>Subtotal</span><span>${R.formatarReais(r.subtotal)}</span></div>
    ${r.desconto ? `<div class="linha-valor desconto"><span>Cupom ${esc(r.cupom.codigo)} (-${r.cupom.porcento}%)</span><span>-${R.formatarReais(r.desconto)}</span></div>` : ''}
    <div class="linha-valor total"><span>Total</span><span>${R.formatarReais(r.subtotal - r.desconto)}</span></div>
    <small class="dica" style="margin:0">Frete calculado no checkout. Retirada na barbearia é grátis.</small>
    <button type="button" class="btn btn-ouro btn-cheio" id="finalizar">${icone('check')}Finalizar compra</button>`;
}

export function aplicarCupom(codigo, { silencioso = false } = {}) {
  const c = R.buscarCupom(codigo, CONFIG);
  if (!c) {
    if (!silencioso) avisar({ texto: 'Cupom inválido.', tipo: 'erro', simbolo: 'fechar' });
    return false;
  }
  cupom = c.codigo;
  salvar();
  desenharCarrinho();
  if (!silencioso) avisar({ texto: `Cupom <b>${c.codigo}</b> aplicado: ${c.porcento}% off.`, tipo: 'ok', simbolo: 'presente' });
  return true;
}

export function abrirCarrinho() {
  const g = $('#carrinho');
  desenharCarrinho();
  g.hidden = false;
  g.classList.remove('saindo');
  document.body.classList.add('travado');
  $('#modal-fundo').hidden || modal.fechar();
  requestAnimationFrame(() => $('[data-fechar]', g).focus());
}

export function fecharCarrinho() {
  const g = $('#carrinho');
  if (g.hidden) return;
  g.classList.add('saindo');
  g.addEventListener('animationend', () => {
    g.hidden = true;
    g.classList.remove('saindo');
    if (!modal.aberto()) document.body.classList.remove('travado');
  }, { once: true });
}

// ---------- checkout ----------

async function checkout() {
  if (!(await exigirLogin('Entre na sua conta para finalizar a compra.'))) return abrirCarrinho();
  fecharCarrinho();
  const abertoEm = Date.now();
  const dados = { entrega: { tipo: 'retirada' }, pagamento: 'pix', obs: '' };
  let etapa = 1;

  const m = modal.abrir('<div id="checkout"></div>', { classe: 'largo' });
  const caixa = $('#checkout', m);

  const etapas = () => `<div class="etapas">${['Entrega', 'Pagamento', 'Revisão'].map((n, i) =>
    `<span class="${i < etapa ? 'feita' : ''}">${i + 1}. ${n}</span>`).join('')}</div>`;

  const desenhar = () => {
    const r = resumo(dados.entrega.tipo);
    if (etapa === 1) {
      const e = dados.entrega;
      caixa.innerHTML = `${etapas()}
        <h2 id="modal-titulo">Como você quer receber?</h2>
        <p class="modal-sub">Retirada fica pronta em até 2 horas no horário de funcionamento.</p>
        <form class="form" id="f1" novalidate>
          <div class="opcoes">
            <label class="opcao"><input type="radio" name="tipo" value="retirada" ${e.tipo === 'retirada' ? 'checked' : ''}>
              ${icone('loja')}<b>Retirar na barbearia</b><small>Grátis · ${esc(CONFIG.endereco)}</small></label>
            <label class="opcao"><input type="radio" name="tipo" value="entrega" ${e.tipo === 'entrega' ? 'checked' : ''}>
              ${icone('moto')}<b>Entrega em casa</b><small>${r.subtotal - r.desconto >= CONFIG.freteGratisAcima ? 'Frete grátis' : `${R.formatarReais(CONFIG.frete)} · grátis acima de ${R.formatarReais(CONFIG.freteGratisAcima)}`}</small></label>
          </div>
          <div id="endereco" ${e.tipo === 'entrega' ? '' : 'hidden'} class="form">
            <div class="duas">
              <label class="campo"><span>CEP</span><input name="cep" inputmode="numeric" autocomplete="postal-code" value="${esc(e.cep ?? '')}" placeholder="00000-000"><small class="cep-status" id="cep-status"></small></label>
              <label class="campo"><span>Cidade</span><input name="cidade" autocomplete="address-level2" value="${esc(e.cidade ?? '')}"></label>
            </div>
            <label class="campo"><span>Rua</span><input name="rua" autocomplete="address-line1" value="${esc(e.rua ?? '')}"></label>
            <div class="tres">
              <label class="campo"><span>Bairro</span><input name="bairro" value="${esc(e.bairro ?? '')}"></label>
              <label class="campo"><span>Número</span><input name="numero" inputmode="numeric" value="${esc(e.numero ?? '')}"></label>
              <label class="campo"><span>Complemento</span><input name="complemento" value="${esc(e.complemento ?? '')}" placeholder="Opcional"></label>
            </div>
            <input type="hidden" name="uf" value="${esc(e.uf ?? '')}">
          </div>
          <div class="botoes-linha">
            <button type="button" class="btn btn-linha" data-voltar-carrinho>${icone('esq')}Carrinho</button>
            <button class="btn btn-ouro">Continuar${icone('dir')}</button>
          </div>
        </form>`;
      ligarEtapa1();
    } else if (etapa === 2) {
      const retirada = dados.entrega.tipo === 'retirada';
      if (!retirada && dados.pagamento === 'balcao') dados.pagamento = 'pix';
      caixa.innerHTML = `${etapas()}
        <h2 id="modal-titulo">Pagamento</h2>
        <p class="modal-sub">Demonstração: nenhum pagamento de verdade é feito.</p>
        <form class="form" id="f2" novalidate>
          <div class="opcoes">
            <label class="opcao"><input type="radio" name="pagamento" value="pix" ${dados.pagamento === 'pix' ? 'checked' : ''}>
              ${icone('check')}<b>Pix</b><small>QR code na próxima tela. Aprovação na hora.</small></label>
            <label class="opcao"><input type="radio" name="pagamento" value="balcao" ${dados.pagamento === 'balcao' ? 'checked' : ''} ${retirada ? '' : 'disabled'}>
              ${icone('loja')}<b>Pagar no balcão</b><small>${retirada ? 'Dinheiro, cartão ou Pix na retirada.' : 'Só para retirada na barbearia.'}</small></label>
          </div>
          <label class="campo"><span>Observação (opcional)</span><textarea name="obs" maxlength="200" rows="2" placeholder="Ex.: embrulhar pra presente">${esc(dados.obs)}</textarea></label>
          <label class="isca" aria-hidden="true">Site<input class="isca" name="site" tabindex="-1" autocomplete="off"></label>
          <div class="botoes-linha">
            <button type="button" class="btn btn-linha" data-voltar>${icone('esq')}Voltar</button>
            <button class="btn btn-ouro">Revisar${icone('dir')}</button>
          </div>
        </form>`;
      $('#f2', caixa).addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = Object.fromEntries(new FormData(ev.target));
        if (R.pareceSpam(f.obs)) return erroCampo(ev.target.obs, 'Tire links e textos promocionais da observação.');
        Object.assign(dados, { pagamento: f.pagamento, obs: f.obs, site: f.site });
        etapa = 3;
        desenhar();
      });
    } else {
      const e = dados.entrega;
      caixa.innerHTML = `${etapas()}
        <h2 id="modal-titulo">Confere aí</h2>
        <p class="modal-sub">${e.tipo === 'entrega' ? `Entrega em ${esc(e.rua)}, ${esc(e.numero)}${e.complemento ? ` (${esc(e.complemento)})` : ''} · ${esc(e.bairro)}, ${esc(e.cidade)}` : 'Retirada na barbearia'} · ${dados.pagamento === 'pix' ? 'Pix' : 'Pagar no balcão'}</p>
        <div class="resumo-mini">
          ${r.linhas.map((l) => `<div class="linha-valor"><span>${l.qtd}× ${esc(l.nome)}</span><span>${R.formatarReais(l.total)}</span></div>`).join('')}
          ${r.desconto ? `<div class="linha-valor desconto"><span>Cupom ${esc(r.cupom.codigo)}</span><span>-${R.formatarReais(r.desconto)}</span></div>` : ''}
          <div class="linha-valor"><span>Frete</span><span>${e.tipo === 'retirada' ? 'Retirada' : r.frete ? R.formatarReais(r.frete) : 'Grátis'}</span></div>
          <div class="linha-valor total"><span>Total</span><span>${R.formatarReais(r.total)}</span></div>
        </div>
        <div class="botoes-linha">
          <button type="button" class="btn btn-linha" data-voltar>${icone('esq')}Voltar</button>
          <button type="button" class="btn btn-ouro" id="fechar-pedido" data-carregando="Enviando pedido">${icone('check')}Confirmar pedido</button>
        </div>`;
      $('#fechar-pedido', caixa).addEventListener('click', async (ev) => {
        if (Date.now() - abertoEm < 2500) return avisar({ texto: 'Calma, confere os dados antes de confirmar.', tipo: 'erro', simbolo: 'fechar' });
        const resp = await carregando(ev.currentTarget, () => servidor.criarPedido(sessao.token, {
          itens: carrinho, entrega: dados.entrega, pagamento: dados.pagamento, cupom, obs: dados.obs,
        }));
        if (!resp.ok) return avisar({ texto: esc(resp.erro), tipo: 'erro', simbolo: 'fechar', tempo: 6000 });
        carrinho = [];
        cupom = null;
        salvar();
        atualizarContador();
        desenharProdutos();
        pedidoFeito(resp.pedido);
      });
    }
    caixa.querySelector('[data-voltar]')?.addEventListener('click', () => { etapa--; desenhar(); });
    caixa.querySelector('[data-voltar-carrinho]')?.addEventListener('click', () => { modal.fechar(); abrirCarrinho(); });
  };

  const ligarEtapa1 = () => {
    const f = $('#f1', caixa);
    f.addEventListener('change', (ev) => {
      if (ev.target.name !== 'tipo') return;
      dados.entrega.tipo = ev.target.value;
      $('#endereco', f).hidden = ev.target.value !== 'entrega';
      if (ev.target.value === 'entrega') f.cep.focus();
    });
    f.cep.addEventListener('input', async () => {
      f.cep.value = R.mascaraCEP(f.cep.value);
      if (R.soDigitos(f.cep.value).length === 8) buscarCep(f);
    });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (d.tipo === 'entrega') {
        const checar = [['cep', R.validarCEP(d.cep)], ['rua', !d.rua.trim() && 'Preencha a rua.'], ['numero', !d.numero.trim() && 'Preencha o número.'],
          ['bairro', !d.bairro.trim() && 'Preencha o bairro.'], ['cidade', !d.cidade.trim() && 'Preencha a cidade.']];
        let primeiro = null;
        for (const [campo, erro] of checar) {
          erroCampo(f[campo], erro || null);
          if (erro && !primeiro) primeiro = f[campo];
        }
        if (primeiro) return primeiro.focus();
        dados.entrega = { tipo: 'entrega', cep: d.cep, rua: d.rua, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.cidade, uf: d.uf };
      } else {
        dados.entrega = { ...dados.entrega, tipo: 'retirada' };
      }
      etapa = 2;
      desenhar();
    });
  };

  desenhar();
}

/** Busca o endereço pelo CEP na API pública do ViaCEP e preenche os campos. */
async function buscarCep(f) {
  const status = $('#cep-status', f);
  status.textContent = 'Buscando endereço…';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${R.soDigitos(f.cep.value)}/json/`).then((x) => x.json());
    if (r.erro) throw new Error();
    f.rua.value = r.logradouro || f.rua.value;
    f.bairro.value = r.bairro || f.bairro.value;
    f.cidade.value = r.localidade ? `${r.localidade}` : f.cidade.value;
    f.uf.value = r.uf ?? '';
    status.textContent = `${r.localidade}/${r.uf} ✓`;
    erroCampo(f.cep, null);
    (f.rua.value ? f.numero : f.rua).focus();
  } catch {
    status.textContent = 'Não achei esse CEP. Preencha o endereço à mão.';
  }
}

/** QR "de mentira" desenhado a partir do código, só para a tela ficar com cara de Pix. */
function qrFalso(texto) {
  const n = 25;
  const sortear = R.sorteador(R.hashTexto(texto));
  let rects = '';
  const olho = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#000"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#000"/>`;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const noOlho = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!noOlho && sortear() < 0.48) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#000"/>`;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code de demonstração">${rects}${olho(0, 0)}${olho(n - 7, 0)}${olho(0, n - 7)}</svg>`;
}

function pedidoFeito(p) {
  const m = modal.abrir(`<div class="sucesso">
    <div class="sucesso-icone">${icone('check')}</div>
    <h2 id="modal-titulo">Pedido ${esc(p.id)} feito!</h2>
    <p class="modal-sub">${p.entrega.tipo === 'entrega' ? 'Assim que o pagamento cair, sai pra entrega.' : 'A gente separa e te avisa no WhatsApp quando estiver pronto.'}</p>
    ${p.pix ? `<div class="pix" style="width:100%;text-align:left">${qrFalso(p.pix)}
      <div><b>Pix copia e cola</b><code>${esc(p.pix)}</code>
      <button type="button" class="btn btn-linha btn-pequeno" data-copiar>Copiar código</button>
      <p class="dica">Código de demonstração, não paga nada.</p></div></div>` : ''}
    <div class="ticket">
      <div><span>Total</span><b>${R.formatarReais(p.total)}</b></div>
      <div><span>Status</span><b>${esc(p.status)}</b></div>
      <div><span>${p.entrega.tipo === 'entrega' ? 'Entrega' : 'Retirada'}</span><b>${p.entrega.tipo === 'entrega' ? `${esc(p.entrega.rua)}, ${esc(p.entrega.numero)}` : esc(CONFIG.endereco)}</b></div>
    </div>
    <div class="botoes-linha" style="width:100%">
      <button type="button" class="btn btn-linha btn-pequeno" data-pedidos>${icone('caixa')}Meus pedidos</button>
      <button type="button" class="btn btn-ouro btn-pequeno" data-fechar-modal>Valeu!</button>
    </div>
  </div>`, { classe: 'largo' });
  $('[data-copiar]', m)?.addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(p.pix);
      e.currentTarget.textContent = 'Copiado ✓';
    } catch {
      e.currentTarget.textContent = 'Selecione e copie';
    }
  });
  $('[data-pedidos]', m).addEventListener('click', abrirMeusPedidos);
}

// ---------- início ----------

export function iniciarLoja() {
  desenharFiltros();
  desenharProdutos();
  atualizarContador();

  $('#filtro-produtos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    filtro = b.dataset.cat;
    desenharFiltros();
    desenharProdutos();
  });
  $('#busca-produto').addEventListener('input', (e) => {
    busca = e.target.value;
    desenharProdutos();
  });
  $('#lista-produtos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    b.classList.add('foi');
    setTimeout(() => b.classList.remove('foi'), 600);
    adicionar(b.dataset.add, b.closest('.produto').querySelector('img'));
  });

  const g = $('#carrinho');
  g.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-fechar]')) return fecharCarrinho();
    if (t.matches('[data-ver-loja]')) {
      fecharCarrinho();
      return document.getElementById('loja').scrollIntoView({ behavior: 'smooth' });
    }
    if (t.id === 'finalizar') return checkout();
    const id = t.dataset.mais ?? t.dataset.menos ?? t.dataset.tirar;
    if (!id) return;
    const item = carrinho.find((c) => c.id === id);
    if (t.dataset.mais) item.qtd = Math.min(item.qtd + 1, 10, servidor.estoque(id));
    if (t.dataset.menos) item.qtd -= 1;
    if (t.dataset.tirar || item.qtd <= 0) carrinho = carrinho.filter((c) => c.id !== id);
    salvar();
    atualizarContador();
    desenharCarrinho();
    desenharProdutos();
  });
  g.addEventListener('submit', (e) => {
    if (e.target.id !== 'form-cupom') return;
    e.preventDefault();
    const v = e.target.cupom.value.trim();
    if (!v) {
      cupom = null;
      salvar();
      return desenharCarrinho();
    }
    aplicarCupom(v);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !g.hidden && !modal.aberto()) fecharCarrinho();
  });

  ouvir('agenda', (e) => e.tipo === 'estoque' && desenharProdutos());
  ouvir('sessao', () => !g.hidden && desenharCarrinho());
}
