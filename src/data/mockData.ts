export interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  regime: 'CLT' | 'PJ';
  salario: number;
  valorHora?: number;
  gestorId: string;
}

export interface Gestor {
  id: string;
  nome: string;
}

export interface Evento {
  id: string;
  nome: string;
}

export interface Lancamento {
  id: string;
  colaboradorId: string;
  gestorId: string;
  eventoId: string;
  data: string;
  horas: number;
  periodo: 'Diurno' | 'Noturno' | 'Integral';
  feriado: boolean;
  valor: number;
}

export const gestores: Gestor[] = [
  { id: 'g1', nome: 'Ana Paula Ferreira' },
  { id: 'g2', nome: 'Carlos Mendes' },
  { id: 'g3', nome: 'Juliana Ramos' },
];

export const colaboradores: Colaborador[] = [
  { id: 'c1', nome: 'Bruno Souza', cargo: 'Analista', regime: 'CLT', salario: 4800, gestorId: 'g1' },
  { id: 'c2', nome: 'Fernanda Lima', cargo: 'Coordenadora', regime: 'CLT', salario: 6200, gestorId: 'g1' },
  { id: 'c3', nome: 'Tech Solutions Ltda', cargo: 'Consultor', regime: 'PJ', salario: 0, valorHora: 120, gestorId: 'g1' },
  { id: 'c4', nome: 'Rodrigo Alves', cargo: 'Assistente', regime: 'CLT', salario: 3500, gestorId: 'g2' },
  { id: 'c5', nome: 'Patrícia Costa', cargo: 'Supervisora', regime: 'CLT', salario: 5100, gestorId: 'g2' },
  { id: 'c6', nome: 'Marcos Digital ME', cargo: 'Dev Frontend', regime: 'PJ', salario: 0, valorHora: 150, gestorId: 'g3' },
  { id: 'c7', nome: 'Camila Andrade', cargo: 'UX Designer', regime: 'CLT', salario: 5800, gestorId: 'g3' },
  { id: 'c8', nome: 'Rafael Torres', cargo: 'Analista TI', regime: 'CLT', salario: 4400, gestorId: 'g3' },
];

export const eventos: Evento[] = [
  { id: 'e1', nome: 'Feira Nacional do Agronegócio 2025' },
  { id: 'e2', nome: 'Congresso de Tecnologia SP' },
  { id: 'e3', nome: 'Expo Saúde Rio 2025' },
  { id: 'e4', nome: 'Summit de Lideranças' },
];

function calcularValorHora(colab: Colaborador): number {
  if (colab.regime === 'PJ') return colab.valorHora || 0;
  return colab.salario / 220;
}

export function calcularValor(colab: Colaborador, horas: number, feriado: boolean): number {
  const valorHora = calcularValorHora(colab);
  const multiplicador = feriado ? 2 : 1.5;
  return valorHora * horas * multiplicador;
}

export function getValorHoraDisplay(colab: Colaborador): string {
  if (colab.regime === 'PJ') return `R$ ${colab.valorHora}/h`;
  return `R$ ${colab.salario.toLocaleString('pt-BR')}/mês`;
}

export const lancamentosMock: Lancamento[] = [
  { id: 'l1', colaboradorId: 'c1', gestorId: 'g1', eventoId: 'e1', data: '2025-06-02', horas: 8, periodo: 'Integral', feriado: false, valor: 0 },
  { id: 'l2', colaboradorId: 'c2', gestorId: 'g1', eventoId: 'e2', data: '2025-06-05', horas: 4, periodo: 'Diurno', feriado: false, valor: 0 },
  { id: 'l3', colaboradorId: 'c3', gestorId: 'g1', eventoId: 'e1', data: '2025-06-10', horas: 6, periodo: 'Diurno', feriado: true, valor: 0 },
  { id: 'l4', colaboradorId: 'c4', gestorId: 'g2', eventoId: 'e3', data: '2025-06-12', horas: 5, periodo: 'Noturno', feriado: false, valor: 0 },
  { id: 'l5', colaboradorId: 'c5', gestorId: 'g2', eventoId: 'e4', data: '2025-06-15', horas: 8, periodo: 'Integral', feriado: true, valor: 0 },
  { id: 'l6', colaboradorId: 'c6', gestorId: 'g3', eventoId: 'e2', data: '2025-06-18', horas: 10, periodo: 'Integral', feriado: false, valor: 0 },
  { id: 'l7', colaboradorId: 'c7', gestorId: 'g3', eventoId: 'e3', data: '2025-06-20', horas: 3, periodo: 'Diurno', feriado: false, valor: 0 },
  { id: 'l8', colaboradorId: 'c8', gestorId: 'g3', eventoId: 'e1', data: '2025-06-22', horas: 6, periodo: 'Noturno', feriado: false, valor: 0 },
];

// Pre-calculate values
lancamentosMock.forEach(l => {
  const colab = colaboradores.find(c => c.id === l.colaboradorId)!;
  l.valor = calcularValor(colab, l.horas, l.feriado);
});
