"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm bg-card rounded-lg border border-border p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground text-center mb-1">Horas Extras</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Entre com sua conta Google para continuar.
        </p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/lancamento" })}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Continuar com Google
        </button>
      </div>
    </div>
  );
}
