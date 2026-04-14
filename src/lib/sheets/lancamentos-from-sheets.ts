import { calcularValor } from "@/lib/domain/calculo";
import type { Colaborador, Evento, Gestor, Lancamento } from "@/lib/domain/types";
import { loadCadastroFromSheets } from "./cadastro-from-sheets";
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

function parseHoras(raw: string): number {
  const value = (raw || "").trim();
  if (!value) return 0;

  // Ex.: 08:30 ou 08:30:00 -> 8.5
  const timeMatch = value.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const h = Number(timeMatch[1] || 0);
    const m = Number(timeMatch[2] || 0);
    const s = Number(timeMatch[3] || 0);
    return h + m / 60 + s / 3600;
  }

  return parseNumberBr(value);
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

type CadastroLookup = {
  colaboradores: Colaborador[];
  gestores: Gestor[];
  eventos: Evento[];
};

function findByIdOrName<T extends { id: string; nome: string }>(
  list: T[],
  idValue: string,
  nameValue: string,
): T | undefined {
  const byId = idValue ? list.find((x) => x.id === idValue) : undefined;
  if (byId) return byId;
  if (!nameValue) return undefined;
  const nameNorm = nameValue.trim().toLowerCase();
  return list.find((x) => x.nome.trim().toLowerCase() === nameNorm);
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
  cadastro: CadastroLookup,
): LancamentoRow | null {
  const cells = row.map((c) => (c == null ? "" : String(c).trim()));
  const m = headers?.length ? buildHeaderIndex(headers) : null;

  let gestorNome = "";
  let colaboradorNome = "";
  let regime: "CLT" | "PJ" = "CLT";
  let eventoNome = "";
  let gestorId = "";
  let colaboradorId = "";
  let eventoId = "";
  let data = "";
  let horas = 0;
  let periodo: Lancamento["periodo"] = "Diurno";
  let feriado = false;
  let valor = 0;

  if (m) {
    // Novo layout (aba Horas Extras)
    colaboradorId = getCell(m, cells, ["colaborador_id", "id_colaborador"]);
    gestorId = getCell(m, cells, ["gestor_id", "id_gestor"]);
    eventoId = getCell(m, cells, ["evento_id", "id_evento"]);
    data = normalizeDateYmd(getCell(m, cells, ["data", "dia"]));
    const entrada = getCell(m, cells, ["entrada", "hora_inicio", "horario_inicial"]);
    const saida = getCell(m, cells, ["saida", "saída", "hora_fim", "horario_final"]);
    void entrada;
    void saida;
    horas = parseHoras(getCell(m, cells, ["horas_extras_totais", "horas_totais", "horas", "total_horas"]));
    const valor100 = parseNumberBr(getCell(m, cells, ["valor_100", "valor__100", "valor100"]));
    const valor50 = parseNumberBr(getCell(m, cells, ["valor_50", "valor__50", "valor50"]));
    valor = valor100 + valor50;
    if (valor100 > 0) {
      feriado = true;
    }

    const per = getCell(m, cells, ["periodo", "período"]);
    if (per === "Noturno" || per === "Diurno" || per === "Integral") {
      periodo = per;
    }

    // Compatibilidade com layout antigo por nome (caso haja linhas legadas)
    gestorNome = getCell(m, cells, ["gestor", "gestor_responsavel", "gestor_responsável"]);
    colaboradorNome = getCell(m, cells, ["colaborador", "nome_colaborador", "funcionario", "funcionário"]);
    const regStr = getCell(m, cells, ["regime", "tipo", "pj_clt"]).toUpperCase();
    if (regStr) regime = regStr.includes("PJ") ? "PJ" : "CLT";
    eventoNome = getCell(m, cells, ["evento", "projeto", "obra"]);
    const hi = getCell(m, cells, ["hora_inicio", "horário_inicial", "horario_inicial", "inicio", "início", "entrada"]);
    const hf = getCell(m, cells, ["hora_fim", "horário_final", "horario_final", "fim", "termino", "término", "saida", "saída"]);
    void hi;
    void hf;
    if (horas <= 0) {
      horas = parseHoras(getCell(m, cells, ["horas_extras_totais", "horas", "qtd_horas", "quantidade_horas"]));
    }
    const f = getCell(m, cells, ["feriado", "feriado_nacional"]).toLowerCase();
    feriado = f === "sim" || f === "true" || f === "1" || f === "s";
    if (valor <= 0) {
      valor = parseNumberBr(getCell(m, cells, ["valor", "valor_total", "total"]));
    }
  } else {
    gestorNome = cells[0] ?? "";
    colaboradorNome = cells[1] ?? "";
    regime = (cells[2] ?? "").toUpperCase().includes("PJ") ? "PJ" : "CLT";
    eventoNome = cells[3] ?? "";
    data = normalizeDateYmd(cells[4] ?? "");
    horas = parseHoras(cells[7]);
    const per = (cells[8] ?? "").trim();
    if (per === "Noturno" || per === "Diurno" || per === "Integral") {
      periodo = per;
    }
    const f = (cells[9] ?? "").toLowerCase();
    feriado = f === "sim" || f === "true";
    valor = cells.length > 12 ? parseNumberBr(cells[12]) : 0;
  }

  const colabMatch = findByIdOrName(cadastro.colaboradores, colaboradorId, colaboradorNome);
  const gestorMatch = findByIdOrName(cadastro.gestores, gestorId, gestorNome);
  const eventoMatch = findByIdOrName(cadastro.eventos, eventoId, eventoNome);

  const colaboradorIdFinal =
    colabMatch?.id || colaboradorId || `ext:c-${normalizeHeader(colaboradorNome)}-${rowIndex}`;
  const gestorIdFinal = gestorMatch?.id || gestorId || `ext:g-${normalizeHeader(gestorNome)}-${rowIndex}`;
  const eventoIdFinal = eventoMatch?.id || eventoId || `ext:e-${normalizeHeader(eventoNome)}-${rowIndex}`;

  const colaboradorNomeFinal = colabMatch?.nome || colaboradorNome;
  const gestorNomeFinal = gestorMatch?.nome || gestorNome;
  const eventoNomeFinal = eventoMatch?.nome || eventoNome;

  if (!colaboradorNomeFinal || !data || horas <= 0) return null;

  const regimeFinal = colabMatch?.regime ?? regime;
  let valorFinal = valor;
  if (valorFinal <= 0 && colabMatch) {
    valorFinal = calcularValor(colabMatch, horas, feriado);
  }

  return {
    id: `sheet-${rowIndex}`,
    colaboradorId: colaboradorIdFinal,
    gestorId: gestorIdFinal,
    eventoId: eventoIdFinal,
    data,
    horas,
    periodo,
    feriado,
    valor: valorFinal,
    gestorNome: gestorNomeFinal || "—",
    colaboradorNome: colaboradorNomeFinal,
    eventoNome: eventoNomeFinal || "—",
    regime: regimeFinal,
  };
}

export async function loadLancamentosFromSheets(): Promise<LancamentoRow[]> {
  const spreadsheetId = lancamentosSpreadsheetId();
  const range = process.env.GOOGLE_SHEETS_LANCAMENTOS_READ_RANGE!;
  const rows = await fetchRange(spreadsheetId, range);
  if (!rows.length) return [];
  const cadastro = await loadCadastroFromSheets();

  const headers = rows[0].map((h) => String(h));
  const hasHeader = headers.some((h) => normalizeHeader(h).length > 0);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headerRow = hasHeader ? headers : null;

  const out: LancamentoRow[] = [];
  let i = 0;
  for (const row of dataRows) {
    const lr = rowToLancamentoRow(row, headerRow, i, cadastro);
    if (lr) out.push(lr);
    i++;
  }
  return out;
}
