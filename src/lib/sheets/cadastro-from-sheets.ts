import type { Colaborador, Evento, Gestor } from "@/data/mockData";
import { fetchRange, normalizeHeader, parseNumberBr, rowsToObjects } from "./spreadsheet";

function pick(obj: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const na = normalizeHeader(a);
    if (obj[na]?.trim()) return obj[na].trim();
  }
  for (const a of aliases) {
    const na = normalizeHeader(a);
    for (const key of Object.keys(obj)) {
      if (key === na || key.includes(na) || na.includes(key)) {
        if (obj[key]?.trim()) return obj[key].trim();
      }
    }
  }
  return "";
}

export function isCadastroSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.GOOGLE_SHEETS_CADASTRO_SPREADSHEET_ID &&
      process.env.GOOGLE_SHEETS_CADASTRO_GESTORES_RANGE &&
      process.env.GOOGLE_SHEETS_CADASTRO_COLABORADORES_RANGE &&
      process.env.GOOGLE_SHEETS_CADASTRO_EVENTOS_RANGE,
  );
}

function parseGestores(rows: string[][]): Gestor[] {
  const objs = rowsToObjects(rows);
  return objs
    .map((o) => {
      const id = pick(o, ["id", "gestor_id", "codigo"]);
      const nome = pick(o, ["nome", "gestor", "nome_gestor"]);
      if (!id || !nome) return null;
      return { id, nome };
    })
    .filter(Boolean) as Gestor[];
}

function parseColaboradores(rows: string[][]): Colaborador[] {
  const objs = rowsToObjects(rows);
  return objs
    .map((o) => {
      const id = pick(o, ["id", "colaborador_id", "codigo", "matricula"]);
      const nome = pick(o, ["nome", "colaborador", "nome_colaborador"]);
      const cargo = pick(o, ["cargo", "funcao", "função"]) || "—";
      const regimeRaw = pick(o, ["regime", "tipo", "clt_pj"]).toUpperCase();
      const regime = regimeRaw.includes("PJ") ? "PJ" : "CLT";
      const gestorId = pick(o, ["gestor_id", "gestorid", "id_gestor"]);
      const salario = parseNumberBr(pick(o, ["salario", "salário", "salario_base"]));
      const valorHoraRaw = pick(o, ["valor_hora", "valorhora", "valor_h"]);
      const valorHora = parseNumberBr(valorHoraRaw);
      if (!id || !nome || !gestorId) return null;
      const c: Colaborador = {
        id,
        nome,
        cargo,
        regime,
        salario: regime === "PJ" ? 0 : salario,
        gestorId,
      };
      if (regime === "PJ" && valorHora > 0) c.valorHora = valorHora;
      return c;
    })
    .filter(Boolean) as Colaborador[];
}

function parseEventos(rows: string[][]): Evento[] {
  const objs = rowsToObjects(rows);
  return objs
    .map((o) => {
      const id = pick(o, ["id", "evento_id", "codigo"]);
      const nome = pick(o, ["nome", "evento", "descricao", "descrição"]);
      if (!id || !nome) return null;
      return { id, nome };
    })
    .filter(Boolean) as Evento[];
}

export async function loadCadastroFromSheets(): Promise<{
  gestores: Gestor[];
  colaboradores: Colaborador[];
  eventos: Evento[];
}> {
  const id = process.env.GOOGLE_SHEETS_CADASTRO_SPREADSHEET_ID!;
  const rg = process.env.GOOGLE_SHEETS_CADASTRO_GESTORES_RANGE!;
  const rc = process.env.GOOGLE_SHEETS_CADASTRO_COLABORADORES_RANGE!;
  const re = process.env.GOOGLE_SHEETS_CADASTRO_EVENTOS_RANGE!;

  const [gr, cr, er] = await Promise.all([
    fetchRange(id, rg),
    fetchRange(id, rc),
    fetchRange(id, re),
  ]);

  return {
    gestores: parseGestores(gr),
    colaboradores: parseColaboradores(cr),
    eventos: parseEventos(er),
  };
}
