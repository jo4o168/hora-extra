import {
  colaboradores,
  eventos,
  gestores,
  lancamentosMock,
  calcularValor,
  type Lancamento,
} from "@/data/mockData";
import { loadCadastroFromSheets, isCadastroSheetsConfigured } from "./cadastro-from-sheets";
import { loadLancamentosFromSheets, isLancamentosReadConfigured } from "./lancamentos-from-sheets";
import { getSheetsClient } from "./spreadsheet";
import type { CadastroResponse, LancamentoRow, NovoLancamentoInput } from "./types";

export type { CadastroResponse, LancamentoRow, NovoLancamentoInput } from "./types";

function lancamentosSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEETS_LANCAMENTOS_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    ""
  );
}

function lancamentosAppendRange(): string {
  return (
    process.env.GOOGLE_SHEETS_LANCAMENTOS_APPEND_RANGE ||
    process.env.GOOGLE_SHEETS_LANCAMENTOS_RANGE ||
    ""
  );
}

export function isSheetsWriteConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      lancamentosSpreadsheetId() &&
      lancamentosAppendRange(),
  );
}

export async function getCadastroData(): Promise<CadastroResponse> {
  if (isCadastroSheetsConfigured()) {
    try {
      const data = await loadCadastroFromSheets();
      if (data.gestores.length && data.colaboradores.length && data.eventos.length) {
        return { ...data, source: "sheets" };
      }
      console.warn(
        "[sheets] Cadastro retornou vazio; confira cabeçalhos e intervalos. Usando mock.",
      );
    } catch (e) {
      console.error("[sheets] Erro ao ler cadastro:", e);
    }
  }

  return {
    gestores,
    colaboradores,
    eventos,
    source: "mock",
  };
}

function enrichLancamentos(list: Lancamento[]): LancamentoRow[] {
  return list.map((l) => {
    const colab = colaboradores.find((c) => c.id === l.colaboradorId)!;
    const g = gestores.find((x) => x.id === l.gestorId)!;
    const ev = eventos.find((x) => x.id === l.eventoId)!;
    return {
      ...l,
      valor: calcularValor(colab, l.horas, l.feriado),
      gestorNome: g.nome,
      colaboradorNome: colab.nome,
      eventoNome: ev.nome,
      regime: colab.regime,
    };
  });
}

export async function getLancamentosData(): Promise<{
  lancamentos: LancamentoRow[];
  source: "mock" | "sheets";
}> {
  if (isLancamentosReadConfigured()) {
    try {
      const list = await loadLancamentosFromSheets();
      if (list.length) {
        return { lancamentos: list, source: "sheets" };
      }
    } catch (e) {
      console.error("[sheets] Erro ao ler lançamentos:", e);
    }
  }

  return {
    lancamentos: enrichLancamentos(lancamentosMock),
    source: "mock",
  };
}

async function resolveLaunchEntities(input: NovoLancamentoInput) {
  if (isCadastroSheetsConfigured()) {
    const d = await loadCadastroFromSheets();
    return {
      g: d.gestores.find((x) => x.id === input.gestorId),
      colab: d.colaboradores.find((c) => c.id === input.colaboradorId),
      ev: d.eventos.find((e) => e.id === input.eventoId),
    };
  }
  return {
    g: gestores.find((x) => x.id === input.gestorId),
    colab: colaboradores.find((c) => c.id === input.colaboradorId),
    ev: eventos.find((e) => e.id === input.eventoId),
  };
}

export async function appendLancamento(input: NovoLancamentoInput): Promise<{ ok: boolean; mode: "sheet" | "mock" }> {
  const { g, colab, ev } = await resolveLaunchEntities(input);
  if (!g || !colab || !ev) {
    throw new Error("Dados inválidos");
  }

  if (!isSheetsWriteConfigured()) {
    return { ok: true, mode: "mock" };
  }

  const sheets = getSheetsClient();
  const spreadsheetId = lancamentosSpreadsheetId();
  const range = lancamentosAppendRange();
  if (!sheets || !spreadsheetId || !range) {
    return { ok: true, mode: "mock" };
  }

  const row = [
    g.nome,
    colab.nome,
    colab.regime,
    ev.nome,
    input.data,
    input.horaInicio,
    input.horaFim,
    String(input.horas),
    input.periodo,
    input.feriado ? "Sim" : "Não",
    input.registradoPorEmail ?? "",
    new Date().toISOString(),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  return { ok: true, mode: "sheet" };
}
