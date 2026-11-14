// Estado compartilhado entre as partes do site: o "servidor", a sessão do usuário e um canal de eventos.

import { ServidorDemo, armazenamentoDoNavegador } from './servidor.js';
import { lerLocal, gravarLocal } from './ui.js';

// Com o BroadcastChannel, um agendamento feito numa aba aparece na hora nas outras abas abertas.
const canal = 'BroadcastChannel' in globalThis ? new BroadcastChannel('barbearia-dias') : null;

export const servidor = new ServidorDemo({ armazenamento: armazenamentoDoNavegador(), canal });

export const sessao = {
  token: lerLocal('bd:token'),
  usuario: null,
};
sessao.usuario = servidor.eu(sessao.token);
if (!sessao.usuario) sessao.token = null;

/** Avisos internos: 'sessao' (entrou/saiu), 'agenda' (mudou horário), 'carrinho'. */
export const bus = new EventTarget();
export const emitir = (nome, detalhe) => bus.dispatchEvent(new CustomEvent(nome, { detail: detalhe }));
export const ouvir = (nome, fn) => bus.addEventListener(nome, (e) => fn(e.detail));

export function entrou({ token, usuario }) {
  sessao.token = token;
  sessao.usuario = usuario;
  gravarLocal('bd:token', token);
  emitir('sessao', usuario);
}

export async function saiu() {
  await servidor.sair(sessao.token);
  sessao.token = null;
  sessao.usuario = null;
  gravarLocal('bd:token', null);
  emitir('sessao', null);
}

servidor.addEventListener('mudou', (e) => emitir('agenda', { ...e.detail, local: true }));
canal?.addEventListener('message', (e) => emitir('agenda', { ...e.data, local: false }));

// login/logout feito em outra aba
window.addEventListener('storage', (e) => {
  if (e.key !== 'bd:token') return;
  const token = lerLocal('bd:token');
  sessao.token = token;
  sessao.usuario = servidor.eu(token);
  emitir('sessao', sessao.usuario);
});
