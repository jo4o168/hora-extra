import type { Colaborador, Lancamento } from "@/data/mockData";

export type LancamentoRow = Lancamento & {
  gestorNome: string;
  colaboradorNome: string;
  eventoNome: string;
  regime: Colaborador["regime"];
};

export type CadastroResponse = {
  gestores: { id: string; nome: string }[];
  colaboradores: Colaborador[];
  eventos: { id: string; nome: string }[];
  source: "mock" | "sheets";
};

export type NovoLancamentoInput = {
  gestorId: string;
  colaboradorId: string;
  eventoId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  horas: number;
  periodo: string;
  feriado: boolean;
  registradoPorEmail?: string | null;
};
