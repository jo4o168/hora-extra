import { loadCadastroFromSheets, isCadastroSheetsConfigured } from "./cadastro-from-sheets";
import { loadLancamentosFromSheets, isLancamentosReadConfigured } from "./lancamentos-from-sheets";
import { getSheetsClient, normalizeA1Range, normalizeHeader } from "./spreadsheet";
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

function lancamentosReadRange(): string {
  return process.env.GOOGLE_SHEETS_LANCAMENTOS_READ_RANGE || "";
}

function parseAppendRange(range: string): { sheetName: string; startCol: string; startRow: number; endCol: string } {
  const normalized = normalizeA1Range(range);
  const match = normalized.match(/^(?:'([^']+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)(?:\d+)?$/i);
  if (!match) {
    throw new Error(
      `Intervalo inválido: "${range}". Use formato como 'Horas Extras'!A3:R ou 'Horas Extras'!A3:R5000`,
    );
  }
  return {
    sheetName: (match[1] || match[2] || "").trim(),
    startCol: match[3].toUpperCase(),
    startRow: Number(match[4]),
    endCol: match[5].toUpperCase(),
  };
}

function columnLetterToIndex(col: string): number {
  return col
    .toUpperCase()
    .split("")
    .reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0);
}

function columnIndexToLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function colorForPagamento(pago: boolean) {
  if (pago) {
    return {
      red: 0.886,
      green: 0.937,
      blue: 0.855,
    };
  }
  return {
    red: 0.984,
    green: 0.905,
    blue: 0.855,
  };
}

async function resolvePagamentoColumnInfo() {
  const sheets = getSheetsClient();
  const spreadsheetId = lancamentosSpreadsheetId();
  const readRange = lancamentosReadRange();
  if (!sheets || !spreadsheetId || !readRange) {
    throw new Error("Leitura de lançamentos não configurada para localizar coluna de pagamento.");
  }

  const parsed = parseAppendRange(readRange);
  const headerRange = `'${parsed.sheetName}'!${parsed.startCol}${parsed.startRow}:${parsed.endCol}${parsed.startRow}`;
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const headers = (headerRes.data.values?.[0] ?? []).map((h) => normalizeHeader(String(h || "")));
  const aliases = new Set(["ja_foi_pago", "jafoipago", "pago", "status_pagamento"]);

  let paidOffset = headers.findIndex((h) => aliases.has(h));
  if (paidOffset < 0) {
    // fallback para layout atual: coluna Q (17ª a partir de A)
    paidOffset = columnLetterToIndex("Q") - columnLetterToIndex(parsed.startCol);
  }

  const paidColumnIndex = columnLetterToIndex(parsed.startCol) + paidOffset;
  const paidColumnLetter = columnIndexToLetter(paidColumnIndex);
  return { sheetName: parsed.sheetName, paidColumnLetter };
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
  // A Colaborador | B Gestor_id | C PJ/CLT | D Entrada | E Saída | F (fórmula)
  // G Data | H Evento_id | I..P (fórmulas/derivações, exceto K salário manual)
  // Q Já foi Pago? | R Feriado Nacional?
  const updateRes = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${parsed.sheetName}'!A${targetRow}:E${targetRow}`,
          values: [[colab.nome, g.id, colab.regime, input.horaInicio, input.horaFim]],
        },
        {
          range: `'${parsed.sheetName}'!G${targetRow}:H${targetRow}`,
          values: [[input.data, ev.id]],
        },
        {
          range: `'${parsed.sheetName}'!K${targetRow}:K${targetRow}`,
          values: [[salario]],
        },
        {
          range: `'${parsed.sheetName}'!Q${targetRow}:Q${targetRow}`,
          values: [["Não"]],
        },
        {
          range: `'${parsed.sheetName}'!R${targetRow}:R${targetRow}`,
          values: [[input.feriado ? "Sim" : "Não"]],
        },
      ],
    },
  });
  await updateLancamentoPagamento({ sheetRowNumber: targetRow, pago: false }).catch(() => {
    // formatação visual é complementar; falha aqui não deve impedir o lançamento
  });

  return {
    ok: true,
    mode: "sheet",
    updatedRange: updateRes.data.responses?.[0]?.updatedRange,
  };
}

export async function updateLancamento(
  input: NovoLancamentoInput & { sheetRowNumber: number },
): Promise<{ ok: boolean; mode: "sheet" }> {
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

  const parsed = parseAppendRange(range);
  const salario = String(colab.salario || colab.valorHora || 0);
  const targetRow = input.sheetRowNumber;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${parsed.sheetName}'!A${targetRow}:E${targetRow}`,
          values: [[colab.nome, g.id, colab.regime, input.horaInicio, input.horaFim]],
        },
        {
          range: `'${parsed.sheetName}'!G${targetRow}:H${targetRow}`,
          values: [[input.data, ev.id]],
        },
        {
          range: `'${parsed.sheetName}'!K${targetRow}:K${targetRow}`,
          values: [[salario]],
        },
        {
          range: `'${parsed.sheetName}'!R${targetRow}:R${targetRow}`,
          values: [[input.feriado ? "Sim" : "Não"]],
        },
      ],
    },
  });

  return { ok: true, mode: "sheet" };
}

export async function updateLancamentoPagamento(input: {
  sheetRowNumber: number;
  pago: boolean;
}): Promise<{ ok: boolean; mode: "sheet" }> {
  if (!isSheetsWriteConfigured()) {
    throw new Error("Google Sheets de lançamentos não está configurado para gravação.");
  }

  const sheets = getSheetsClient();
  const spreadsheetId = lancamentosSpreadsheetId();
  if (!sheets || !spreadsheetId) {
    throw new Error("Cliente do Google Sheets indisponível para gravação.");
  }

  const { sheetName, paidColumnLetter } = await resolvePagamentoColumnInfo();
  const paidValue = input.pago ? "Sim" : "Não";
  const cellRange = `'${sheetName}'!${paidColumnLetter}${input.sheetRowNumber}:${paidColumnLetter}${input.sheetRowNumber}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: cellRange,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[paidValue]],
    },
  });

  const metaRes = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [cellRange],
    includeGridData: false,
  });
  const sheetId = metaRes.data.sheets?.[0]?.properties?.sheetId;
  if (typeof sheetId === "number") {
    const colIndex = columnLetterToIndex(paidColumnLetter) - 1;
    const bg = colorForPagamento(input.pago);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: input.sheetRowNumber - 1,
                endRowIndex: input.sheetRowNumber,
                startColumnIndex: colIndex,
                endColumnIndex: colIndex + 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: bg,
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
        ],
      },
    });
  }

  return { ok: true, mode: "sheet" };
}
