// Ponto de entrada: monta as seções, liga a barra lateral, o pop-up de patrocínio e o WhatsApp.

import * as R from './regras.js';
import { BARBEIROS, CONFIG, FOTOS, SERVICOS, CATEGORIAS_SERVICO, PATROCINIO, PARCEIROS } from './dados.js';
import { servidor, ouvir } from './estado.js';
import { $, $$, esc, icone, avisar, modal, iniciarModal, rolarPara, lerLocal, gravarLocal } from './ui.js';
import { iniciarConta, abrirMeusHorarios, abrirMeusPedidos } from './conta.js';
import { iniciarAgenda, escolherBarbeiro, escolherServico } from './agenda.js';
import { iniciarLoja, abrirCarrinho, aplicarCupom } from './loja.js';

const agora = () => new Date();

// ---------- hero ----------

function iniciarHero() {
  const fundo = $('#hero-fundo');
  const img = new Image();
  img.onload = () => (fundo.style.backgroundImage = `url("${img.src}")`);
  img.src = FOTOS.fundo;
  document.documentElement.style.setProperty('--foto-fundo2', `url("${FOTOS.fundo2}")`);

  const parallax = () => {
    const y = scrollY;
    if (y < innerHeight) fundo.style.transform = `scale(1.08) translateY(${y * 0.25}px)`;
    document.body.classList.toggle('rolou', y > innerHeight * 0.7);
  };
  addEventListener('scroll', parallax, { passive: true });
  parallax();

  // números contando quando aparecem
  const contar = new IntersectionObserver((itens) => itens.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    contar.unobserve(target);
    const fim = Number(target.dataset.contar);
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / 1600);
      target.textContent = Math.round(fim * (1 - (1 - p) ** 3)).toLocaleString('pt-BR');
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }));
  $$('[data-contar]').forEach((el) => contar.observe(el));
}

function situacoes() {
  const iso = R.dataISO(agora());
  const ag = servidor.agendaDoDia(iso);
  return BARBEIROS.map((b) => ({ b, s: R.situacaoAgora({ barbeiro: b, agendamentos: ag, agora: agora(), config: CONFIG }) }));
}

const textoSituacao = ({ estado, ate, texto }) => ({
  livre: 'Livre agora',
  atendendo: `Atendendo até ${ate}`,
  almoco: `Almoço até ${ate}`,
  folga: 'Folga hoje',
  fechado: texto ?? 'Fechado',
}[estado]);

function desenharAoVivo() {
  $('#hero-ao-vivo').innerHTML = situacoes().map(({ b, s }) =>
    `<li><img src="${b.foto}" alt=""><span><b>${esc(b.nome.split(' ')[0])}</b> · ${textoSituacao(s)}</span></li>`).join('');
}

function atualizarAberto() {
  const d = agora();
  const h = CONFIG.horarios[d.getDay()];
  const m = d.getHours() * 60 + d.getMinutes();
  const el = $('#aberto-agora');
  const aberto = h && m >= R.paraMin(h[0]) && m < R.paraMin(h[1]);
  el.classList.toggle('sim', !!aberto);
  if (aberto) {
    el.querySelector('span').textContent = `Aberto · fecha ${h[1]}`;
    return;
  }
  // próximo dia/horário de abertura
  for (let i = 0; i < 8; i++) {
    const dia = new Date(d);
    dia.setDate(d.getDate() + i);
    const hd = CONFIG.horarios[dia.getDay()];
    if (!hd || (i === 0 && m >= R.paraMin(hd[0]))) continue;
    const quando = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dia.getDay()];
    el.querySelector('span').textContent = `Fechado · abre ${quando} ${hd[0]}`;
    return;
  }
}

// ---------- serviços ----------

let catServico = 'todos';

function desenharServicos() {
  $('#filtro-servicos').innerHTML = CATEGORIAS_SERVICO.map((c) =>
    `<button type="button" class="chip" role="tab" aria-selected="${c.id === catServico}" data-cat="${c.id}">${c.nome}</button>`).join('');
  const lista = SERVICOS.filter((s) => catServico === 'todos' || s.cat === catServico);
  $('#lista-servicos').innerHTML = lista.map((s, i) => `
    <article class="servico ${s.especial ? 'especial' : ''} ${s.foto ? '' : 'servico-sem-foto'}" style="animation-delay:${i * 45}ms">
      ${s.especial ? '<span class="fita">Especial</span>' : ''}
      ${s.foto ? `<div class="servico-foto"><img src="${s.foto}" alt="${esc(s.nome)}" loading="lazy" width="640" height="400"></div>` : ''}
      <div class="servico-corpo">
        <h3>${esc(s.nome)}</h3>
        <p>${esc(s.desc)}</p>
        <span class="duracao">${icone('relogio')}${s.duracao} min</span>
        <div class="servico-rodape">
          <span class="preco"><small>R$</small>${s.preco / 100}</span>
          <button type="button" class="btn btn-linha" data-agendar="${s.id}">${icone('calendario')}Agendar</button>
        </div>
      </div>
    </article>`).join('');
}

// ---------- barbeiros ----------

function desenharBarbeiros() {
  const iso = R.dataISO(agora());
  const sit = situacoes();
  $('#lista-barbeiros').innerHTML = sit.map(({ b, s }) => {
    const prox = R.proximoLivre({ barbeiro: b, agendamentosDe: (d) => servidor.agendaDoDia(d), agora: agora(), config: CONFIG });
    let proxTexto = 'Sem horário nos próximos dias';
    if (prox) {
      const quando = prox.iso === iso ? 'hoje' : prox.iso === R.somarDias(iso, 1) ? 'amanhã' : R.deISO(prox.iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' });
      proxTexto = `Próximo horário: <b>${quando}, ${prox.hora}</b>`;
    }
    return `<article class="barbeiro">
      <img src="${b.foto}" alt="Foto de ${esc(b.nome)}" loading="lazy">
      <span class="status ${s.estado}"><i></i>${textoSituacao(s)}</span>
      <div class="barbeiro-info">
        <span class="apelido">${esc(b.apelido)}</span>
        <h3>${esc(b.nome)}</h3>
        <div class="tags">${b.especialidades.map((e) => `<span>${esc(e)}</span>`).join('')}</div>
        <div class="barbeiro-linha">
          <span class="nota">${icone('estrela')}${b.nota.toFixed(1).replace('.', ',')} <small>(${b.avaliacoes}) · desde ${b.desde}</small></span>
        </div>
        <p class="proximo">${proxTexto}</p>
        <button type="button" class="btn btn-ouro btn-pequeno" data-ver-agenda="${b.id}">${icone('calendario')}Ver agenda de ${esc(b.nome.split(' ')[0])}</button>
      </div>
    </article>`;
  }).join('');
}

// ---------- barra lateral e navegação ----------

function iniciarNavegacao() {
  const lateral = $('#lateral');
  const fundo = $('#lateral-fundo');
  const abrir = $('#abrir-menu');
  const fecharMenu = () => {
    lateral.classList.remove('aberta');
    fundo.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
  };
  abrir.addEventListener('click', () => {
    lateral.classList.add('aberta');
    fundo.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
  });
  fundo.addEventListener('click', fecharMenu);
  lateral.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) fecharMenu();
  });

  // botões que abrem coisas, em qualquer lugar da página
  document.addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-abrir], [data-ir], [data-agendar], [data-ver-agenda]');
    if (!alvo) return;
    if (alvo.dataset.ir) return rolarPara(alvo.dataset.ir);
    if (alvo.dataset.agendar) {
      escolherServico(alvo.dataset.agendar);
      return rolarPara('agenda');
    }
    if (alvo.dataset.verAgenda) {
      rolarPara('agenda');
      return setTimeout(() => escolherBarbeiro(alvo.dataset.verAgenda, { abrir: true }), 650);
    }
    const acoes = { conta: abrirMeusHorarios, pedidos: abrirMeusPedidos, carrinho: abrirCarrinho, zap: abrirZap };
    acoes[alvo.dataset.abrir]?.();
  });

  $('#filtro-servicos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    catServico = b.dataset.cat;
    desenharServicos();
  });

  // destaca na barra lateral a seção que está na tela
  const links = $$('[data-nav]');
  const obs = new IntersectionObserver((itens) => itens.forEach((i) => {
    if (i.isIntersecting) links.forEach((l) => l.classList.toggle('ativo', l.dataset.nav === i.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['inicio', 'cortes', 'barbeiros', 'agenda', 'loja'].forEach((id) => obs.observe(document.getElementById(id)));

  // títulos aparecem ao rolar
  const revelar = new IntersectionObserver((itens) => itens.forEach((i) => {
    if (i.isIntersecting) {
      i.target.classList.add('visivel');
      revelar.unobserve(i.target);
    }
  }), { threshold: 0.15 });
  // (a área do calendário fica de fora: transform no pai quebraria o position: fixed do modo foco)
  $$('.secao-topo, .hoje, .barbeiros').forEach((el) => {
    el.classList.add('revelar');
    revelar.observe(el);
  });
}

// ---------- rodapé ----------

function desenharRodape() {
  $('#endereco').textContent = CONFIG.endereco;
  const nomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const hoje = agora().getDay();
  $('#horarios-lista').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = CONFIG.horarios[d];
    return `<li class="${d === hoje ? 'hoje-dia' : ''}"><span>${nomes[d]}</span><span>${h ? `${h[0]} – ${h[1]}` : 'Fechado'}</span></li>`;
  }).join('');
  const nomesParceiros = [...PARCEIROS, ...PARCEIROS, ...PARCEIROS, ...PARCEIROS];
  $('#parceiros').innerHTML = nomesParceiros.map((p) => `<span>${esc(p)}</span>`).join('');
}

// ---------- patrocínio ----------

function abrirPatrocinio() {
  const m = modal.abrir(`
    <div class="patro-foto"><img src="${PATROCINIO.foto}" alt=""></div>
    <div class="patro-corpo">
      <span class="patro-tag">Patrocinado</span>
      <p class="patro-marca" id="modal-titulo">${esc(PATROCINIO.marca)}</p>
      <p class="patro-slogan">${esc(PATROCINIO.slogan)}</p>
      <p class="modal-sub" style="margin:0">${esc(PATROCINIO.texto)}</p>
      <div class="patro-cupom"><small>Cupom</small><b>${esc(PATROCINIO.cupom)}</b><button type="button" data-copiar>Copiar</button></div>
      <button type="button" class="btn btn-ouro btn-cheio" data-usar>${icone('presente')}Usar na loja</button>
      <div class="patro-tempo"><i></i></div>
      <button type="button" class="patro-nao" data-nao>Não mostrar de novo hoje</button>
    </div>`, { classe: 'patro' });

  const auto = setTimeout(() => m.isConnected && $('.patro-tempo', m) && modal.fechar(), 14000);
  m.addEventListener('mouseenter', () => $('.patro-tempo i', m)?.style.setProperty('animation-play-state', 'paused'));
  m.addEventListener('mouseleave', () => $('.patro-tempo i', m)?.style.setProperty('animation-play-state', 'running'));
  $('[data-copiar]', m).addEventListener('click', async (e) => {
    clearTimeout(auto);
    try {
      await navigator.clipboard.writeText(PATROCINIO.cupom);
      e.currentTarget.textContent = 'Copiado ✓';
    } catch {
      e.currentTarget.textContent = 'Anota aí';
    }
  });
  $('[data-usar]', m).addEventListener('click', () => {
    clearTimeout(auto);
    modal.fechar();
    aplicarCupom(PATROCINIO.cupom);
    rolarPara('loja');
  });
  $('[data-nao]', m).addEventListener('click', () => {
    clearTimeout(auto);
    gravarLocal('bd:patro-dia', R.dataISO(agora()));
    modal.fechar();
  });
}

function agendarPatrocinio() {
  if (lerLocal('bd:patro-dia') === R.dataISO(agora())) return;
  try {
    if (sessionStorage.getItem('bd:patro')) return;
  } catch { /* sem sessionStorage */ }
  const tentar = () => {
    // não atrapalha quem já está no meio de outra coisa
    if (modal.aberto() || !$('#carrinho').hidden || document.querySelector('.calendario.focado')) return setTimeout(tentar, 8000);
    try { sessionStorage.setItem('bd:patro', '1'); } catch { /* ok */ }
    abrirPatrocinio();
  };
  setTimeout(tentar, 9000);
}

// ---------- WhatsApp ----------

const zapLimite = new R.Limitador({ max: 3, janelaMs: 60000 });

function abrirZap() {
  const z = $('#zap');
  const j = $('#zap-janela');
  const abrir = j.hidden;
  j.hidden = !abrir;
  z.classList.toggle('zap-aberto', abrir);
  z.classList.add('ja-viu');
  $('#zap-botao').setAttribute('aria-expanded', String(abrir));
  if (abrir) {
    const primeira = $('.zap-msg time');
    if (primeira && !primeira.textContent) primeira.textContent = hora();
    setTimeout(() => $('#zap-texto').focus(), 50);
  }
}

const hora = () => agora().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function balao(texto, minha = false) {
  const c = $('#zap-conversa');
  const el = document.createElement('div');
  el.className = `zap-msg ${minha ? 'minha' : ''}`;
  el.textContent = texto;
  const t = document.createElement('time');
  t.textContent = hora() + (minha ? ' ✓✓' : '');
  el.append(t);
  c.append(el);
  c.scrollTop = c.scrollHeight;
}

function iniciarZap() {
  $('#zap-botao').addEventListener('click', abrirZap);
  $('#zap-fechar').addEventListener('click', abrirZap);
  const texto = $('#zap-texto');
  texto.addEventListener('input', () => {
    texto.style.height = 'auto';
    texto.style.height = `${Math.min(texto.scrollHeight, 110)}px`;
  });
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#zap-form').requestSubmit();
    }
  });
  $('#zap-atalhos').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    texto.value = b.textContent;
    texto.focus();
  });
  $('#zap-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = texto.value.trim();
    if (!msg) {
      texto.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 250 });
      return texto.focus();
    }
    if (!zapLimite.registrar('zap').ok) {
      return balao('Calma, campeão! Muitas mensagens seguidas. Espera um minutinho. ⏳');
    }
    balao(msg, true);
    texto.value = '';
    texto.style.height = '';
    $('#zap-atalhos').hidden = true;
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    setTimeout(() => balao('Abrimos o WhatsApp com a sua mensagem. É só apertar enviar lá que a gente responde. ✅'), 700);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#zap-janela').hidden && !modal.aberto()) abrirZap();
  });
}

// ---------- início ----------

function atualizarAoVivo() {
  desenharAoVivo();
  desenharBarbeiros();
  atualizarAberto();
}

iniciarModal();
iniciarHero();
desenharServicos();
iniciarConta();
iniciarAgenda();
iniciarLoja();
iniciarNavegacao();
desenharRodape();
iniciarZap();
atualizarAoVivo();
agendarPatrocinio();

ouvir('agenda', (e) => e.tipo !== 'estoque' && atualizarAoVivo());
setInterval(atualizarAoVivo, 30000);

// avisa se o navegador não deixa salvar (aba anônima em alguns navegadores)
try {
  localStorage.setItem('bd:teste', '1');
  localStorage.removeItem('bd:teste');
} catch {
  avisar({ texto: 'Seu navegador está bloqueando o armazenamento. A demo funciona, mas nada fica salvo.', tipo: 'erro', simbolo: 'fechar', tempo: 7000 });
}
