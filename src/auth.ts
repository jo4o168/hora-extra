import Google from "@auth/core/providers/google";
import NextAuth from "next-auth";

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
});
