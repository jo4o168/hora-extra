import Google from "@auth/core/providers/google";
import NextAuth from "next-auth";
import { isAllowedDomain, resolveAccessScope } from "@/lib/authz/access";
import { getCadastroData } from "@/lib/sheets/service";

function resolveAuthSecret(): string {
  const fromEnv = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET)?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Defina AUTH_SECRET (ou NEXTAUTH_SECRET) no ambiente antes de rodar em produção. Veja .env.example",
    );
  }

  console.warn(
    "[auth] AUTH_SECRET não definido — usando segredo fixo só para desenvolvimento. Crie .env.local com AUTH_SECRET=... (ex.: openssl rand -base64 32)",
  );
  return "hora-extra-dev-only-secret-not-for-production";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email ?? "").trim().toLowerCase();
      if (!email) return "/acesso-negado?motivo=email";
      if (!isAllowedDomain(email)) return "/acesso-negado?motivo=dominio";

      try {
        const cadastro = await getCadastroData();
        const access = resolveAccessScope({ email, cadastro });
        if (!access.isAdmin && access.allowedGestorIds.length === 0) {
          return "/acesso-negado?motivo=permissao";
        }
        return true;
      } catch {
        return "/acesso-negado?motivo=configuracao";
      }
    },
  },
});
