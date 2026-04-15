import type { CadastroResponse } from "@/lib/sheets/service";

export type AccessScope = {
  email: string;
  isAdmin: boolean;
  allowedGestorIds: string[];
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseGestorMapEnv(name: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const raw = process.env[name] ?? "";
  raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [emailPart, gestoresPart] = entry.split("=");
      if (!emailPart || !gestoresPart) return;
      const email = normalizeEmail(emailPart);
      const gestores = gestoresPart
        .split("|")
        .map((v) => v.trim())
        .filter(Boolean);
      if (email && gestores.length) map.set(email, gestores);
    });
  return map;
}

export function isAllowedDomain(email: string): boolean {
  const allowedDomains = parseCsvEnv("ACCESS_ALLOWED_EMAIL_DOMAINS");
  if (!allowedDomains.length) return true;
  const normalizedEmail = normalizeEmail(email);
  const domain = normalizedEmail.split("@")[1] ?? "";
  return allowedDomains.map((d) => d.toLowerCase()).includes(domain);
}

export function resolveAccessScope(input: {
  email: string;
  cadastro: CadastroResponse;
}): AccessScope {
  const email = normalizeEmail(input.email);
  const adminEmails = parseCsvEnv("ACCESS_ADMIN_EMAILS").map((e) => e.toLowerCase());
  const isAdmin = adminEmails.includes(email);
  if (isAdmin) {
    return {
      email,
      isAdmin: true,
      allowedGestorIds: input.cadastro.gestores.map((g) => g.id),
    };
  }

  const byGestorEmail = input.cadastro.gestores
    .filter((g) => (g.email ?? "").trim().toLowerCase() === email)
    .map((g) => g.id);
  const envMap = parseGestorMapEnv("ACCESS_USER_GESTOR_IDS");
  const byEnv = envMap.get(email) ?? [];
  const allowedGestorIds = Array.from(new Set([...byGestorEmail, ...byEnv]));
  return {
    email,
    isAdmin: false,
    allowedGestorIds,
  };
}

