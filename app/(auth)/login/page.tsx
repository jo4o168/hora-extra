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

  return (
    <div className="min-h-screen bg-background p-6 relative overflow-hidden">
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

      <div className="relative min-h-[calc(100vh-3rem)] max-w-5xl mx-auto grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden lg:block pr-8">
          <p className="inline-flex items-center rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            Plataforma interna
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground">
            Gestão de horas extras com visão clara e dados reais.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl">
            Lançamentos e relatórios centralizados, com integração ao Google Sheets e autenticação
            segura com Google.
          </p>
          <div className="mt-8 grid gap-3 max-w-lg">
            {[
              { icon: Clock3, text: "Registro rápido de horas por colaborador e evento." },
              { icon: BarChart3, text: "Relatórios consolidados para acompanhamento de custos." },
              { icon: ShieldCheck, text: "Acesso restrito por conta corporativa do Google." },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3 rounded-lg border border-border bg-card/70 px-4 py-3">
                <item.icon className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="w-full max-w-md justify-self-center">
          <div className="bg-card rounded-2xl border border-border p-8 shadow-lg shadow-primary/10">
            <h2 className="text-2xl font-semibold text-foreground text-center mb-1">Hora Extra Certa</h2>
            <p className="text-sm text-muted-foreground text-center mb-8">
              Entre com sua conta Google para continuar.
            </p>
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/lancamento" })}
              className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Continuar com Google
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
