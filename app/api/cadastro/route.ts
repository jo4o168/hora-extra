import { auth } from "@/auth";
import { getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const data = await getCadastroData();
    return NextResponse.json(data);
  } catch (e) {
    console.error("[api/cadastro] erro ao carregar cadastro:", e);
    const message = e instanceof Error ? e.message : "Falha ao carregar cadastro no Google Sheets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
