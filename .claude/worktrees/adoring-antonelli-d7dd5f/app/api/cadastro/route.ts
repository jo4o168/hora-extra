import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const data = await getCadastroData();
    const email = session.user?.email?.trim().toLowerCase();
    if (!email || !isAllowedDomain(email)) {
      return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
    }
    const access = resolveAccessScope({ email, cadastro: data });
    if (access.isAdmin) return NextResponse.json(data);

    if (!access.allowedGestorIds.length) {
      return NextResponse.json({ error: "Usuário sem permissão de gestor" }, { status: 403 });
    }
    const allowed = new Set(access.allowedGestorIds);
    const filtered = {
      ...data,
      gestores: data.gestores.filter((g) => allowed.has(g.id)),
      colaboradores: data.colaboradores.filter((c) => allowed.has(c.gestorId)),
    };
    return NextResponse.json(filtered);
  } catch (e) {
    console.error("[api/cadastro] erro ao carregar cadastro:", e);
    const message = e instanceof Error ? e.message : "Falha ao carregar cadastro no Google Sheets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
