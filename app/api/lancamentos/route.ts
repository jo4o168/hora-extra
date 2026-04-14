import { auth } from "@/auth";
import { isFeriadoNacionalBr } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import { appendLancamento, getLancamentosData, type NovoLancamentoInput } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const data = await getLancamentosData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: Partial<NovoLancamentoInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { gestorId, colaboradorId, eventoId, data, periodo, horaInicio, horaFim } = body;
  if (!gestorId || !colaboradorId || !eventoId || !data || !periodo) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }
  if (!horaInicio || !horaFim) {
    return NextResponse.json({ error: "Informe horário inicial e final" }, { status: 400 });
  }

  const horasCalculadas = calcHorasEntreHorarios(horaInicio, horaFim);
  if (horasCalculadas <= 0) {
    return NextResponse.json({ error: "Horário final deve ser após o inicial (ou turno após meia-noite)" }, { status: 400 });
  }
  if (horasCalculadas > 24) {
    return NextResponse.json({ error: "Intervalo não pode ultrapassar 24 horas" }, { status: 400 });
  }

  const feriado = isFeriadoNacionalBr(data);

  try {
    const result = await appendLancamento({
      gestorId,
      colaboradorId,
      eventoId,
      data,
      horaInicio,
      horaFim,
      horas: horasCalculadas,
      periodo,
      feriado,
      registradoPorEmail: session.user?.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Falha ao registrar" }, { status: 500 });
  }
}
