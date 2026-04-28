import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { isFeriadoNacionalBr } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import { sendLancamentoReceiptEmail } from "@/lib/notifications/email";
import { sendAbatimentoReceiptEmail } from "@/lib/notifications/email";
import {
  appendLancamento,
  getCadastroData,
  getLancamentosData,
  updateLancamento,
  updateLancamentoAbatimento,
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
    if (access.isAdmin) return NextResponse.json({ ...data, isAdmin: true });
    if (!access.allowedGestorIds.length) {
      return NextResponse.json({ error: "Usuário sem permissão de gestor" }, { status: 403 });
    }
    const allowed = new Set(access.allowedGestorIds);
    return NextResponse.json({
      ...data,
      lancamentos: data.lancamentos.filter((l) => allowed.has(l.gestorId)),
      isAdmin: false,
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
  const feriado = isFeriadoNacionalBr(data);
  const dateObj = new Date(`${data}T12:00:00`);
  const isFimDeSemana = !Number.isNaN(dateObj.getTime()) && [0, 6].includes(dateObj.getDay());

  try {
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && !access.allowedGestorIds.length) {
      return NextResponse.json({ error: "Usuário sem permissão de gestor" }, { status: 403 });
    }
    if (!access.isAdmin && !access.allowedGestorIds.includes(gestorId)) {
      return NextResponse.json({ error: "Sem permissão para lançar para este gestor" }, { status: 403 });
    }
    const colab = cadastro.colaboradores.find((c) => c.id === colaboradorId);
    if (!colab || (!access.isAdmin && !access.allowedGestorIds.includes(colab.gestorId))) {
      return NextResponse.json({ error: "Colaborador não permitido para seu acesso" }, { status: 403 });
    }
    const folgaPJ = colab.regime === "PJ" && (feriado || isFimDeSemana);
    if (!folgaPJ && (!horaInicio || !horaFim)) {
      return NextResponse.json({ error: "Informe horário inicial e final" }, { status: 400 });
    }
    const horasCalculadas = folgaPJ ? 0 : calcHorasEntreHorarios(horaInicio!, horaFim!);
    if (!folgaPJ && horasCalculadas <= 0) {
      return NextResponse.json(
        { error: "Horário final deve ser após o inicial (ou turno após meia-noite)" },
        { status: 400 },
      );
    }
    if (!folgaPJ && horasCalculadas > 24) {
      return NextResponse.json({ error: "Intervalo não pode ultrapassar 24 horas" }, { status: 400 });
    }

    const result = await appendLancamento({
      gestorId,
      colaboradorId,
      eventoId,
      data,
      horaInicio: folgaPJ ? "" : horaInicio!,
      horaFim: folgaPJ ? "" : horaFim!,
      horas: horasCalculadas,
      periodo: periodo || "Integral",
      feriado,
      registradoPorEmail: session.user?.email,
    });
    const gestor = cadastro.gestores.find((g) => g.id === gestorId);
    const colaborador = cadastro.colaboradores.find((c) => c.id === colaboradorId);
    const evento = cadastro.eventos.find((e) => e.id === eventoId);
    const comprovanteEmail = session.user?.email?.trim();

    if (comprovanteEmail && gestor && colaborador && evento) {
      void sendLancamentoReceiptEmail({
        to: comprovanteEmail,
        gestorNome: gestor.nome,
        colaboradorNome: colaborador.nome,
        eventoNome: evento.nome,
        data,
        horaInicio,
        horaFim,
        horas: horasCalculadas,
        feriado,
        registradoPorEmail: session.user?.email,
        updatedRange: result.updatedRange,
      }).catch((err) => {
        console.error("[api/lancamentos] falha ao enviar comprovante por email", err);
      });
    }

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

  let body:
    | {
        tipo: "clt" | "pj_horas" | "pj_dias";
        gestorId?: string;
        colaboradorId?: string;
        eventoId?: string;
        valorAbatido?: number;
        horasAbatidas?: number;
        diasAbatidos?: number;
        diaFolgaPJ?: string;
        observacao?: string;
      }
    | { sheetRowNumber?: number; valorPago?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const email = session.user?.email?.trim().toLowerCase();
    if (!email || !isAllowedDomain(email)) {
      return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
    }
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && !access.allowedGestorIds.length) {
      return NextResponse.json({ error: "Usuário sem permissão de gestor" }, { status: 403 });
    }
    if (!access.isAdmin) {
      return NextResponse.json({ error: "Somente administradores podem realizar abatimentos" }, { status: 403 });
    }
    let result;
    if ("tipo" in body && (body.tipo === "clt" || body.tipo === "pj_horas" || body.tipo === "pj_dias")) {
      if (!body.gestorId || !body.colaboradorId || !body.eventoId) {
        return NextResponse.json({ error: "Dados obrigatórios do abatimento ausentes" }, { status: 400 });
      }
      const valorAbatido = Number(body.valorAbatido || 0);
      const horasAbatidas = Number(body.horasAbatidas || 0);
      const diasAbatidos = body.tipo === "pj_dias" ? 1 : Number(body.diasAbatidos || 0);
      if (
        (body.valorAbatido !== undefined && (!Number.isFinite(valorAbatido) || valorAbatido < 0)) ||
        (body.horasAbatidas !== undefined && (!Number.isFinite(horasAbatidas) || horasAbatidas < 0)) ||
        (body.diasAbatidos !== undefined && (!Number.isFinite(diasAbatidos) || diasAbatidos < 0))
      ) {
        return NextResponse.json({ error: "Valor/horas/dias de abatimento inválidos" }, { status: 400 });
      }
      if (valorAbatido <= 0 && horasAbatidas <= 0 && diasAbatidos <= 0) {
        return NextResponse.json({ error: "Informe valor e/ou horas e/ou dias para abatimento" }, { status: 400 });
      }
      if (!access.isAdmin && !access.allowedGestorIds.includes(body.gestorId)) {
        return NextResponse.json({ error: "Sem permissão para este gestor" }, { status: 403 });
      }
      if (body.tipo === "pj_dias" && (diasAbatidos <= 0 || !Number.isInteger(diasAbatidos))) {
        return NextResponse.json({ error: "Abatimento de dias PJ deve ser inteiro." }, { status: 400 });
      }
      if (body.tipo === "pj_dias") {
        const diaFolga = (body.diaFolgaPJ || "").trim();
        if (!diaFolga || !/^\d{4}-\d{2}-\d{2}$/.test(diaFolga)) {
          return NextResponse.json({ error: "Informe uma data válida para o Dia de Folga (PJ)." }, { status: 400 });
        }
      }
      result = await updateLancamentoAbatimento({
        tipo: body.tipo,
        gestorId: body.gestorId,
        colaboradorId: body.colaboradorId,
        eventoId: body.eventoId,
        valorAbatido,
        horasAbatidas,
        diasAbatidos,
        diaFolgaPJ: body.tipo === "pj_dias" ? body.diaFolgaPJ : undefined,
        observacao: typeof body.observacao === "string" ? body.observacao : undefined,
      });
      const comprovanteEmail = session.user?.email?.trim();
      if (comprovanteEmail) {
        const gestor = cadastro.gestores.find((g) => g.id === body.gestorId);
        const colaborador = cadastro.colaboradores.find((c) => c.id === body.colaboradorId);
        const evento = cadastro.eventos.find((e) => e.id === body.eventoId);
        const hoje = new Date();
        const dataAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
        if (gestor && colaborador && evento) {
          void sendAbatimentoReceiptEmail({
            to: comprovanteEmail,
            gestorNome: gestor.nome,
            colaboradorNome: colaborador.nome,
            eventoNome: evento.nome,
            data: dataAtual,
            valorAbatido,
            horasAbatidas,
            diasAbatidos,
            diaFolgaPJ: body.tipo === "pj_dias" ? body.diaFolgaPJ : undefined,
            observacao: typeof body.observacao === "string" ? body.observacao.trim() : undefined,
            registradoPorEmail: session.user?.email,
          }).catch(() => undefined);
        }
      }
    } else {
      return NextResponse.json({ error: "Formato de PATCH inválido para abatimento" }, { status: 400 });
    }
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
  const feriado = isFeriadoNacionalBr(data);
  const dateObj = new Date(`${data}T12:00:00`);
  const isFimDeSemana = !Number.isNaN(dateObj.getTime()) && [0, 6].includes(dateObj.getDay());

  try {
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin && !access.allowedGestorIds.length) {
      return NextResponse.json({ error: "Usuário sem permissão de gestor" }, { status: 403 });
    }
    if (!access.isAdmin && !access.allowedGestorIds.includes(gestorId)) {
      return NextResponse.json({ error: "Sem permissão para editar este gestor" }, { status: 403 });
    }
    const colab = cadastro.colaboradores.find((c) => c.id === colaboradorId);
    if (!colab || (!access.isAdmin && !access.allowedGestorIds.includes(colab.gestorId))) {
      return NextResponse.json({ error: "Colaborador não permitido para seu acesso" }, { status: 403 });
    }
    const folgaPJ = colab.regime === "PJ" && (feriado || isFimDeSemana);
    if (!folgaPJ && (!horaInicio || !horaFim)) {
      return NextResponse.json({ error: "Informe horário inicial e final" }, { status: 400 });
    }
    const horasCalculadas = folgaPJ ? 0 : calcHorasEntreHorarios(horaInicio!, horaFim!);
    if (!folgaPJ && horasCalculadas <= 0) {
      return NextResponse.json(
        { error: "Horário final deve ser após o inicial (ou turno após meia-noite)" },
        { status: 400 },
      );
    }
    if (!folgaPJ && horasCalculadas > 24) {
      return NextResponse.json({ error: "Intervalo não pode ultrapassar 24 horas" }, { status: 400 });
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
      horaInicio: folgaPJ ? "" : horaInicio!,
      horaFim: folgaPJ ? "" : horaFim!,
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
