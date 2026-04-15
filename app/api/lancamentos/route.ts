import { auth } from "@/auth";
import { isFeriadoNacionalBr } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import {
  appendLancamento,
  getLancamentosData,
  updateLancamento,
  updateLancamentoPagamento,
  type NovoLancamentoInput,
} from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const data = await getLancamentosData();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao carregar lançamentos no Google Sheets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  if (!gestorId || !colaboradorId || !eventoId || !data) {
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
      periodo: periodo || "Integral",
      feriado,
      registradoPorEmail: session.user?.email,
    });
    console.log("[api/lancamentos] append ok:", result.updatedRange ?? "sem updatedRange");
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Falha ao registrar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { sheetRowNumber?: number; pago?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.sheetRowNumber || typeof body.sheetRowNumber !== "number") {
    return NextResponse.json({ error: "sheetRowNumber inválido" }, { status: 400 });
  }
  if (typeof body.pago !== "boolean") {
    return NextResponse.json({ error: "pago deve ser booleano" }, { status: 400 });
  }

  try {
    const result = await updateLancamentoPagamento({
      sheetRowNumber: body.sheetRowNumber,
      pago: body.pago,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao atualizar pagamento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: Partial<NovoLancamentoInput> & { sheetRowNumber?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { gestorId, colaboradorId, eventoId, data, periodo, horaInicio, horaFim, sheetRowNumber } = body;
  if (!sheetRowNumber || typeof sheetRowNumber !== "number") {
    return NextResponse.json({ error: "sheetRowNumber inválido" }, { status: 400 });
  }
  if (!gestorId || !colaboradorId || !eventoId || !data) {
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
    const result = await updateLancamento({
      sheetRowNumber,
      gestorId,
      colaboradorId,
      eventoId,
      data,
      horaInicio,
      horaFim,
      horas: horasCalculadas,
      periodo: periodo || "Integral",
      feriado,
      registradoPorEmail: session.user?.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao atualizar lançamento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
