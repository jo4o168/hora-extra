import { loadCadastroFromSheets, isCadastroSheetsConfigured } from "./cadastro-from-sheets";
import { loadLancamentosFromSheets, isLancamentosReadConfigured } from "./lancamentos-from-sheets";
import { getSheetsClient, normalizeA1Range } from "./spreadsheet";
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

function parseAppendRange(range: string): { sheetName: string; startCol: string; startRow: number; endCol: string } {
  const normalized = normalizeA1Range(range);
  const match = normalized.match(/^(?:'([^']+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)$/i);
  if (!match) {
    throw new Error(
      `Intervalo de append inválido: "${range}". Use formato como 'Horas Extras'!A3:P`,
    );
  }
  return {
    sheetName: (match[1] || match[2] || "").trim(),
    startCol: match[3].toUpperCase(),
    startRow: Number(match[4]),
    endCol: match[5].toUpperCase(),
  };
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
  if (!isCadastroSheetsConfigured()) {
    throw new Error("Google Sheets de cadastro não está configurado no ambiente.");
  }
  const data = await loadCadastroFromSheets();
  if (!data.gestores.length || !data.colaboradores.length || !data.eventos.length) {
    throw new Error("Cadastro no Google Sheets está vazio. Verifique os intervalos e cabeçalhos.");
  }
  return { ...data, source: "sheets" };
}

export async function getLancamentosData(): Promise<{
  lancamentos: LancamentoRow[];
  source: "sheets";
}> {
  if (!isLancamentosReadConfigured()) {
    throw new Error("Google Sheets de lançamentos não está configurado no ambiente.");
  }
  const list = await loadLancamentosFromSheets();
  return { lancamentos: list, source: "sheets" };
}

async function resolveLaunchEntities(input: NovoLancamentoInput) {
  if (!isCadastroSheetsConfigured()) {
    throw new Error("Google Sheets de cadastro não está configurado no ambiente.");
  }
  const d = await loadCadastroFromSheets();
  return {
    g: d.gestores.find((x) => x.id === input.gestorId),
    colab: d.colaboradores.find((c) => c.id === input.colaboradorId),
    ev: d.eventos.find((e) => e.id === input.eventoId),
  };
}

export async function appendLancamento(
  input: NovoLancamentoInput,
): Promise<{ ok: boolean; mode: "sheet"; updatedRange?: string }> {
  const { g, colab, ev } = await resolveLaunchEntities(input);
  if (!g || !colab || !ev) {
    throw new Error("Dados inválidos");
  }

  if (!isSheetsWriteConfigured()) {
    throw new Error("Google Sheets de lançamentos não está configurado para gravação.");
  }

  const sheets = getSheetsClient();
  const spreadsheetId = lancamentosSpreadsheetId();
  const range = lancamentosAppendRange();
  if (!sheets || !spreadsheetId || !range) {
    throw new Error("Cliente do Google Sheets indisponível para gravação.");
  }

  const salario = String(colab.salario || colab.valorHora || 0);

  const parsed = parseAppendRange(range);
  const firstDataRow = parsed.startRow + 1; // linha após o cabeçalho

  // Define a primeira linha livre pela coluna A (Colaborador_id), evitando pular para linhas altas
  // quando há fórmulas pré-preenchidas em outras colunas.
  const keyColumnRange = `'${parsed.sheetName}'!${parsed.startCol}${firstDataRow}:${parsed.startCol}5000`;
  const keyColumnRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: keyColumnRange,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const keyValues = keyColumnRes.data.values ?? [];
  let targetRow = firstDataRow;
  for (let i = 0; i < keyValues.length; i++) {
    const cell = keyValues[i]?.[0];
    if (!cell || !String(cell).trim()) {
      targetRow = firstDataRow + i;
      break;
    }
    targetRow = firstDataRow + i + 1;
  }

  // Importante: escreve somente colunas de entrada manual para não apagar fórmulas.
  // Layout atual:
  // A Colaborador_id | B Gestor_id | C PJ/CLT | D Entrada | E Saída | F (fórmula)
  // G Data | H Evento_id | I..P (fórmulas/derivações, exceto K salário manual)
  const updateRes = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${parsed.sheetName}'!A${targetRow}:E${targetRow}`,
          values: [[colab.id, g.id, colab.regime, input.horaInicio, input.horaFim]],
        },
        {
          range: `'${parsed.sheetName}'!G${targetRow}:H${targetRow}`,
          values: [[input.data, ev.id]],
        },
        {
          range: `'${parsed.sheetName}'!K${targetRow}:K${targetRow}`,
          values: [[salario]],
        },
      ],
    },
  });

  return {
    ok: true,
    mode: "sheet",
    updatedRange: updateRes.data.responses?.[0]?.updatedRange,
  };
}
