// "Backend" de demonstração. Roda dentro do navegador e guarda tudo no localStorage, mas foi
// escrito como se fosse uma API de verdade: cada método é assíncrono, tem latência de rede,
// valida tudo do lado de cá (nunca confia na tela) e devolve { ok, ... } ou { ok: false, erro }.
// Trocar por um servidor real seria reescrever só este arquivo.

import * as R from './regras.js';
import { BARBEIROS, CONFIG, NOMES, PRODUTOS, SERVICOS } from './dados.js';

const PREFIXO = 'bd:';
const DURACAO_SESSAO = 7 * 24 * 60 * 60 * 1000;
const TEMPO_MIN_FORMULARIO = 2500; // robô preenche formulário em milissegundos; gente não

const falha = (erro, codigo = 'invalido', extra = {}) => ({ ok: false, erro, codigo, ...extra });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const minutos = (ms) => Math.max(1, Math.ceil(ms / 60000));

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function aleatorio(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return hex(b);
}

/** PBKDF2 com sal aleatório: a senha nunca é salva, só o hash. */
export async function hashSenha(senha, sal, iteracoes = 120000) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: iteracoes },
    chave,
    256,
  );
  return hex(bits);
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export class ServidorDemo extends EventTarget {
  constructor({ armazenamento, agora = () => new Date(), latencia = [180, 520], canal = null, iteracoes } = {}) {
    super();
    this.db = armazenamento;
    this.agora = agora;
    this.latencia = latencia;
    this.canal = canal;
    this.iteracoes = iteracoes;
    const relogio = () => this.agora().getTime();
    const reg = (nome) => this._ler(`limites:${nome}`, {});
    this.limites = {
      login: new R.Limitador({ max: 5, janelaMs: 5 * 60000, agora: relogio, registros: reg('login') }),
      cadastro: new R.Limitador({ max: 3, janelaMs: 60 * 60000, agora: relogio, registros: reg('cadastro') }),
      agendar: new R.Limitador({ max: 4, janelaMs: 10 * 60000, agora: relogio, registros: reg('agendar') }),
      pedido: new R.Limitador({ max: 5, janelaMs: 60 * 60000, agora: relogio, registros: reg('pedido') }),
    };
  }

  // ---------- infraestrutura ----------

  _ler(chave, padrao) {
    try {
      const v = this.db.getItem(PREFIXO + chave);
      return v == null ? padrao : JSON.parse(v);
    } catch {
      return padrao;
    }
  }

  _gravar(chave, valor) {
    try {
      this.db.setItem(PREFIXO + chave, JSON.stringify(valor));
    } catch {
      /* armazenamento cheio ou bloqueado: a demo segue funcionando na memória da aba */
    }
  }

  _salvarLimites() {
    for (const [nome, l] of Object.entries(this.limites)) this._gravar(`limites:${nome}`, l.registros);
  }

  async _rede() {
    const [min, max] = this.latencia;
    if (max > 0) await esperar(min + Math.random() * (max - min));
  }

  _avisar(detalhe) {
    this.dispatchEvent(new CustomEvent('mudou', { detail: detalhe }));
    this.canal?.postMessage(detalhe);
  }

  _usuarioDaSessao(token) {
    if (!token) return null;
    const sessoes = this._ler('sessoes', {});
    const s = sessoes[token];
    if (!s || s.expira < this.agora().getTime()) return null;
    return this._ler('usuarios', []).find((u) => u.id === s.usuarioId) ?? null;
  }

  _antiRobo({ site, abertoEm }) {
    if (site) return falha('Não foi possível concluir. Tente de novo.', 'spam'); // campo-isca preenchido
    if (!abertoEm || this.agora().getTime() - abertoEm < TEMPO_MIN_FORMULARIO) {
      return falha('Calma aí, foi rápido demais. Confere os dados e tenta de novo.', 'rapido');
    }
    return null;
  }

  // ---------- contas ----------

  static publico(u) {
    return { id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, criadoEm: u.criadoEm };
  }

  async cadastrar({ nome, email, telefone, senha, site, abertoEm, dispositivo = 'local' }) {
    await this._rede();
    const robo = this._antiRobo({ site, abertoEm });
    if (robo) return robo;

    const erro = R.validarNome(nome) || R.validarEmail(email) || R.validarTelefone(telefone) || R.validarSenha(senha);
    if (erro) return falha(erro);

    const usuarios = this._ler('usuarios', []);
    const emailNorm = email.trim().toLowerCase();
    if (usuarios.some((u) => u.email === emailNorm)) return falha('Esse e-mail já tem conta. Entra com ele.', 'duplicado');

    const lim = this.limites.cadastro.registrar(dispositivo);
    this._salvarLimites();
    if (!lim.ok) return falha(`Muitos cadastros deste aparelho. Tente em ${minutos(lim.esperaMs)} min.`, 'limite');

    const sal = aleatorio(16);
    const u = {
      id: `u_${aleatorio(6)}`,
      nome: nome.trim().replace(/\s+/g, ' '),
      email: emailNorm,
      telefone: R.soDigitos(telefone),
      sal,
      hash: await hashSenha(senha, sal, this.iteracoes),
      criadoEm: this.agora().toISOString(),
    };
    usuarios.push(u);
    this._gravar('usuarios', usuarios);
    return { ok: true, ...this._abrirSessao(u) };
  }

  _abrirSessao(u) {
    const token = aleatorio(24);
    const sessoes = this._ler('sessoes', {});
    sessoes[token] = { usuarioId: u.id, expira: this.agora().getTime() + DURACAO_SESSAO };
    this._gravar('sessoes', sessoes);
    return { token, usuario: ServidorDemo.publico(u) };
  }

  async entrar({ email, senha, site }) {
    await this._rede();
    if (site) return falha('Não foi possível entrar.', 'spam');
    const emailNorm = String(email ?? '').trim().toLowerCase();
    const lim = this.limites.login.verificar(emailNorm);
    if (!lim.ok) {
      return falha(`Muitas tentativas. Espere ${minutos(lim.esperaMs)} min para tentar de novo.`, 'limite', {
        esperaMs: lim.esperaMs,
      });
    }
    const u = this._ler('usuarios', []).find((x) => x.email === emailNorm);
    const hash = await hashSenha(String(senha ?? ''), u?.sal ?? 'sal-falso', this.iteracoes);
    if (!u || !iguais(hash, u.hash)) {
      const r = this.limites.login.registrar(emailNorm);
      this._salvarLimites();
      const resto = r.ok ? r.restantes - 1 : 0;
      return falha(
        resto > 0 ? `E-mail ou senha incorretos. ${resto} tentativa${resto > 1 ? 's' : ''} restante${resto > 1 ? 's' : ''}.`
          : 'E-mail ou senha incorretos. Login bloqueado por 5 min.',
        'credenciais',
      );
    }
    this.limites.login.limpar(emailNorm);
    this._salvarLimites();
    return { ok: true, ...this._abrirSessao(u) };
  }

  async sair(token) {
    const sessoes = this._ler('sessoes', {});
    delete sessoes[token];
    this._gravar('sessoes', sessoes);
    return { ok: true };
  }

  eu(token) {
    const u = this._usuarioDaSessao(token);
    return u ? ServidorDemo.publico(u) : null;
  }

  // ---------- agenda ----------

  _salvos() {
    return this._ler('agendamentos', []);
  }

  /** Agendamentos de um dia: os de exemplo (gerados) + os feitos no site, menos os cancelados. */
  agendaDoDia(iso) {
    const salvos = this._salvos().filter((a) => a.data === iso && !a.cancelado);
    const exemplo = BARBEIROS.flatMap((b) => R.agendaDeExemplo(b, iso, CONFIG, NOMES));
    const livresExemplo = exemplo.filter(
      (e) => !salvos.some((s) => s.barbeiroId === e.barbeiroId && s.inicio === e.inicio),
    );
    return [...livresExemplo, ...salvos];
  }

  horarios({ barbeiroId, iso, servicoId }) {
    const barbeiro = BARBEIROS.find((b) => b.id === barbeiroId);
    const servico = SERVICOS.find((s) => s.id === servicoId) ?? { duracao: R.PASSO };
    if (!barbeiro) return [];
    return R.horariosDoDia({
      barbeiro, iso, duracao: servico.duracao, agendamentos: this.agendaDoDia(iso), agora: this.agora(), config: CONFIG,
    });
  }

  async agendar(token, { barbeiroId, iso, inicio, servicoId, obs = '', site, abertoEm }) {
    await this._rede();
    const u = this._usuarioDaSessao(token);
    if (!u) return falha('Entre na sua conta para agendar.', 'login');
    const robo = this._antiRobo({ site, abertoEm });
    if (robo) return robo;

    const barbeiro = BARBEIROS.find((b) => b.id === barbeiroId);
    const servico = SERVICOS.find((s) => s.id === servicoId);
    if (!barbeiro || !servico) return falha('Escolha barbeiro e serviço.');
    if (String(obs).length > 200) return falha('A observação pode ter até 200 caracteres.');
    if (R.pareceSpam(obs)) return falha('A observação parece spam. Tire links e textos promocionais.', 'spam');

    const hoje = R.dataISO(this.agora());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < hoje || iso > R.somarDias(hoje, CONFIG.diasAFrente)) {
      return falha('Data fora do período de agendamento.');
    }

    const meus = this._salvos().filter(
      (a) => a.usuarioId === u.id && !a.cancelado && `${a.data} ${a.inicio}` >= `${hoje} 00:00`,
    );
    if (meus.length >= CONFIG.maxAgendamentosAtivos) {
      return falha(`Você já tem ${CONFIG.maxAgendamentosAtivos} horários marcados. Cancele um para marcar outro.`, 'limite');
    }
    if (meus.some((a) => a.data === iso)) return falha('Você já tem um horário nesse dia.', 'limite');

    const h = this.horarios({ barbeiroId, iso, servicoId }).find((x) => x.hora === inicio);
    if (!h || h.estado !== 'livre') {
      return falha('Esse horário acabou de ser ocupado. Escolhe outro.', 'ocupado');
    }

    const lim = this.limites.agendar.registrar(u.id);
    this._salvarLimites();
    if (!lim.ok) return falha(`Muitas tentativas de agendamento. Tente em ${minutos(lim.esperaMs)} min.`, 'limite');

    const ag = {
      id: `ag_${aleatorio(5)}`,
      usuarioId: u.id,
      cliente: u.nome.split(' ')[0],
      barbeiroId,
      servicoId,
      data: iso,
      inicio,
      duracao: servico.duracao,
      preco: servico.preco,
      obs: String(obs).trim(),
      origem: 'site',
      criadoEm: this.agora().toISOString(),
    };
    const todos = this._salvos();
    todos.push(ag);
    this._gravar('agendamentos', this._podar(todos));
    this._avisar({ tipo: 'agendou', ag: { barbeiroId, data: iso, inicio, cliente: ag.cliente, meu: true } });
    return { ok: true, agendamento: ag };
  }

  async cancelar(token, id) {
    await this._rede();
    const u = this._usuarioDaSessao(token);
    if (!u) return falha('Entre na sua conta.', 'login');
    const todos = this._salvos();
    const ag = todos.find((a) => a.id === id && a.usuarioId === u.id);
    if (!ag || ag.cancelado) return falha('Agendamento não encontrado.');
    const quando = R.deISO(ag.data);
    quando.setMinutes(R.paraMin(ag.inicio));
    if (quando.getTime() - this.agora().getTime() < 60 * 60000) {
      return falha('Cancelamento só até 1 hora antes. Chama a gente no WhatsApp.', 'prazo');
    }
    ag.cancelado = true;
    this._gravar('agendamentos', todos);
    this._avisar({ tipo: 'cancelou', ag: { barbeiroId: ag.barbeiroId, data: ag.data, inicio: ag.inicio } });
    return { ok: true };
  }

  async meusAgendamentos(token) {
    await this._rede();
    const u = this._usuarioDaSessao(token);
    if (!u) return falha('Entre na sua conta.', 'login');
    const lista = this._salvos()
      .filter((a) => a.usuarioId === u.id)
      .sort((a, b) => `${b.data}${b.inicio}`.localeCompare(`${a.data}${a.inicio}`));
    return { ok: true, lista };
  }

  /** Remove agendamentos com mais de 30 dias para o armazenamento não crescer para sempre. */
  _podar(lista) {
    const corte = R.somarDias(R.dataISO(this.agora()), -30);
    return lista.filter((a) => a.data >= corte);
  }

  /**
   * Simula outro cliente marcando pelo site, para a agenda "ao vivo" ter movimento.
   * Escolhe um horário livre de hoje ou amanhã e reserva no nome de alguém fictício.
   */
  simularCliente(sortear = Math.random) {
    const hoje = R.dataISO(this.agora());
    for (const iso of [hoje, R.somarDias(hoje, 1), R.somarDias(hoje, 2), R.somarDias(hoje, 3)]) {
      // no máximo 4 clientes simulados por dia, para a agenda não lotar se a aba ficar aberta
      if (this._salvos().filter((a) => a.origem === 'simulado' && a.data === iso).length >= 4) continue;
      const opcoes = BARBEIROS.flatMap((b) =>
        this.horarios({ barbeiroId: b.id, iso, servicoId: 'social' })
          .filter((h) => h.estado === 'livre')
          .map((h) => ({ b, h })),
      );
      if (!opcoes.length) continue;
      const { b, h } = opcoes[Math.floor(sortear() * opcoes.length)];
      const ag = {
        id: `sim_${aleatorio(5)}`,
        cliente: NOMES[Math.floor(sortear() * NOMES.length)],
        barbeiroId: b.id,
        servicoId: 'social',
        data: iso,
        inicio: h.hora,
        duracao: R.PASSO,
        origem: 'simulado',
        criadoEm: this.agora().toISOString(),
      };
      const todos = this._salvos();
      todos.push(ag);
      this._gravar('agendamentos', this._podar(todos));
      this._avisar({ tipo: 'agendou', ag: { barbeiroId: b.id, data: iso, inicio: h.hora, cliente: ag.cliente } });
      return ag;
    }
    return null;
  }

  // ---------- loja ----------

  estoque(produtoId) {
    const vendidos = this._ler('vendidos', {});
    const p = PRODUTOS.find((x) => x.id === produtoId);
    return p ? Math.max(0, p.estoque - (vendidos[produtoId] ?? 0)) : 0;
  }

  async criarPedido(token, { itens, entrega, pagamento, cupom, obs = '' }) {
    await this._rede();
    const u = this._usuarioDaSessao(token);
    if (!u) return falha('Entre na sua conta para finalizar a compra.', 'login');

    if (!Array.isArray(itens) || !itens.length) return falha('Carrinho vazio.');
    for (const { id, qtd } of itens) {
      const p = PRODUTOS.find((x) => x.id === id);
      if (!p) return falha('Produto não encontrado.');
      if (!Number.isInteger(qtd) || qtd < 1 || qtd > 10) return falha('Quantidade inválida.');
      if (qtd > this.estoque(id)) return falha(`Só temos ${this.estoque(id)} un. de ${p.nome}.`, 'estoque');
    }

    if (!['retirada', 'entrega'].includes(entrega?.tipo)) return falha('Escolha retirada ou entrega.');
    if (entrega.tipo === 'entrega') {
      const e = entrega;
      const erro = R.validarCEP(e.cep) ||
        (!e.rua?.trim() && 'Preencha a rua.') ||
        (!String(e.numero ?? '').trim() && 'Preencha o número.') ||
        (!e.bairro?.trim() && 'Preencha o bairro.') ||
        (!e.cidade?.trim() && 'Preencha a cidade.');
      if (erro) return falha(erro);
    }
    if (!['pix', 'balcao'].includes(pagamento)) return falha('Escolha a forma de pagamento.');
    if (pagamento === 'balcao' && entrega.tipo !== 'retirada') return falha('Pagar no balcão só vale para retirada.');
    if (R.pareceSpam(obs)) return falha('A observação parece spam.', 'spam');
    if (cupom && !R.buscarCupom(cupom, CONFIG)) return falha('Cupom inválido.');

    const lim = this.limites.pedido.registrar(u.id);
    this._salvarLimites();
    if (!lim.ok) return falha(`Muitos pedidos seguidos. Tente em ${minutos(lim.esperaMs)} min.`, 'limite');

    const resumo = R.resumoCarrinho(itens, PRODUTOS, { entrega: entrega.tipo, cupom, config: CONFIG });
    const vendidos = this._ler('vendidos', {});
    for (const { id, qtd } of itens) vendidos[id] = (vendidos[id] ?? 0) + qtd;
    this._gravar('vendidos', vendidos);

    const pedidos = this._ler('pedidos', []);
    const pedido = {
      id: `BD-${1001 + pedidos.length}`,
      usuarioId: u.id,
      itens: resumo.linhas.map((l) => ({ id: l.id, nome: l.nome, qtd: l.qtd, preco: l.preco })),
      subtotal: resumo.subtotal,
      desconto: resumo.desconto,
      frete: resumo.frete,
      total: resumo.total,
      cupom: resumo.cupom?.codigo ?? null,
      entrega: entrega.tipo === 'entrega'
        ? { tipo: 'entrega', cep: R.mascaraCEP(entrega.cep), rua: entrega.rua.trim(), numero: String(entrega.numero).trim(),
            complemento: entrega.complemento?.trim() ?? '', bairro: entrega.bairro.trim(), cidade: entrega.cidade.trim(),
            uf: entrega.uf?.trim() ?? '' }
        : { tipo: 'retirada' },
      pagamento,
      status: pagamento === 'pix' ? 'Aguardando Pix' : 'Separando na barbearia',
      obs: String(obs).trim(),
      criadoEm: this.agora().toISOString(),
    };
    if (pagamento === 'pix') pedido.pix = `00020126BR.GOV.BCB.PIX.DEMO${pedido.id}${aleatorio(8).toUpperCase()}5204000053039865802BR`;
    pedidos.push(pedido);
    this._gravar('pedidos', pedidos);
    this._avisar({ tipo: 'estoque' });
    return { ok: true, pedido };
  }

  async meusPedidos(token) {
    await this._rede();
    const u = this._usuarioDaSessao(token);
    if (!u) return falha('Entre na sua conta.', 'login');
    return { ok: true, lista: this._ler('pedidos', []).filter((p) => p.usuarioId === u.id).reverse() };
  }
}

/** localStorage com plano B em memória (aba anônima, armazenamento bloqueado etc.). */
export function armazenamentoDoNavegador() {
  try {
    const t = '__bd_teste__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return memoria();
  }
}

export function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
