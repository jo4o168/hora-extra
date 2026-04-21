"use client";

import Sidebar from "./Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="p-4 pt-20 md:ml-[220px] md:p-8 md:pt-8">{children}</main>
    </div>
  );
}
