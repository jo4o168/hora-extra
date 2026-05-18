"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, LockKeyhole, ShieldAlert } from "lucide-react";

const MENSAGENS: Record<string, string> = {
  dominio:
    "Seu e-mail não pertence aos domínios autorizados para uso desta plataforma.",
  permissao:
    "Seu usuário está autenticado, mas não possui permissão de acesso no momento.",
  email: "Não foi possível validar o seu e-mail corporativo.",
  configuracao:
    "O acesso não pôde ser validado devido a uma configuração pendente do ambiente.",
};

export default function AcessoNegadoPage() {
  const params = useSearchParams();
  const motivo = params.get("motivo") ?? "";
  const mensagem =
    MENSAGENS[motivo] ??
    "Você não tem permissão para acessar este sistema. Se acredita que isso é um engano, fale com o administrador.";

  return (
    <div className="min-h-screen bg-background p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--destructive)/0.10)_0,_transparent_45%)]" />
      <div className="relative min-h-[calc(100vh-3rem)] max-w-3xl mx-auto grid items-center">
        <section className="w-full">
          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="h-6 w-6 text-destructive" />
              <h1 className="text-2xl font-semibold text-foreground">Acesso não autorizado</h1>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{mensagem}</p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-3 items-start">
                <LockKeyhole className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Esta plataforma é restrita para usuários autenticados e autorizados.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3 flex gap-3 items-start">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Se seu acesso deveria estar liberado, peça ao administrador para revisar seu e-mail e permissões.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Voltar para login
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

