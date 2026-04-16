"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import type { Session } from "next-auth";
import { useState } from "react";
import InactivityLogout from "./InactivityLogout";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider session={session}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <QueryClientProvider client={queryClient}>
          <InactivityLogout />
          {children}
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
