// Regras do negócio em funções puras: não mexem na tela nem no armazenamento.
// Por isso dá pra testar tudo com `node --test` (ver pasta tests/).

export const PASSO = 30; // a grade da agenda anda de 30 em 30 minutos

// ---------- horas e datas ----------

export const paraMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const paraHora = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Data local no formato AAAA-MM-DD (sem passar por UTC, senão o dia vira à noite). */
export function dataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function deISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function somarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return dataISO(d);
}

const minutosDoDia = (d) => d.getHours() * 60 + d.getMinutes();
const sobrepoe = (a, b, c, d) => a < d && c < b;

// ---------- expediente ----------

/** Horário de abertura e fechamento do barbeiro naquele dia, ou null se ele não trabalha. */
export function expediente(barbeiro, iso, config) {
  const dia = deISO(iso).getDay();
  const horario = config.horarios[dia];
  if (!horario || !barbeiro.dias.includes(dia)) return null;
  return { abre: paraMin(horario[0]), fecha: paraMin(horario[1]) };
}

function intervalosOcupados(agendamentos, barbeiroId, iso, config) {
  const lista = agendamentos
    .filter((a) => a.barbeiroId === barbeiroId && a.data === iso && !a.cancelado)
    .map((a) => [paraMin(a.inicio), paraMin(a.inicio) + a.duracao]);
  lista.push([paraMin(config.almoco[0]), paraMin(config.almoco[1])]);
  return lista;
}

/**
 * Monta a lista de horários de um dia. Cada horário sai com um estado:
 *  - livre:   dá pra marcar o serviço escolhido começando ali
 *  - curto:   o horário está vago, mas o serviço não cabe antes do próximo cliente/almoço/fechamento
 *  - ocupado: já tem cliente
 *  - passado: já passou (ou está em cima da hora)
 * Os horários do almoço não aparecem.
 */
export function horariosDoDia({ barbeiro, iso, duracao, agendamentos, agora, config }) {
  const exp = expediente(barbeiro, iso, config);
  if (!exp) return [];
  const ocupados = intervalosOcupados(agendamentos, barbeiro.id, iso, config);
  const [almIni, almFim] = [paraMin(config.almoco[0]), paraMin(config.almoco[1])];

  let limite = -1;
  if (agora) {
    const hoje = dataISO(agora);
    if (iso < hoje) limite = Infinity;
    else if (iso === hoje) limite = minutosDoDia(agora) + config.antecedenciaMin;
  }

  const lista = [];
  for (let t = exp.abre; t + PASSO <= exp.fecha; t += PASSO) {
    if (t >= almIni && t < almFim) continue;
    const fim = t + duracao;
    let estado = 'livre';
    if (t < limite) estado = 'passado';
    else if (ocupados.some(([a, b]) => sobrepoe(t, t + PASSO, a, b))) estado = 'ocupado';
    else if (fim > exp.fecha || ocupados.some(([a, b]) => sobrepoe(t, fim, a, b))) estado = 'curto';
    lista.push({ hora: paraHora(t), estado });
  }
  return lista;
}

/** Resumo de um dia para pintar o calendário: quantos horários de 30 min ainda estão livres. */
export function ocupacaoDoDia(params) {
  const lista = horariosDoDia({ ...params, duracao: PASSO });
  if (!lista.length) return { fechado: true, livres: 0, total: 0 };
  const futuros = lista.filter((h) => h.estado !== 'passado');
  return {
    fechado: false,
    livres: futuros.filter((h) => h.estado === 'livre').length,
    total: lista.length,
    encerrado: futuros.length === 0,
  };
}

/** O que o barbeiro está fazendo agora: atendendo, livre, almoço, fechado ou folga. */
export function situacaoAgora({ barbeiro, agendamentos, agora, config }) {
  const iso = dataISO(agora);
  const exp = expediente(barbeiro, iso, config);
  if (!exp) return { estado: 'folga' };
  const m = minutosDoDia(agora);
  if (m < exp.abre) return { estado: 'fechado', texto: `Abre às ${paraHora(exp.abre)}` };
  if (m >= exp.fecha) return { estado: 'fechado', texto: 'Já encerrou hoje' };
  if (m >= paraMin(config.almoco[0]) && m < paraMin(config.almoco[1])) {
    return { estado: 'almoco', ate: config.almoco[1] };
  }
  const atual = agendamentos.find(
    (a) => a.barbeiroId === barbeiro.id && a.data === iso && !a.cancelado &&
      paraMin(a.inicio) <= m && m < paraMin(a.inicio) + a.duracao,
  );
  if (atual) return { estado: 'atendendo', ate: paraHora(paraMin(atual.inicio) + atual.duracao) };
  return { estado: 'livre' };
}

/** Próximo horário livre (para um serviço de 30 min) a partir de agora, olhando até `dias` dias. */
export function proximoLivre({ barbeiro, agendamentosDe, agora, config, dias = 7 }) {
  const hoje = dataISO(agora);
  for (let i = 0; i < dias; i++) {
    const iso = somarDias(hoje, i);
    const h = horariosDoDia({ barbeiro, iso, duracao: PASSO, agendamentos: agendamentosDe(iso), agora, config })
      .find((x) => x.estado === 'livre');
    if (h) return { iso, hora: h.hora };
  }
  return null;
}

// ---------- agenda de exemplo ----------
// Para o site não abrir com a agenda vazia, cada barbeiro tem clientes "de mentira" gerados por
// um sorteio com semente fixa (barbeiro + dia). A mesma data gera sempre a mesma agenda, em qualquer
// aba ou computador, sem precisar salvar nada.

export function hashTexto(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function agendaDeExemplo(barbeiro, iso, config, nomes) {
  const exp = expediente(barbeiro, iso, config);
  if (!exp) return [];
  const sortear = sorteador(hashTexto(`${barbeiro.id}|${iso}`));
  const [almIni, almFim] = [paraMin(config.almoco[0]), paraMin(config.almoco[1])];
  const lista = [];
  let t = exp.abre;
  while (t + PASSO <= exp.fecha) {
    if (t >= almIni && t < almFim) { t = almFim; continue; }
    if (sortear() < barbeiro.procura) {
      let dur = sortear() < 0.35 ? 60 : 30;
      if (t + dur > exp.fecha || sobrepoe(t, t + dur, almIni, almFim)) dur = PASSO;
      lista.push({
        id: `ex-${barbeiro.id}-${iso}-${t}`,
        barbeiroId: barbeiro.id,
        data: iso,
        inicio: paraHora(t),
        duracao: dur,
        cliente: nomes[Math.floor(sortear() * nomes.length)],
        origem: 'exemplo',
      });
      t += dur;
    } else {
      t += PASSO;
    }
  }
  return lista;
}

// ---------- validação de formulários ----------

export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

export function validarNome(nome) {
  const n = String(nome ?? '').trim();
  if (n.length < 3) return 'Digite seu nome completo.';
  if (n.length > 60) return 'Nome muito longo.';
  if (!/^[\p{L}][\p{L} '.-]+$/u.test(n)) return 'Use só letras no nome.';
  return null;
}

export function validarEmail(email) {
  const e = String(email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120) return 'E-mail inválido.';
  return null;
}

export function validarTelefone(tel) {
  const d = soDigitos(tel);
  if (d.length < 10 || d.length > 11) return 'Telefone com DDD, só números.';
  return null;
}

/** 0 a 4: usado na barrinha de força da senha. */
export function forcaSenha(senha) {
  const s = String(senha ?? '');
  let pontos = 0;
  if (s.length >= 8) pontos++;
  if (s.length >= 12) pontos++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
  if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) pontos++;
  return pontos;
}

export function validarSenha(senha) {
  const s = String(senha ?? '');
  if (s.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Misture letras e números na senha.';
  return null;
}

export function validarCEP(cep) {
  return soDigitos(cep).length === 8 ? null : 'CEP precisa ter 8 números.';
}

export const mascaraTelefone = (v) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const mascaraCEP = (v) => {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// ---------- anti-spam ----------

/**
 * Limite de tentativas por janela de tempo (ex.: 5 logins a cada 5 minutos).
 * Os registros ficam num objeto simples para o servidor poder salvar e recarregar.
 */
export class Limitador {
  constructor({ max, janelaMs, agora = () => Date.now(), registros = {} }) {
    this.max = max;
    this.janelaMs = janelaMs;
    this.agora = agora;
    this.registros = registros;
  }

  _recentes(chave) {
    const limite = this.agora() - this.janelaMs;
    const lista = (this.registros[chave] ?? []).filter((t) => t > limite);
    this.registros[chave] = lista;
    return lista;
  }

  /** Só consulta, sem gastar tentativa. */
  verificar(chave) {
    const lista = this._recentes(chave);
    if (lista.length < this.max) return { ok: true, restantes: this.max - lista.length };
    return { ok: false, esperaMs: lista[0] + this.janelaMs - this.agora() };
  }

  /** Consulta e, se estiver liberado, já conta a tentativa. */
  registrar(chave) {
    const r = this.verificar(chave);
    if (r.ok) this.registros[chave].push(this.agora());
    return r;
  }

  limpar(chave) {
    delete this.registros[chave];
  }
}

const PALAVRAS_SPAM = ['bitcoin', 'cassino', 'casino', 'bet', 'empréstimo', 'renda extra', 'clique aqui', 'ganhe dinheiro'];

/** Filtro simples para os campos de texto livre (observação do agendamento e do pedido). */
export function pareceSpam(texto) {
  const t = String(texto ?? '').toLowerCase();
  if (!t.trim()) return false;
  if ((t.match(/https?:\/\/|www\./g) ?? []).length >= 1) return true;
  if (/(.)\1{7,}/.test(t)) return true;
  if (PALAVRAS_SPAM.some((p) => new RegExp(`(^|\\W)${p}(\\W|$)`).test(t))) return true;
  const letras = String(texto).replace(/[^A-Za-zÀ-ú]/g, '');
  if (letras.length > 20 && letras === letras.toUpperCase()) return true;
  return false;
}

// ---------- loja ----------

/** Dinheiro sempre em centavos (inteiro) para não ter erro de arredondamento com float. */
export const formatarReais = (centavos) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function buscarCupom(codigo, config) {
  const c = config.cupons[String(codigo ?? '').trim().toUpperCase()];
  return c ? { codigo: String(codigo).trim().toUpperCase(), ...c } : null;
}

export function resumoCarrinho(itens, produtos, { entrega = 'retirada', cupom = null, config }) {
  const linhas = itens
    .map(({ id, qtd }) => {
      const p = produtos.find((x) => x.id === id);
      return p ? { ...p, qtd, total: p.preco * qtd } : null;
    })
    .filter(Boolean);
  const subtotal = linhas.reduce((s, l) => s + l.total, 0);
  const c = cupom ? buscarCupom(cupom, config) : null;
  const desconto = c ? Math.round((subtotal * c.porcento) / 100) : 0;
  const base = subtotal - desconto;
  const frete = entrega === 'entrega' && subtotal > 0 && base < config.freteGratisAcima ? config.frete : 0;
  return {
    linhas,
    qtdItens: linhas.reduce((s, l) => s + l.qtd, 0),
    subtotal,
    desconto,
    cupom: c,
    frete,
    total: base + frete,
    faltaFreteGratis: entrega === 'entrega' ? Math.max(0, config.freteGratisAcima - base) : 0,
  };
}
