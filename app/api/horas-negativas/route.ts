import { auth } from "@/auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { sendHoraNegativaReceiptEmail } from "@/lib/notifications/email";
import { appendHoraNegativa, getCadastroData } from "@/lib/sheets/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: {
    gestorId?: string;
    colaboradorId?: string;
    data?: string;
    horas?: number;
    observacao?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = session.user?.email?.trim().toLowerCase();
  if (!email || !isAllowedDomain(email)) {
    return NextResponse.json({ error: "Acesso negado para este e-mail" }, { status: 403 });
  }

  const { gestorId, colaboradorId, data, horas, observacao } = body;
  if (!gestorId || !colaboradorId || !data) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }
  const horasNum = Number(horas);
  if (!Number.isFinite(horasNum) || horasNum <= 0) {
    return NextResponse.json({ error: "Informe horas válidas (maior que zero)" }, { status: 400 });
  }
  if (horasNum > 24) {
    return NextResponse.json({ error: "Hora negativa não pode ultrapassar 24 horas" }, { status: 400 });
  }

  try {
    const cadastro = await getCadastroData();
    const access = resolveAccessScope({ email, cadastro });
    if (!access.isAdmin) {
      return NextResponse.json(
        { error: "Somente administradores podem registrar horas negativas" },
        { status: 403 },
      );
    }

    const colab = cadastro.colaboradores.find((c) => c.id === colaboradorId);
    if (!colab) {
      return NextResponse.json({ error: "Colaborador inválido" }, { status: 400 });
    }
    if (colab.regime !== "CLT") {
      return NextResponse.json(
        { error: "Hora negativa só pode ser registrada para CLT" },
        { status: 400 },
      );
    }
    const gestor = cadastro.gestores.find((g) => g.id === gestorId);
    if (!gestor) {
      return NextResponse.json({ error: "Gestor inválido" }, { status: 400 });
    }

    const result = await appendHoraNegativa({
      gestorId,
      colaboradorId,
      data,
      horas: horasNum,
      observacao,
      registradoPorEmail: session.user?.email,
    });

    const comprovanteEmail = session.user?.email?.trim();
    if (comprovanteEmail) {
      void sendHoraNegativaReceiptEmail({
        to: comprovanteEmail,
        gestorNome: gestor.nome,
        colaboradorNome: colab.nome,
        data,
        horas: horasNum,
        observacao: typeof observacao === "string" ? observacao.trim() : undefined,
        registradoPorEmail: session.user?.email,
      }).catch((err) => {
        console.error("[api/horas-negativas] falha ao enviar comprovante", err);
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/horas-negativas] erro:", e);
    const message = e instanceof Error ? e.message : "Falha ao registrar hora negativa";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
