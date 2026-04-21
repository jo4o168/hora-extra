"use client";

import { signIn } from "next-auth/react";
import { BarChart3, Clock3, Moon, ShieldCheck, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = resolvedTheme === "dark";

  const handleLogin = () => {
    void signIn("google", { callbackUrl: "/lancamento" });
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.14)_0,_transparent_45%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_hsl(var(--accent)/0.12)_0,_transparent_40%)]" />

      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          aria-label={mounted ? (isDark ? "Ativar modo claro" : "Ativar modo escuro") : "Alternar tema"}
        >
          {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : (
            <Moon className="h-4 w-4" />
          )}
          {mounted ? (isDark ? "Modo claro" : "Modo escuro") : "Modo escuro"}
        </button>
      </div>

      <div className="relative min-h-[calc(100vh-3rem)] max-w-5xl mx-auto grid gap-6 lg:gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="w-full max-w-md justify-self-center lg:justify-self-end order-1 lg:order-2 flex items-center justify-center py-10 sm:py-12 lg:py-0">
          <div className="w-full bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-lg shadow-primary/10">
            <div className="flex items-center justify-center mb-4">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Clock3 className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-foreground text-center mb-1">Hora Extra Certa</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Entre com sua conta Google para continuar.
            </p>
            <button
              type="button"
              onClick={handleLogin}
              className="w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Continuar com Google
            </button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Você será redirecionado para autenticação do Google.
            </p>
          </div>
        </section>

        <section className="lg:pr-8 order-2 lg:order-1 lg:self-center">
          <p className="inline-flex items-center rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            Plataforma interna
          </p>
          <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Gestão de horas extras com visão clara e dados reais.
          </h1>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base text-muted-foreground max-w-xl">
            Lançamentos e relatórios centralizados, com integração ao Google Sheets e autenticação segura com Google.
          </p>
          <div className="mt-6 sm:mt-8 grid gap-3 max-w-lg sm:grid-cols-2 lg:grid-cols-1">
            {[
              { icon: Clock3, text: "Registro rápido de horas por colaborador e evento." },
              { icon: BarChart3, text: "Relatórios consolidados para acompanhamento de custos." },
              { icon: ShieldCheck, text: "Acesso restrito por conta corporativa do Google." },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 shadow-sm"
              >
                <item.icon className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
