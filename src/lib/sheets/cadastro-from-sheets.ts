import type { Colaborador, Evento, Gestor } from "@/lib/domain/types";
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

function normalizeEntityId(value: string): string {
  return value.trim().replace(/\.0+$/, "");
}

function normalizeStatus(raw: string): string {
  const value = (raw || "").trim();
  if (!value) return "";
  const lowered = value.toLowerCase().replaceAll("não", "nao");
  if (lowered.startsWith("nao") || lowered.includes("inativo") || lowered.includes("deslig") || lowered.includes("afast")) {
    return "Não ativo";
  }
  if (lowered.includes("ativo")) return "Ativo";
  return value;
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
      const email = pick(o, ["email", "e_mail", "gestor_email", "email_gestor"]).toLowerCase();
      if (!id || !nome) return null;
      return { id: normalizeEntityId(id), nome, email: email || undefined };
    })
    .filter(Boolean) as Gestor[];
}

function parseColaboradores(rows: string[][], gestores: Gestor[]): Colaborador[] {
  const objs = rowsToObjects(rows);
  return objs
    .map((o) => {
      const id = pick(o, ["id", "colaborador_id", "codigo", "matricula"]);
      const nome = pick(o, ["nome", "nome_completo", "colaborador", "nome_colaborador"]);
      const cargo = pick(o, ["cargo", "funcao", "função"]) || "—";
      const regimeRaw = pick(o, ["regime", "tipo", "clt_pj", "regime_cltpj"]).toUpperCase();
      const regime = regimeRaw.includes("PJ") ? "PJ" : "CLT";
      const status = normalizeStatus(pick(o, ["status", "situacao", "situação"]));
      const gestorRef = pick(o, [
        "gestor_id",
        "gestorid",
        "id_gestor",
        "gestor_responsavel",
        "gestor_responsável",
        "gestor",
        "nome_gestor",
      ]);
      const gestorMatch =
        gestores.find((g) => normalizeEntityId(g.id) === normalizeEntityId(gestorRef)) ||
        gestores.find((g) => g.nome.trim().toLowerCase() === gestorRef.trim().toLowerCase());
      const gestorId = gestorMatch?.id || normalizeEntityId(gestorRef);

      const valorBase = parseNumberBr(
        pick(o, [
          "salario",
          "salário",
          "salario_base",
          "salario_valor_hora_r",
          "salario__valor_hora_r",
          "salario_valor_hora",
        ]),
      );
      const salario = valorBase;
      const valorHoraRaw = pick(o, ["valor_hora", "valorhora", "valor_h", "salario_valor_hora_r"]);
      const valorHora = parseNumberBr(valorHoraRaw);
      if (!id || !nome || !gestorId) return null;
      const c: Colaborador = {
        id,
        nome,
        cargo,
        regime,
        salario,
        gestorId: normalizeEntityId(gestorId),
        status: status || undefined,
      };
      if (regime === "PJ") c.valorHora = valorHora > 0 ? valorHora : valorBase;
      c.id = normalizeEntityId(c.id);
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
      return { id: normalizeEntityId(id), nome };
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

  const gestores = parseGestores(gr);
  return {
    gestores,
    colaboradores: parseColaboradores(cr, gestores),
    eventos: parseEventos(er),
  };
}
