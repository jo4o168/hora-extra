export type Regime = "CLT" | "PJ";

export type Periodo = "Diurno" | "Noturno" | "Integral";

export interface Gestor {
  id: string;
  nome: string;
}

export interface Evento {
  id: string;
  nome: string;
}

export interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  regime: Regime;
  salario: number;
  valorHora?: number;
  gestorId: string;
}

export interface Lancamento {
  id: string;
  colaboradorId: string;
  gestorId: string;
  eventoId: string;
  data: string;
  horas: number;
  periodo: Periodo;
  feriado: boolean;
  valor: number;
}
