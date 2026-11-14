// Tudo que é "conteúdo" da barbearia fica aqui: horários, barbeiros, serviços, produtos e patrocínio.
// Preços em centavos.

const foto = (id, w = 640, h = 640) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

export const CONFIG = {
  nome: 'Barbearia Dias',
  whatsapp: '5511900000000', // troque pelo número real (DDI + DDD + número)
  endereco: 'Rua Imaginária, 22 · Centro · Joinville/SC',
  instagram: 'barbeariadias',
  // 0 = domingo ... 6 = sábado
  horarios: {
    0: null,
    1: ['09:00', '20:00'],
    2: ['09:00', '20:00'],
    3: ['09:00', '20:00'],
    4: ['09:00', '20:00'],
    5: ['09:00', '21:00'],
    6: ['08:00', '18:00'],
  },
  almoco: ['12:00', '13:00'],
  antecedenciaMin: 30, // não dá pra marcar em cima da hora
  diasAFrente: 45,
  maxAgendamentosAtivos: 3,
  frete: 1490,
  freteGratisAcima: 15000,
  cupons: {
    NAVALHA10: { porcento: 10, origem: 'Navalha de Ouro' },
    PRIMEIRACADEIRA: { porcento: 15, origem: 'Barbearia Dias' },
  },
};

export const FOTOS = {
  fundo: foto('1585747860715-2ba37e788b70', 1920, 1280),
  fundo2: foto('1592647420148-bfcc177e2117', 1920, 1280),
  ferramentas: foto('1621605815971-fbc98d665033', 1200, 800),
};

export const BARBEIROS = [
  {
    id: 'eduardo',
    nome: 'Eduardo Dias',
    apelido: 'O dono da navalha',
    foto: foto('1553521041-d168abd31de3', 600, 760),
    desde: 2014,
    nota: 4.9,
    avaliacoes: 812,
    especialidades: ['Degradê', 'Navalhado', 'Barba terapia'],
    dias: [2, 3, 4, 5, 6],
    procura: 0.55,
    cor: '#d4a24c',
  },
  {
    id: 'eduarda',
    nome: 'Eduarda Dias',
    apelido: 'A rainha do freestyle',
    foto: foto('1659355751333-cf3aa64ec7cb', 600, 760),
    desde: 2017,
    nota: 5.0,
    avaliacoes: 634,
    especialidades: ['Desenhos', 'Platinado', 'Pigmentação'],
    dias: [1, 2, 3, 4, 5],
    procura: 0.5,
    cor: '#c0392b',
  },
  {
    id: 'eduarde',
    nome: 'Eduarde Dies',
    apelido: 'O primo que veio do interior',
    foto: foto('1793517953320-d9339a7cdd56', 600, 760),
    desde: 2021,
    nota: 4.8,
    avaliacoes: 287,
    especialidades: ['Corte social', 'Infantil', 'Pezinho'],
    dias: [1, 3, 4, 5, 6],
    procura: 0.42,
    cor: '#8fa8a3',
  },
];

export const CATEGORIAS_SERVICO = [
  { id: 'todos', nome: 'Todos' },
  { id: 'cortes', nome: 'Cortes' },
  { id: 'barba', nome: 'Barba' },
  { id: 'especiais', nome: 'Especiais' },
  { id: 'combos', nome: 'Combos' },
];

export const SERVICOS = [
  { id: 'social', cat: 'cortes', nome: 'Corte Social', duracao: 30, preco: 4500,
    desc: 'Tesoura e máquina, acabamento no pezinho. O clássico que nunca erra.' },
  { id: 'degrade', cat: 'cortes', nome: 'Degradê', duracao: 30, preco: 5000,
    desc: 'Fade baixo, médio ou alto, com transição lisa até a pele.',
    foto: foto('1630827020718-3433092696e7') },
  { id: 'navalhado', cat: 'cortes', nome: 'Degradê Navalhado', duracao: 60, preco: 6500,
    desc: 'Fade zerado na navalha, com toalha quente e loção pós.',
    foto: foto('1599351431202-1e0f0137899a') },
  { id: 'tesoura', cat: 'cortes', nome: 'Corte na Tesoura', duracao: 60, preco: 6000,
    desc: 'Só tesoura, para quem tem cabelo mais longo e quer volume no lugar certo.' },
  { id: 'infantil', cat: 'cortes', nome: 'Corte Infantil', duracao: 30, preco: 4000,
    desc: 'Até 12 anos, com paciência de sobra e pirulito no final.' },
  { id: 'barba', cat: 'barba', nome: 'Barba Completa', duracao: 30, preco: 4000,
    desc: 'Desenho, máquina, navalha no contorno e balm.',
    foto: foto('1599011176306-4a96f1516d4d') },
  { id: 'terapia', cat: 'barba', nome: 'Barba Terapia', duracao: 60, preco: 6000,
    desc: 'Toalha quente, esfoliação, óleo de cedro e massagem facial.',
    foto: foto('1532710093739-9470acff878f') },
  { id: 'pezinho', cat: 'barba', nome: 'Pezinho & Sobrancelha', duracao: 30, preco: 2000,
    desc: 'Manutenção rápida entre um corte e outro.' },
  { id: 'freestyle', cat: 'especiais', nome: 'Freestyle / Desenho', duracao: 60, preco: 8000, especial: true,
    desc: 'Riscos, listras e desenhos à mão livre. Traz a referência que a gente executa.',
    foto: foto('1568339434343-2a640a1a9946') },
  { id: 'platinado', cat: 'especiais', nome: 'Platinado Nevou', duracao: 120, preco: 18000, especial: true,
    desc: 'Descoloração completa com matização. Inclui corte e hidratação.',
    foto: foto('1768742466927-42153b867e8b') },
  { id: 'luzes', cat: 'especiais', nome: 'Luzes Masculinas', duracao: 90, preco: 14000, especial: true,
    desc: 'Mechas finas e naturais, sem cara de salão.' },
  { id: 'pigmentacao', cat: 'especiais', nome: 'Pigmentação de Barba', duracao: 30, preco: 3500, especial: true,
    desc: 'Preenche as falhas e deixa o contorno marcado por dias.' },
  { id: 'patrao', cat: 'especiais', nome: 'Corte do Patrão', duracao: 90, preco: 12000, especial: true,
    desc: 'Corte, barba terapia, sobrancelha e uma dose de whisky (ou café) por conta da casa.',
    foto: foto('1605497787865-e6d4762b386f') },
  { id: 'combo', cat: 'combos', nome: 'Corte + Barba', duracao: 60, preco: 8000,
    desc: 'O combo mais pedido da casa. Sai novo.',
    foto: foto('1593702275687-f8b402bf1fb5') },
  { id: 'paifilho', cat: 'combos', nome: 'Pai & Filho', duracao: 60, preco: 7500,
    desc: 'Dois cortes na sequência, mesmo barbeiro, preço camarada.' },
];

export const CATEGORIAS_PRODUTO = [
  { id: 'todos', nome: 'Tudo' },
  { id: 'pomadas', nome: 'Pomadas' },
  { id: 'fixacao', nome: 'Gel & Fixação' },
  { id: 'barba', nome: 'Barba' },
  { id: 'ferramentas', nome: 'Navalhas & Ferramentas' },
  { id: 'kits', nome: 'Kits' },
];

export const PRODUTOS = [
  { id: 'pomada-matte', cat: 'pomadas', nome: 'Pomada Matte', marca: 'Dias Original', preco: 3990, estoque: 24,
    detalhe: 'Fixação média, efeito seco · 120 g', nota: 4.9, foto: foto('1587909209111-5097ee578ec3') },
  { id: 'pomada-brilho', cat: 'pomadas', nome: 'Pomada Brilho Clássico', marca: 'Dias Original', preco: 3490, estoque: 18,
    detalhe: 'Base d’água, sai no banho · 120 g', nota: 4.7, foto: foto('1775126251039-214af64257ff') },
  { id: 'clay', cat: 'pomadas', nome: 'Clay Efeito Seco', marca: 'Mão de Ferro', preco: 4490, estoque: 9,
    detalhe: 'Argila, fixação forte · 100 g', nota: 4.8, novo: true, foto: foto('1775127741095-86ee33b6b385') },
  { id: 'cera', cat: 'pomadas', nome: 'Cera Modeladora', marca: 'Mão de Ferro', preco: 3290, estoque: 30,
    detalhe: 'Remodela durante o dia · 90 g', nota: 4.6, foto: foto('1775127741393-2b571811bb01') },
  { id: 'gel', cat: 'fixacao', nome: 'Gel Fixação Extrema', marca: 'Dias Original', preco: 2490, estoque: 40,
    detalhe: 'Molhado ou seco, segura o dia todo · 250 g', nota: 4.5, foto: foto('1602023427299-a44c1cfb4854') },
  { id: 'spray', cat: 'fixacao', nome: 'Spray Fixador', marca: 'Barber Club', preco: 2990, estoque: 15,
    detalhe: 'Finalizador sem resíduo · 200 ml', nota: 4.4, foto: foto('1632243575963-3143700087ed') },
  { id: 'oleo-cedro', cat: 'barba', nome: 'Óleo de Barba Cedro', marca: 'Dias Original', preco: 4290, estoque: 20,
    detalhe: 'Amacia e perfuma · 30 ml', nota: 5.0, foto: foto('1673350963997-fc802e774580') },
  { id: 'oleo-ambar', cat: 'barba', nome: 'Óleo de Barba Âmbar', marca: 'Dias Original', preco: 4290, estoque: 6,
    detalhe: 'Notas amadeiradas · 30 ml', nota: 4.9, foto: foto('1673350963924-cb4267d9b6eb') },
  { id: 'balm', cat: 'barba', nome: 'Balm para Barba', marca: 'Mão de Ferro', preco: 3690, estoque: 14,
    detalhe: 'Hidrata e alinha os fios · 60 g', nota: 4.7, foto: foto('1672763057302-6090a32d5d36') },
  { id: 'shampoo-barba', cat: 'barba', nome: 'Shampoo de Barba', marca: 'Barber Club', preco: 3190, estoque: 22,
    detalhe: 'Limpeza sem ressecar · 140 ml', nota: 4.6, foto: foto('1775126454589-53b494ca57ac') },
  { id: 'creme', cat: 'barba', nome: 'Creme de Barbear', marca: 'Barber Club', preco: 3290, estoque: 17,
    detalhe: 'Espuma densa para navalha · 150 g', nota: 4.7, foto: foto('1765501830223-01b4c5f78a8e') },
  { id: 'pos-barba', cat: 'barba', nome: 'Loção Pós-Barba', marca: 'Navalha de Ouro', preco: 4690, estoque: 11,
    detalhe: 'Refresca e acalma a pele · 100 ml', nota: 4.8, foto: foto('1553265393-2055017658a2') },
  { id: 'navalha', cat: 'ferramentas', nome: 'Navalha Clássica Inox', marca: 'Navalha de Ouro', preco: 8990, estoque: 8,
    detalhe: 'Cabo de madeira, troca de lâmina', nota: 4.9, foto: foto('1630869790000-eb8e80451393') },
  { id: 'pincel', cat: 'ferramentas', nome: 'Pincel de Barbear', marca: 'Navalha de Ouro', preco: 5490, estoque: 12,
    detalhe: 'Cerdas macias, base de madeira', nota: 4.6, foto: foto('1575671111765-c35d4999bb68') },
  { id: 'pente-madeira', cat: 'ferramentas', nome: 'Pente de Madeira', marca: 'Dias Original', preco: 2490, estoque: 35,
    detalhe: 'Dentes largos e finos, antiestático', nota: 4.8, foto: foto('1680670500665-22e480bcb0fa') },
  { id: 'pente-carbono', cat: 'ferramentas', nome: 'Pente de Carbono', marca: 'Barber Club', preco: 1990, estoque: 50,
    detalhe: 'O mesmo que a gente usa na cadeira', nota: 4.5, foto: foto('1655210909079-633c5de482ca') },
  { id: 'tesoura', cat: 'ferramentas', nome: 'Tesoura Profissional 6"', marca: 'Navalha de Ouro', preco: 15990, estoque: 4,
    detalhe: 'Aço japonês, fio navalha', nota: 4.9, foto: foto('1642669182728-924fb10a2302') },
  { id: 'kit-barba', cat: 'kits', nome: 'Kit Barba de Respeito', marca: 'Dias Original', preco: 14990, de: 17990, estoque: 7,
    detalhe: 'Óleo + balm + shampoo + pente', nota: 5.0, foto: foto('1627875777314-da35433c0c8e') },
  { id: 'kit-navalha', cat: 'kits', nome: 'Kit Navalha & Pincel', marca: 'Navalha de Ouro', preco: 12990, de: 14480, estoque: 5,
    detalhe: 'Navalha, pincel e creme de barbear', nota: 4.9, foto: foto('1524230616393-d6229fcd2eff') },
];

export const PATROCINIO = {
  marca: 'Navalha de Ouro',
  slogan: 'Lâminas profissionais desde 1987',
  texto: 'Patrocinadora oficial da Barbearia Dias. Use o cupom abaixo e leve 10% de desconto em toda a loja.',
  cupom: 'NAVALHA10',
  foto: foto('1630869790000-eb8e80451393', 800, 800),
};

export const PARCEIROS = ['Navalha de Ouro', 'Mão de Ferro', 'Barber Club', 'Cervejaria Topete', 'Academia Ferro Velho'];

// nomes usados na agenda de exemplo e nos clientes simulados
export const NOMES = [
  'Rafael', 'Lucas', 'Matheus', 'Gabriel', 'João Pedro', 'Bruno', 'Thiago', 'Caio', 'Felipe', 'Diego',
  'Vinícius', 'Gustavo', 'André', 'Rodrigo', 'Marcos', 'Igor', 'Leandro', 'Murilo', 'Otávio', 'Renan',
  'Samuel', 'Henrique', 'Kauã', 'Davi', 'Pedro', 'Arthur', 'Enzo', 'Wesley', 'Jonas', 'Fábio',
];
