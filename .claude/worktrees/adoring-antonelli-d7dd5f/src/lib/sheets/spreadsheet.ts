import { google } from "googleapis";

export function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
}

export function parseNumberBr(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(/[^\d,.\-]/g, "");
  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  // Ex.: 1.234,56 -> 1234.56
  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Ex.: 1234,56 -> 1234.56
    normalized = raw.replace(",", ".");
  } else if (hasDot) {
    // Se houver múltiplos pontos, trata como milhar: 1.234.567 -> 1234567
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 1) {
      normalized = raw.replace(/\./g, "");
    } else {
      // Com um ponto só, mantém decimal estilo en-US: 1234.56
      normalized = raw;
    }
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Primeira linha = cabeçalhos; demais = dados. */
export function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headerCells = rows[0] ?? [];
  const keys = headerCells.map((h) => normalizeHeader(String(h)));
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (!row.some((c) => String(c).trim())) continue;
    const obj: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      obj[k] = row[i] != null ? String(row[i]) : "";
    });
    out.push(obj);
  }
  return out;
}

export async function fetchRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  if (!sheets) return [];
  const normalizedRange = normalizeA1Range(range);

  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: normalizedRange,
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (error) {
    const e = error as {
      message?: string;
      code?: number;
      response?: {
        status?: number;
        data?: {
          error?: {
            code?: number;
            message?: string;
            status?: string;
            errors?: Array<{ reason?: string; message?: string }>;
          };
        };
      };
    };
    const googleErr = e.response?.data?.error;
    console.error("[sheets] Falha ao ler intervalo:", {
      spreadsheetId,
      range: normalizedRange,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      status: e.response?.status ?? e.code,
      message: googleErr?.message ?? e.message,
      reason: googleErr?.errors?.[0]?.reason,
      statusText: googleErr?.status,
    });
    throw error;
  }

  const values = res.data.values;
  if (!values?.length) return [];
  return values.map((row) => row.map((c) => (c == null ? "" : String(c))));
}

/**
 * Garante A1 notation válida quando o nome da aba tem espaços/símbolos.
 * Ex.: Horas Extras!A:O -> 'Horas Extras'!A:O
 */
export function normalizeA1Range(range: string): string {
  const raw = (range || "").trim();
  const bangIndex = raw.indexOf("!");
  if (bangIndex <= 0) return raw;

  const sheetName = raw.slice(0, bangIndex).trim();
  const suffix = raw.slice(bangIndex + 1);
  const alreadyQuoted = sheetName.startsWith("'") && sheetName.endsWith("'");
  if (alreadyQuoted) return raw;

  const requiresQuote = /[\s\-()[\]{}]/.test(sheetName);
  if (!requiresQuote) return raw;
  return `'${sheetName.replace(/'/g, "''")}'!${suffix}`;
}
