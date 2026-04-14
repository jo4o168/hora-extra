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
  const s = String(value).trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const values = res.data.values;
  if (!values?.length) return [];
  return values.map((row) => row.map((c) => (c == null ? "" : String(c))));
}
