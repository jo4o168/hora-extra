import nodemailer from "nodemailer";

type LancamentoReceiptPayload = {
  to: string;
  gestorNome: string;
  colaboradorNome: string;
  eventoNome: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  horas: number;
  feriado: boolean;
  registradoPorEmail?: string | null;
  updatedRange?: string;
};

let transporter: nodemailer.Transporter | null = null;

function isEmailNotificationsEnabled(): boolean {
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!host || !portRaw || !user || !pass || !from) {
    return null;
  }
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

function getTransporter() {
  if (transporter) return transporter;
  const cfg = smtpConfig();
  if (!cfg) return null;

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
  return transporter;
}

function formatHoras(horas: number): string {
  const h = Math.floor(horas);
  const min = Math.round((horas - h) * 60);
  return `${h}h${String(min).padStart(2, "0")}min`;
}

export async function sendLancamentoReceiptEmail(payload: LancamentoReceiptPayload): Promise<void> {
  if (!isEmailNotificationsEnabled()) return;
  const cfg = smtpConfig();
  if (!cfg) {
    console.warn("[email] SMTP não configurado; envio de comprovante ignorado.");
    return;
  }
  const tx = getTransporter();
  if (!tx) return;

  const subject = `Comprovante de lancamento de hora extra - ${payload.data}`;
  const text = [
    "Seu lançamento foi registrado com sucesso.",
    "",
    `Gestor: ${payload.gestorNome}`,
    `Colaborador: ${payload.colaboradorNome}`,
    `Evento: ${payload.eventoNome}`,
    `Data: ${payload.data}`,
    `Inicio: ${payload.horaInicio}`,
    `Fim: ${payload.horaFim}`,
    `Total: ${formatHoras(payload.horas)} (${payload.horas.toFixed(2)}h)`,
    `Feriado nacional: ${payload.feriado ? "Sim" : "Não"}`,
    payload.updatedRange ? `Referencia da planilha: ${payload.updatedRange}` : undefined,
    payload.registradoPorEmail ? `Registrado por: ${payload.registradoPorEmail}` : undefined,
    "",
    "Este e-mail serve como comprovante do envio.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
      <h2 style="margin:0 0 12px">Comprovante de lançamento</h2>
      <p style="margin:0 0 12px">Seu lançamento foi registrado com sucesso.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0"><strong>Gestor</strong></td><td>${payload.gestorNome}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Colaborador</strong></td><td>${payload.colaboradorNome}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Evento</strong></td><td>${payload.eventoNome}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Data</strong></td><td>${payload.data}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Início</strong></td><td>${payload.horaInicio}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Fim</strong></td><td>${payload.horaFim}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Total</strong></td><td>${formatHoras(payload.horas)} (${payload.horas.toFixed(2)}h)</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Feriado</strong></td><td>${payload.feriado ? "Sim" : "Não"}</td></tr>
        ${payload.updatedRange ? `<tr><td style="padding:4px 12px 4px 0"><strong>Referência</strong></td><td>${payload.updatedRange}</td></tr>` : ""}
      </table>
      <p style="margin-top:14px;font-size:12px;color:#6b7280">Este e-mail serve como comprovante do envio.</p>
    </div>
  `;

  await tx.sendMail({
    from: cfg.from,
    to: payload.to,
    subject,
    text,
    html,
  });
}

type AbatimentoReceiptPayload = {
  to: string;
  gestorNome: string;
  colaboradorNome: string;
  eventoNome: string;
  data: string;
  valorAbatido?: number;
  horasAbatidas?: number;
  diasAbatidos?: number;
  registradoPorEmail?: string | null;
};

export async function sendAbatimentoReceiptEmail(payload: AbatimentoReceiptPayload): Promise<void> {
  if (!isEmailNotificationsEnabled()) return;
  const cfg = smtpConfig();
  if (!cfg) return;
  const tx = getTransporter();
  if (!tx) return;

  const partes: string[] = [];
  if ((payload.valorAbatido || 0) > 0) {
    partes.push(`Valor abatido: R$ ${(payload.valorAbatido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  }
  if ((payload.horasAbatidas || 0) > 0) {
    partes.push(`Horas abatidas: ${formatHoras(payload.horasAbatidas || 0)}`);
  }
  if ((payload.diasAbatidos || 0) > 0) {
    partes.push(`Dias abatidos: ${payload.diasAbatidos} dia(s)`);
  }

  const tipoPerfil = (payload.diasAbatidos || 0) > 0 ? "PJ" : "CLT/PJ";
  const subject = `[Hora Extra Certa] Comprovante de Abatimento (${tipoPerfil}) - ${payload.data}`;
  const text = [
    "Seu abatimento foi registrado com sucesso.",
    "",
    `Tipo: Abatimento`,
    `Gestor: ${payload.gestorNome}`,
    `Colaborador: ${payload.colaboradorNome}`,
    `Evento: ${payload.eventoNome}`,
    `Data: ${payload.data}`,
    ...partes,
    payload.registradoPorEmail ? `Registrado por: ${payload.registradoPorEmail}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  await tx.sendMail({
    from: cfg.from,
    to: payload.to,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5"><h2>Comprovante de abatimento</h2><p>${text.replace(/\n/g, "<br/>")}</p></div>`,
  });
}
