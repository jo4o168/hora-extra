import type { Colaborador, Lancamento } from "@/lib/domain/types";

export type LancamentoRow = Lancamento & {
  gestorNome: string;
  colaboradorNome: string;
  eventoNome: string;
  regime: Colaborador["regime"];
  horaInicio: string;
  horaFim: string;
  valorHora: number;
  jaFoiPago: boolean;
  sheetRowNumber: number;
};

export type CadastroResponse = {
  gestores: { id: string; nome: string }[];
  colaboradores: Colaborador[];
  eventos: { id: string; nome: string }[];
  source: "sheets";
};

export type NovoLancamentoInput = {
  gestorId: string;
  colaboradorId: string;
  eventoId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  horas: number;
  periodo?: string;
  feriado: boolean;
  registradoPorEmail?: string | null;
};
