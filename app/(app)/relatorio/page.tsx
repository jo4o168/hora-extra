"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { CadastroResponse, LancamentoRow } from "@/lib/sheets/types";

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
  const [mesSelecionado, setMesSelecionado] = useState<number | "todos">("todos");
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [gestorFiltro, setGestorFiltro] = useState("");
  const [buscaColaborador, setBuscaColaborador] = useState("");
  const [colaboradorDetalheId, setColaboradorDetalheId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const r = await fetch("/api/lancamentos", { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao carregar");
      }
      return r.json() as Promise<{
        lancamentos: LancamentoRow[];
      }>;
    },
  });
  const { data: cadastroData } = useQuery({
    queryKey: ["cadastro-relatorio"],
    queryFn: async (): Promise<CadastroResponse> => {
      const r = await fetch("/api/cadastro", { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar cadastro");
      return r.json();
    },
  });

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    (data?.lancamentos ?? []).forEach((l) => {
      const d = new Date(l.data + "T12:00:00");
      if (!Number.isNaN(d.getTime())) anos.add(d.getFullYear());
    });
    if (!anos.size) anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }, [data?.lancamentos]);

  useEffect(() => {
    if (!anosDisponiveis.includes(anoSelecionado)) {
      setAnoSelecionado(anosDisponiveis[0]);
    }
  }, [anoSelecionado, anosDisponiveis]);

  const lancamentos = useMemo(() => {
    const list = data?.lancamentos ?? [];
    return list.filter((l) => {
      const d = new Date(l.data + "T12:00:00");
      const mes = d.getMonth();
      const ano = d.getFullYear();
      if (mesSelecionado !== "todos" && mes !== mesSelecionado) return false;
      if (ano !== anoSelecionado) return false;
      if (gestorFiltro && l.gestorId !== gestorFiltro) return false;
      return true;
    });
  }, [data?.lancamentos, mesSelecionado, anoSelecionado, gestorFiltro]);

  const gestoresOptions = useMemo(() => {
    const map = new Map<string, string>();
    (data?.lancamentos ?? []).forEach((l) => map.set(l.gestorId, l.gestorNome));
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [data?.lancamentos]);

  const totalHoras = lancamentos.reduce((s, l) => s + l.horas, 0);
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
  const totalColaboradoresAtuais = cadastroData?.colaboradores.length ?? 0;
  const totalGestoresAtuais = cadastroData?.gestores.length ?? 0;

  const horasPorColab = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; horas: number; regime: string }>();
    lancamentos.forEach((l) => {
      const entry = map.get(l.colaboradorId) || {
        id: l.colaboradorId,
        nome: l.colaboradorNome,
        horas: 0,
        regime: l.regime,
      };
      entry.horas += l.horas;
      map.set(l.colaboradorId, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [lancamentos]);

  const horasPorColabGrafico = useMemo(() => {
    const sorted = [...horasPorColab].sort((a, b) => b.horas - a.horas);
    const top = sorted.slice(0, 10);
    const outrosHoras = sorted.slice(10).reduce((sum, item) => sum + item.horas, 0);
    if (outrosHoras > 0) {
      top.push({
        id: "outros",
        nome: "Outros",
        horas: outrosHoras,
        regime: "CLT",
      });
    }
    return top;
  }, [horasPorColab]);

  const horasPorColabFiltrada = useMemo(() => {
    const termo = buscaColaborador.trim().toLowerCase();
    if (!termo) return horasPorColab;
    return horasPorColab.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [buscaColaborador, horasPorColab]);

  const colaboradorDetalhe = useMemo(
    () => horasPorColab.find((c) => c.id === colaboradorDetalheId) ?? null,
    [colaboradorDetalheId, horasPorColab],
  );

  const lancamentosDoColaborador = useMemo(() => {
    if (!colaboradorDetalheId) return [];
    return lancamentos
      .filter((l) => l.colaboradorId === colaboradorDetalheId)
      .sort((a, b) => new Date(b.data + "T12:00:00").getTime() - new Date(a.data + "T12:00:00").getTime());
  }, [colaboradorDetalheId, lancamentos]);

  const lancamentosRecentes = useMemo(() => {
    return [...lancamentos].sort((a, b) => {
      if (a.sheetRowNumber !== b.sheetRowNumber) {
        return b.sheetRowNumber - a.sheetRowNumber;
      }
      return new Date(b.data + "T12:00:00").getTime() - new Date(a.data + "T12:00:00").getTime();
    });
  }, [lancamentos]);

  const atualizarPagamentoMutation = useMutation({
    mutationFn: async ({ sheetRowNumber, pago }: { sheetRowNumber: number; pago: boolean }) => {
      const r = await fetch("/api/lancamentos", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetRowNumber, pago }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao atualizar status de pagamento");
      }
      return r.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
    },
  });

  const horasPorEvento = useMemo(() => {
    const map = new Map<string, { nome: string; horas: number }>();
    lancamentos.forEach((l) => {
      const entry = map.get(l.eventoId) || { nome: l.eventoNome, horas: 0 };
      entry.horas += l.horas;
      map.set(l.eventoId, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
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

  if (isError) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-6">Relatórios</h2>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 max-w-2xl">
          <p className="text-sm font-medium text-destructive">Não foi possível carregar os lançamentos.</p>
          <p className="mt-1 text-xs text-destructive/90">
            {error instanceof Error ? error.message : "Verifique a conexão com o Google Sheets."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isFetching ? "Tentando novamente..." : "Tentar novamente"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Relatórios e resultados</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Visão consolidada de horas extras, custos e produtividade por período.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Período selecionado</p>
            <p className="text-sm font-semibold text-foreground">
              {mesSelecionado === "todos" ? `Todos os meses de ${anoSelecionado}` : `${MESES[mesSelecionado]} de ${anoSelecionado}`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Filtros</h3>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            <button
              key="todos"
              type="button"
              onClick={() => setMesSelecionado("todos")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                mesSelecionado === "todos"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Todos
            </button>
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
            value={anoSelecionado}
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
          >
            {anosDisponiveis.map((ano) => (
              <option key={ano} value={ano}>
                {ano}
              </option>
            ))}
          </select>
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

      <div className="grid grid-cols-3 gap-4 mb-6 max-lg:grid-cols-1">
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Total de horas</p>
          <p className="text-2xl font-bold text-foreground">
            {totalHoras.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
          </p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Colaboradores ativos no período</p>
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
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Total de colaboradores atuais</p>
          <p className="text-2xl font-bold text-foreground">{totalColaboradoresAtuais}</p>
          <p className="text-xs text-muted-foreground mt-1">Baseado no cadastro da planilha</p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Total de gestores atuais</p>
          <p className="text-2xl font-bold text-foreground">{totalGestoresAtuais}</p>
          <p className="text-xs text-muted-foreground mt-1">Baseado no cadastro da planilha</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 max-lg:grid-cols-1">
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Relatório de horas extras totais por funcionário
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Exibe os 10 colaboradores com mais horas extras no período; os demais são agrupados em "Outros".
          </p>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={horasPorColabGrafico} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={(value: number) => [`${value}h`, "Horas"]} />
              <Bar dataKey="horas" radius={[0, 4, 4, 0]} barSize={16}>
                {horasPorColabGrafico.map((entry, i) => (
                  <Cell
                    key={entry.id}
                    fill={entry.id === "outros" ? "#8A8A8A" : entry.regime === "CLT" ? "#185FA5" : "#548235"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição de horas por evento</h3>
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
                  <span className="text-muted-foreground ml-auto font-medium">
                    {ev.horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardClass} mb-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Horas totais por funcionário</h3>
          <input
            type="text"
            placeholder="Pesquisar funcionário..."
            value={buscaColaborador}
            onChange={(e) => setBuscaColaborador(e.target.value)}
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Funcionário", "Regime", "Horas totais", "Detalhes"].map((h) => (
                  <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horasPorColabFiltrada.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{item.nome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={item.regime} />
                  </td>
                  <td className="py-2.5 px-3">
                    {item.horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => setColaboradorDetalheId(item.id)}
                      className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      title="Ver lançamentos"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
              {horasPorColabFiltrada.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhuma hora extra encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Lançamentos recentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Colaborador", "Regime", "Evento", "Data", "Horas", "Feriado", "Valor/hora", "Gestor"].map(
                  (h) => (
                    <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lancamentosRecentes.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{l.colaboradorNome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={l.regime} />
                  </td>
                  <td className="py-2.5 px-3">{l.eventoNome}</td>
                  <td className="py-2.5 px-3">
                    {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2.5 px-3">
                    {l.horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
                  </td>
                  <td className="py-2.5 px-3">
                    {l.feriado ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806]">
                        Sim
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-medium">
                    R$ {l.valorHora.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">{l.gestorNome}</td>
                </tr>
              ))}
              {lancamentosRecentes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {colaboradorDetalhe && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-5xl rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Lançamentos de {colaboradorDetalhe.nome}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lancamentosDoColaborador.length} lançamento(s) no período selecionado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setColaboradorDetalheId(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Data", "Evento", "Horas", "Feriado", "Pago", "Ações"].map((h) => (
                      <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentosDoColaborador.map((l) => {
                    const pago = Boolean(l.jaFoiPago);
                    return (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 px-3">
                          {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-3">{l.eventoNome}</td>
                        <td className="py-2.5 px-3">
                          {l.horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
                        </td>
                        <td className="py-2.5 px-3">{l.feriado ? "Sim" : "Não"}</td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() =>
                              atualizarPagamentoMutation.mutate({
                                sheetRowNumber: l.sheetRowNumber,
                                pago: !pago,
                              })
                            }
                            disabled={atualizarPagamentoMutation.isPending}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              pago
                                ? "bg-[#E2EFDA] text-[#27500A]"
                                : "bg-[#F1F3F5] text-[#495057]"
                            }`}
                          >
                            {atualizarPagamentoMutation.isPending ? "Atualizando..." : pago ? "Pago" : "Não pago"}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <Link
                            href={`/lancamento?gestorId=${encodeURIComponent(
                              l.gestorId,
                            )}&colaboradorId=${encodeURIComponent(l.colaboradorId)}&eventoId=${encodeURIComponent(
                              l.eventoId,
                            )}&data=${encodeURIComponent(l.data)}&sheetRowNumber=${encodeURIComponent(
                              String(l.sheetRowNumber),
                            )}`}
                            className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Editar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {lancamentosDoColaborador.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Não há lançamentos para este colaborador no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {atualizarPagamentoMutation.isError && (
              <p className="mt-3 text-xs text-destructive">
                {atualizarPagamentoMutation.error instanceof Error
                  ? atualizarPagamentoMutation.error.message
                  : "Não foi possível atualizar o pagamento."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
