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

function colorForLancamento() {
  return {
    red: 0.886,
    green: 0.937,
    blue: 0.855,
  };
}

function colorForAbatimento() {
  return {
    red: 0.984,
    green: 0.905,
    blue: 0.855,
  };
}

function isWeekendDate(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

function decimalHoursToDuration(value: number): string {
  const totalMinutes = Math.round(Math.abs(value) * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

const APPEND_RETRY_ATTEMPTS = 4;
const APPEND_RETRY_DELAY_MS = 140;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveNextFreeLancamentoRow(params: {
  sheets: NonNullable<ReturnType<typeof getSheetsClient>>;
  spreadsheetId: string;
  sheetName: string;
  startCol: string;
  firstDataRow: number;
}): Promise<number> {
  const { sheets, spreadsheetId, sheetName, startCol, firstDataRow } = params;
  const keyColumnRange = `'${sheetName}'!${startCol}${firstDataRow}:${startCol}5000`;
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
  return targetRow;
}

async function isLancamentoRowAvailable(params: {
  sheets: NonNullable<ReturnType<typeof getSheetsClient>>;
  spreadsheetId: string;
  sheetName: string;
  targetRow: number;
}): Promise<boolean> {
  const { sheets, spreadsheetId, sheetName, targetRow } = params;
  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A${targetRow}:A${targetRow}`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const cell = readRes.data.values?.[0]?.[0];
  return !cell || !String(cell).trim();
}

async function resolveLancamentosColumnsInfo() {
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
  const valorPagoAliases = new Set(["valor_pago", "valor pago", "valorpago"]);
  const feriadoAliases = new Set(["feriado_nacional", "feriado_nacional_", "feriado nacional"]);

  let valorPagoOffset = headers.findIndex((h) => valorPagoAliases.has(h));
  if (valorPagoOffset < 0) {
    // fallback para layout novo: coluna M
    valorPagoOffset = columnLetterToIndex("M") - columnLetterToIndex(parsed.startCol);
  }
  let feriadoOffset = headers.findIndex((h) => feriadoAliases.has(h));
  if (feriadoOffset < 0) {
    // fallback para layout novo: coluna P
    feriadoOffset = columnLetterToIndex("P") - columnLetterToIndex(parsed.startCol);
  }

  const valorPagoColumnIndex = columnLetterToIndex(parsed.startCol) + valorPagoOffset;
  const feriadoColumnIndex = columnLetterToIndex(parsed.startCol) + feriadoOffset;
  return {
    sheetName: parsed.sheetName,
    valorPagoColumnLetter: columnIndexToLetter(valorPagoColumnIndex),
    feriadoColumnLetter: columnIndexToLetter(feriadoColumnIndex),
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
  const shouldAddFolgaDia = colab.regime === "PJ" && (input.feriado || isWeekendDate(input.data));
  const expected = {
    nomeColaborador: colab.nome,
    gestorId: g.id,
    regime: colab.regime,
    horaInicio: input.horaInicio,
    horaFim: input.horaFim,
    data: input.data,
    eventoId: ev.id,
    salario,
    feriado: input.feriado ? "Sim" : "Não",
  };

  // Importante: escreve somente colunas de entrada manual para não apagar fórmulas.
  // Layout atual:
  // A Colaborador | B Gestor_id | C PJ/CLT | D Entrada | E Saída | F (fórmula)
  // G Data | H Evento_id | I..R (fórmulas/derivações, exceto K salário manual)
  // N Valor abatido | P Horas abatidas | Q Dias de Folga (PJ) | R Abatimento Dia de Folga(PJ) | S Feriado Nacional?
  for (let attempt = 1; attempt <= APPEND_RETRY_ATTEMPTS; attempt++) {
    const targetRow = await resolveNextFreeLancamentoRow({
      sheets,
      spreadsheetId,
      sheetName: parsed.sheetName,
      startCol: parsed.startCol,
      firstDataRow,
    });
    const rowAvailable = await isLancamentoRowAvailable({
      sheets,
      spreadsheetId,
      sheetName: parsed.sheetName,
      targetRow,
    });
    if (!rowAvailable) {
      if (attempt < APPEND_RETRY_ATTEMPTS) {
        await sleep(APPEND_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw new Error(
        "Não foi possível concluir o lançamento por concorrência na planilha. Tente novamente em alguns segundos.",
      );
    }

    const updateRes = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${parsed.sheetName}'!A${targetRow}:E${targetRow}`,
            values: [[expected.nomeColaborador, expected.gestorId, expected.regime, expected.horaInicio, expected.horaFim]],
          },
          {
            range: `'${parsed.sheetName}'!G${targetRow}:H${targetRow}`,
            values: [[expected.data, expected.eventoId]],
          },
          {
            range: `'${parsed.sheetName}'!K${targetRow}:K${targetRow}`,
            values: [[expected.salario]],
          },
          {
            range: `'${parsed.sheetName}'!S${targetRow}:S${targetRow}`,
            values: [[expected.feriado]],
          },
        ],
      },
    });

    if (shouldAddFolgaDia) {
      const folgaRange = `'${parsed.sheetName}'!Q${targetRow}:Q${targetRow}`;
      const folgaAtualRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: folgaRange,
        valueRenderOption: "FORMATTED_VALUE",
      });
      const folgaAtualRaw = folgaAtualRes.data.values?.[0]?.[0];
      const folgaAtual = Number(String(folgaAtualRaw ?? "0").replace(",", "."));
      const proximaFolga = (Number.isFinite(folgaAtual) ? folgaAtual : 0) + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: folgaRange,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[String(proximaFolga)]],
        },
      });
    }

    const metaRes = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`'${parsed.sheetName}'!A${targetRow}:S${targetRow}`],
      includeGridData: false,
    });
    const sheetId = metaRes.data.sheets?.[0]?.properties?.sheetId;
    if (typeof sheetId === "number") {
      const bg = colorForLancamento();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: targetRow - 1,
                  endRowIndex: targetRow,
                  startColumnIndex: 0,
                  endColumnIndex: 19,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: bg,
                  },
                },
                fields: "userEnteredFormat.backgroundColor",
              },
            },
          ],
        },
      });
    }

    return {
      ok: true,
      mode: "sheet",
      updatedRange: updateRes.data.responses?.[0]?.updatedRange,
    };
  }

  throw new Error(
    "Não foi possível concluir o lançamento por concorrência na planilha. Tente novamente em alguns segundos.",
  );
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
          range: `'${parsed.sheetName}'!S${targetRow}:S${targetRow}`,
          values: [[input.feriado ? "Sim" : "Não"]],
        },
      ],
    },
  });

  return { ok: true, mode: "sheet" };
}

export async function updateLancamentoAbatimento(input: {
  tipo: "clt" | "pj_horas" | "pj_dias";
  gestorId: string;
  colaboradorId: string;
  eventoId: string;
  valorAbatido?: number;
  horasAbatidas?: number;
  diasAbatidos?: number;
  diaFolgaPJ?: string;
  observacao?: string;
}): Promise<{ ok: boolean; mode: "sheet" }> {
  if (!isSheetsWriteConfigured()) {
    throw new Error("Google Sheets de lançamentos não está configurado para gravação.");
  }
  const valorAbatidoNum = Math.abs(Number(input.valorAbatido || 0));
  const horasAbatidasNum = Math.abs(Number(input.horasAbatidas || 0));
  const diasAbatidosNum = Math.abs(Number(input.diasAbatidos || 0));
  if (valorAbatidoNum <= 0 && horasAbatidasNum <= 0 && diasAbatidosNum <= 0) {
    throw new Error("Informe valor, horas e/ou dias para abatimento.");
  }
  const sheets = getSheetsClient();
  const spreadsheetId = lancamentosSpreadsheetId();
  const range = lancamentosAppendRange();
  if (!sheets || !spreadsheetId || !range) {
    throw new Error("Cliente do Google Sheets indisponível para gravação.");
  }
  const cadastro = await loadCadastroFromSheets();
  const colab = cadastro.colaboradores.find((c) => c.id === input.colaboradorId);
  if (!colab) {
    throw new Error("Colaborador inválido para abatimento.");
  }
  if (input.tipo === "clt" && colab.regime !== "CLT") {
    throw new Error("Abatimento monetário é permitido somente para CLT.");
  }
  if ((input.tipo === "pj_horas" || input.tipo === "pj_dias") && colab.regime !== "PJ") {
    throw new Error("Abatimento de PJ permitido somente para colaboradores PJ.");
  }
  if (input.tipo === "pj_dias" && !input.diaFolgaPJ) {
    throw new Error("Informe o dia de folga (PJ) para o abatimento.");
  }
  const parsed = parseAppendRange(range);
  const firstDataRow = parsed.startRow + 1;
  const targetRow = await resolveNextFreeLancamentoRow({
    sheets,
    spreadsheetId,
    sheetName: parsed.sheetName,
    startCol: parsed.startCol,
    firstDataRow,
  });
  const hoje = new Date();
  const dataAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const salario = String(colab.salario || colab.valorHora || 0);
  const valorAbatido = valorAbatidoNum > 0 ? valorAbatidoNum : "";
  const horasAbatidas = horasAbatidasNum > 0 ? decimalHoursToDuration(horasAbatidasNum) : "";
  const diasFolgaAjuste = input.tipo === "pj_dias" && diasAbatidosNum > 0 ? -diasAbatidosNum : "";
  const diaFolgaPJ = input.tipo === "pj_dias" ? input.diaFolgaPJ || "" : "";
  const observacao = (input.observacao || "").trim();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `'${parsed.sheetName}'!A${targetRow}:C${targetRow}`,
          values: [[colab.nome, input.gestorId, "CLT"]],
        },
        {
          range: `'${parsed.sheetName}'!G${targetRow}:H${targetRow}`,
          values: [[dataAtual, input.eventoId]],
        },
        {
          range: `'${parsed.sheetName}'!K${targetRow}:K${targetRow}`,
          values: [[salario]],
        },
        {
          range: `'${parsed.sheetName}'!N${targetRow}:N${targetRow}`,
          values: [[valorAbatido]],
        },
        {
          range: `'${parsed.sheetName}'!P${targetRow}:P${targetRow}`,
          values: [[horasAbatidas]],
        },
        {
          range: `'${parsed.sheetName}'!Q${targetRow}:Q${targetRow}`,
          values: [[diasFolgaAjuste]],
        },
        {
          range: `'${parsed.sheetName}'!R${targetRow}:R${targetRow}`,
          values: [[diaFolgaPJ]],
        },
        {
          range: `'${parsed.sheetName}'!T${targetRow}:T${targetRow}`,
          values: [[observacao]],
        },
      ],
    },
  });

  const metaRes = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [`'${parsed.sheetName}'!A${targetRow}:T${targetRow}`],
    includeGridData: false,
  });
  const sheetId = metaRes.data.sheets?.[0]?.properties?.sheetId;
  if (typeof sheetId === "number") {
    const bg = colorForAbatimento();
    const requests: Array<Record<string, unknown>> = [
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: targetRow - 1,
            endRowIndex: targetRow,
            startColumnIndex: 0,
            endColumnIndex: 20,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: bg,
            },
          },
          fields: "userEnteredFormat.backgroundColor",
        },
      },
    ];
    if (horasAbatidas) {
      // Garante exibição como duração (não horário do dia), evitando 24h -> 00h
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: targetRow - 1,
            endRowIndex: targetRow,
            startColumnIndex: 15, // coluna P (Horas abatidas)
            endColumnIndex: 16,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "NUMBER",
                pattern: "[h]:mm:ss",
              },
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    });
  }
  return { ok: true, mode: "sheet" };
}
