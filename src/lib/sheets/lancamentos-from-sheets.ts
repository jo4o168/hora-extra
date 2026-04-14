import {
  calcularValor,
  colaboradores as mockColabs,
  type Colaborador,
  type Lancamento,
} from "@/data/mockData";
import type { LancamentoRow } from "@/lib/sheets/types";
import { fetchRange, normalizeHeader, parseNumberBr } from "./spreadsheet";

function buildHeaderIndex(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  headers.forEach((h, i) => {
    const k = normalizeHeader(String(h));
    if (k) m[k] = i;
  });
  return m;
}

function getCell(
  m: Record<string, number>,
  cells: string[],
  aliases: string[],
): string {
  for (const a of aliases) {
    const na = normalizeHeader(a);
    if (na in m) {
      const v = cells[m[na]];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  for (const a of aliases) {
    const na = normalizeHeader(a);
    for (const key of Object.keys(m)) {
      if (key === na || key.includes(na) || na.includes(key)) {
        const v = cells[m[key]];
        if (v != null && String(v).trim()) return String(v).trim();
      }
    }
  }
  return "";
}

export function isLancamentosReadConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      lancamentosSpreadsheetId() &&
      process.env.GOOGLE_SHEETS_LANCAMENTOS_READ_RANGE,
  );
}

function lancamentosSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEETS_LANCAMENTOS_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    ""
  );
}

function findColabByNome(nome: string): Colaborador | undefined {
  const n = nome.trim().toLowerCase();
  return mockColabs.find((c) => c.nome.toLowerCase() === n);
}

/** Converte célula de data do Sheets para YYYY-MM-DD quando possível. */
function normalizeDateYmd(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    return `${br[3]}-${month}-${day}`;
  }
  return s;
}

export function rowToLancamentoRow(
  row: string[],
  headers: string[] | null,
  rowIndex: number,
): LancamentoRow | null {
  const cells = row.map((c) => (c == null ? "" : String(c).trim()));
  const m = headers?.length ? buildHeaderIndex(headers) : null;

  let gestorNome = "";
  let colaboradorNome = "";
  let regime: "CLT" | "PJ" = "CLT";
  let eventoNome = "";
  let data = "";
  let horas = 0;
  let periodo: Lancamento["periodo"] = "Diurno";
  let feriado = false;
  let valor = 0;

  if (m) {
    gestorNome = getCell(m, cells, ["gestor", "gestor_responsavel", "gestor_responsável"]);
    colaboradorNome = getCell(m, cells, ["colaborador", "nome_colaborador", "funcionario", "funcionário"]);
    const regStr = getCell(m, cells, ["regime", "tipo"]).toUpperCase();
    regime = regStr.includes("PJ") ? "PJ" : "CLT";
    eventoNome = getCell(m, cells, ["evento", "projeto", "obra"]);
    data = normalizeDateYmd(getCell(m, cells, ["data", "dia"]));
    const hi = getCell(m, cells, ["hora_inicio", "horário_inicial", "horario_inicial", "inicio", "início"]);
    const hf = getCell(m, cells, ["hora_fim", "horário_final", "horario_final", "fim", "termino", "término"]);
    void hi;
    void hf;
    horas = parseNumberBr(getCell(m, cells, ["horas", "total_horas", "qtd_horas", "quantidade_horas"]));
    const per = getCell(m, cells, ["periodo", "período"]);
    if (per === "Noturno" || per === "Diurno" || per === "Integral") {
      periodo = per;
    }
    const f = getCell(m, cells, ["feriado", "feriado_nacional"]).toLowerCase();
    feriado = f === "sim" || f === "true" || f === "1" || f === "s";
    valor = parseNumberBr(getCell(m, cells, ["valor", "valor_total", "total"]));
  } else {
    gestorNome = cells[0] ?? "";
    colaboradorNome = cells[1] ?? "";
    regime = (cells[2] ?? "").toUpperCase().includes("PJ") ? "PJ" : "CLT";
    eventoNome = cells[3] ?? "";
    data = normalizeDateYmd(cells[4] ?? "");
    horas = parseNumberBr(cells[7]);
    const per = (cells[8] ?? "").trim();
    if (per === "Noturno" || per === "Diurno" || per === "Integral") {
      periodo = per;
    }
    const f = (cells[9] ?? "").toLowerCase();
    feriado = f === "sim" || f === "true";
    valor = cells.length > 12 ? parseNumberBr(cells[12]) : 0;
  }

  if (!colaboradorNome || !data || horas <= 0) return null;

  const colabMatch = findColabByNome(colaboradorNome);
  const colaboradorId = colabMatch?.id ?? `ext:${normalizeHeader(colaboradorNome)}-${rowIndex}`;
  const gestorId = `ext:g-${normalizeHeader(gestorNome)}-${rowIndex}`;
  const eventoId = `ext:e-${normalizeHeader(eventoNome)}-${rowIndex}`;

  const regimeFinal = colabMatch?.regime ?? regime;
  let valorFinal = valor;
  if (valorFinal <= 0 && colabMatch) {
    valorFinal = calcularValor(colabMatch, horas, feriado);
  }

  return {
    id: `sheet-${rowIndex}`,
    colaboradorId,
    gestorId,
    eventoId,
    data,
    horas,
    periodo,
    feriado,
    valor: valorFinal,
    gestorNome: gestorNome || "—",
    colaboradorNome,
    eventoNome: eventoNome || "—",
    regime: regimeFinal,
  };
}

export async function loadLancamentosFromSheets(): Promise<LancamentoRow[]> {
  const spreadsheetId = lancamentosSpreadsheetId();
  const range = process.env.GOOGLE_SHEETS_LANCAMENTOS_READ_RANGE!;
  const rows = await fetchRange(spreadsheetId, range);
  if (!rows.length) return [];

  const headers = rows[0].map((h) => String(h));
  const hasHeader = headers.some((h) => normalizeHeader(h).length > 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headerRow = hasHeader ? headers : null;

  const out: LancamentoRow[] = [];
  let i = 0;
  for (const row of dataRows) {
    const lr = rowToLancamentoRow(row, headerRow, i);
    if (lr) out.push(lr);
    i++;
  }
  return out;
}
