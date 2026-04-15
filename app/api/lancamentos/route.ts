import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { isFeriadoNacionalBr } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import {
  appendLancamento,
  getCadastroData,
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
    const email = session.user?.email?.trim().toLowerCase();
    if (!email || !isAllowedDomain(email)) {
      return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
    }
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (access.isAdmin) return NextResponse.json(data);
    const allowed = new Set(access.allowedGestorIds);
    return NextResponse.json({
      ...data,
      lancamentos: data.lancamentos.filter((l) => allowed.has(l.gestorId)),
    });
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
  const email = session.user?.email?.trim().toLowerCase();
  if (!email || !isAllowedDomain(email)) {
    return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
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
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && !access.allowedGestorIds.includes(gestorId)) {
      return NextResponse.json({ error: "Sem permissão para lançar para este gestor" }, { status: 403 });
    }
    const colab = cadastro.colaboradores.find((c) => c.id === colaboradorId);
    if (!colab || (!access.isAdmin && !access.allowedGestorIds.includes(colab.gestorId))) {
      return NextResponse.json({ error: "Colaborador não permitido para seu acesso" }, { status: 403 });
    }

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
    const email = session.user?.email?.trim().toLowerCase();
    if (!email || !isAllowedDomain(email)) {
      return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
    }
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin) {
      const data = await getLancamentosData();
      const target = data.lancamentos.find((l) => l.sheetRowNumber === body.sheetRowNumber);
      if (!target || !access.allowedGestorIds.includes(target.gestorId)) {
        return NextResponse.json({ error: "Sem permissão para alterar este lançamento" }, { status: 403 });
      }
    }

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
  const email = session.user?.email?.trim().toLowerCase();
  if (!email || !isAllowedDomain(email)) {
    return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
  }
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
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && !access.allowedGestorIds.includes(gestorId)) {
      return NextResponse.json({ error: "Sem permissão para editar este gestor" }, { status: 403 });
    }
    if (!access.isAdmin) {
      const dataLanc = await getLancamentosData();
      const target = dataLanc.lancamentos.find((l) => l.sheetRowNumber === sheetRowNumber);
      if (!target || !access.allowedGestorIds.includes(target.gestorId)) {
        return NextResponse.json({ error: "Sem permissão para editar este lançamento" }, { status: 403 });
      }
    }

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
