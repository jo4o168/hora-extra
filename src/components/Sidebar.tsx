"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { BarChart3, Clock, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { href: "/lancamento", label: "Lançar horas", icon: Clock },
  { href: "/relatorio", label: "Relatórios", icon: BarChart3 },
];

function initials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = resolvedTheme === "dark";
  const displayName = session?.user?.name ?? session?.user?.email ?? "Conta Google";
  const sub = session?.user?.email ?? "";

  const ThemeToggle = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
    >
      {mounted ? (isDark ? <Sun size={16} /> : <Moon size={16} />) : <Moon size={16} />}
      {mounted ? (isDark ? "Modo claro" : "Modo escuro") : "Modo escuro"}
    </button>
  );

  const ThemeToggleIcon = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      aria-label={mounted ? (isDark ? "Ativar modo claro" : "Ativar modo escuro") : "Alternar tema"}
      title={mounted ? (isDark ? "Modo claro" : "Modo escuro") : "Modo escuro"}
    >
      {mounted ? (isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />) : <Moon className="h-5 w-5" />}
    </button>
  );

  const SignOutButton = (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
    >
      <LogOut size={16} />
      Sair
    </button>
  );

  const Nav = ({ closeOnNavigate }: { closeOnNavigate?: boolean }) => (
    <nav className="flex-1 px-3 space-y-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const linkEl = (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive ? "bg-sidebar-active text-sidebar-active-text" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </Link>
        );
        return closeOnNavigate ? (
          <SheetClose key={item.href} asChild>
            {linkEl}
          </SheetClose>
        ) : (
          linkEl
        );
      })}
    </nav>
  );

  const Footer = (
    <div className="px-4 py-4 border-t border-border space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
          {initials(session?.user?.name, session?.user?.email)}
        </div>
        <div className="text-sm min-w-0 flex-1">
          <p className="font-medium text-foreground leading-tight truncate">{displayName}</p>
          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        </div>
      </div>
      {ThemeToggle}
      {SignOutButton}
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden">
        <div className="h-16 px-4 flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                aria-label="Abrir menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <aside className="h-full bg-card flex flex-col">
                <div className="px-5 pt-6 pb-4">
                  <h1 className="text-lg font-bold text-primary">Horas Extras</h1>
                  <p className="text-xs text-muted-foreground">Controle interno</p>
                </div>
                <Nav closeOnNavigate />
                {Footer}
              </aside>
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Horas Extras</p>
            <p className="text-xs text-muted-foreground truncate">{sub || "Conta Google"}</p>
          </div>
          <div className="ml-auto">{ThemeToggleIcon}</div>
        </div>
      </div>

      <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-card border-r border-border flex flex-col z-50 max-md:hidden">
        <div className="px-5 pt-6 pb-4">
          <h1 className="text-lg font-bold text-primary">Horas Extras</h1>
          <p className="text-xs text-muted-foreground">Controle interno</p>
        </div>

        <Nav />
        {Footer}
      </aside>
    </>
  );
}
