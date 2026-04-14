"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { LancamentoRow } from "@/lib/sheets/types";

const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const PIE_COLORS = ["#185FA5", "#548235", "#D4A017", "#9B59B6", "#E67E22"];

function Badge({ regime }: { regime: string }) {
  const cls =
    regime === "CLT"
      ? "bg-[#E2EFDA] text-[#27500A]"
      : "bg-[#E6F1FB] text-[#0C447C]";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{regime}</span>
  );
}

export default function RelatorioPage() {
  const [mesSelecionado, setMesSelecionado] = useState(5);
  const [gestorFiltro, setGestorFiltro] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const r = await fetch("/api/lancamentos", { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar");
      return r.json() as Promise<{
        lancamentos: LancamentoRow[];
        source: string;
      }>;
    },
  });

  const lancamentos = useMemo(() => {
    const list = data?.lancamentos ?? [];
    return list.filter((l) => {
      const mes = new Date(l.data + "T12:00:00").getMonth();
      if (mes !== mesSelecionado) return false;
      if (gestorFiltro && l.gestorId !== gestorFiltro) return false;
      return true;
    });
  }, [data?.lancamentos, mesSelecionado, gestorFiltro]);

  const gestoresOptions = useMemo(() => {
    const map = new Map<string, string>();
    (data?.lancamentos ?? []).forEach((l) => map.set(l.gestorId, l.gestorNome));
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [data?.lancamentos]);

  const totalHoras = lancamentos.reduce((s, l) => s + l.horas, 0);
  const totalValor = lancamentos.reduce((s, l) => s + l.valor, 0);
  const colabsAtivos = [...new Set(lancamentos.map((l) => l.colaboradorId))];
  const uniqueColabIds = [...new Set(lancamentos.map((l) => l.colaboradorId))];
  const cltUnique = uniqueColabIds.filter((id) => {
    const row = lancamentos.find((l) => l.colaboradorId === id);
    return row?.regime === "CLT";
  }).length;
  const pjCount = uniqueColabIds.filter((id) => {
    const row = lancamentos.find((l) => l.colaboradorId === id);
    return row?.regime === "PJ";
  }).length;
  const totalEventos = [...new Set(lancamentos.map((l) => l.eventoId))].length;

  const horasPorColab = useMemo(() => {
    const map = new Map<string, { nome: string; horas: number; regime: string }>();
    lancamentos.forEach((l) => {
      const entry = map.get(l.colaboradorId) || {
        nome: l.colaboradorNome,
        horas: 0,
        regime: l.regime,
      };
      entry.horas += l.horas;
      map.set(l.colaboradorId, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.horas - a.horas);
  }, [lancamentos]);

  const horasPorEvento = useMemo(() => {
    const map = new Map<string, { nome: string; horas: number }>();
    lancamentos.forEach((l) => {
      const entry = map.get(l.eventoId) || { nome: l.eventoNome, horas: 0 };
      entry.horas += l.horas;
      map.set(l.eventoId, entry);
    });
    return Array.from(map.values());
  }, [lancamentos]);

  const cardClass = "bg-card rounded-lg border-[0.5px] border-border p-5";
  const metricClass = "rounded-lg bg-metric p-4";

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-6">Relatórios</h2>
        <p className="text-sm text-muted-foreground">Carregando dados…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Relatórios e resultados</h2>
          {data?.source === "mock" && (
            <p className="text-xs text-muted-foreground mt-1">
              Dados de demonstração; conecte o Google Sheets para ver os lançamentos reais.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {MESES.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => setMesSelecionado(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === mesSelecionado
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <select
            value={gestorFiltro}
            onChange={(e) => setGestorFiltro(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
          >
            <option value="">Todos os gestores</option>
            {gestoresOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6 max-lg:grid-cols-2">
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Total de horas</p>
          <p className="text-2xl font-bold text-foreground">{totalHoras}h</p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Valor (referência)</p>
          <p className="text-2xl font-bold text-foreground">
            R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Colaboradores ativos</p>
          <p className="text-2xl font-bold text-foreground">{colabsAtivos.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {cltUnique} CLT · {pjCount} PJ
          </p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Eventos no período</p>
          <p className="text-2xl font-bold text-foreground">{totalEventos}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 max-lg:grid-cols-1">
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Horas por colaborador</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={horasPorColab} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip formatter={(value: number) => [`${value}h`, "Horas"]} />
              <Bar dataKey="horas" radius={[0, 4, 4, 0]} barSize={20}>
                {horasPorColab.map((entry, i) => (
                  <Cell key={i} fill={entry.regime === "CLT" ? "#185FA5" : "#548235"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por evento</h3>
          <div className="flex items-center">
            <ResponsiveContainer width="55%" height={250}>
              <PieChart>
                <Pie
                  data={horasPorEvento}
                  dataKey="horas"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {horasPorEvento.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value}h`, "Horas"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3 pl-4">
              {horasPorEvento.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-foreground truncate">{ev.nome}</span>
                  <span className="text-muted-foreground ml-auto font-medium">{ev.horas}h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Lançamentos recentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Colaborador", "Regime", "Evento", "Data", "Horas", "Feriado", "Valor", "Gestor"].map(
                  (h) => (
                    <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{l.colaboradorNome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={l.regime} />
                  </td>
                  <td className="py-2.5 px-3">{l.eventoNome}</td>
                  <td className="py-2.5 px-3">
                    {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2.5 px-3">{l.horas}h</td>
                  <td className="py-2.5 px-3">
                    {l.feriado ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806]">
                        Sim
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-medium">R$ {l.valor.toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{l.gestorNome}</td>
                </tr>
              ))}
              {lancamentos.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum lançamento neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
