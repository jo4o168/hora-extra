import { auth } from "@/auth";
import { getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const data = await getCadastroData();
  return NextResponse.json(data);
}
