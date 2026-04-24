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

function formatHoras(hours: number): string {
  const totalMinutes = Math.round((hours || 0) * 60);
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${hh}h${String(mm).padStart(2, "0")}min`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toRoundedMinutes(hours: number): number {
  return Math.round((hours || 0) * 60);
}

function isAbatimentoRow(l: LancamentoRow): boolean {
  return (l.valorAbatido || 0) > 0 || (l.horasAbatidas || 0) > 0 || (l.diasFolgaPJ || 0) < 0;
}

function getHorasHighlightClass(horas: number): string {
  if (horas >= 40) return "bg-[#FF1744] text-white ring-2 ring-[#FF1744]/40";
  if (horas >= 30) return "bg-[#FFD600] text-[#4A3B00] ring-2 ring-[#FFD600]/45";
  if (horas >= 0) return "bg-[#00E676] text-[#003D1F] ring-2 ring-[#00E676]/40";
  return "bg-transparent text-foreground";
}

const MONEY_EPSILON = 0.009;
const HOURS_EPSILON = 1 / 600; // 0.1 min

function Badge({ regime }: { regime: string }) {
  const cls =
    regime === "CLT"
      ? "bg-[#E2EFDA] text-[#27500A]"
      : "bg-[#E6F1FB] text-[#0C447C]";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{regime}</span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const value = (status || "").trim();
  if (!value) return null;
  const lowered = value.toLowerCase().replaceAll("não", "nao");
  const inactive = lowered.startsWith("nao") || lowered.includes("inativo") || lowered.includes("deslig");
  const active = !inactive && lowered.includes("ativo");
  const cls = active
    ? "bg-[#E2EFDA] text-[#27500A]"
    : inactive
      ? "bg-[#F8D7DA] text-[#842029]"
      : "bg-[#F1F3F5] text-[#495057]";
  const label = active ? "Ativo" : inactive ? "Não ativo" : value;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

export default function RelatorioPage() {
  const [mesSelecionado, setMesSelecionado] = useState<number | "todos">("todos");
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [gestorFiltro, setGestorFiltro] = useState("");
  const [buscaColaborador, setBuscaColaborador] = useState("");
  const [buscaFolgaPJ, setBuscaFolgaPJ] = useState("");
  const [colaboradorDetalheId, setColaboradorDetalheId] = useState<string | null>(null);
  const [cltAbatimentoModal, setCltAbatimentoModal] = useState<{
    colaboradorId: string;
    nome: string;
    gestorId: string;
    eventoId: string;
    saldoHoras: number;
    saldoValor: number;
  } | null>(null);
  const [cltAbatimentoValor, setCltAbatimentoValor] = useState("");
  const [cltAbatimentoHoras, setCltAbatimentoHoras] = useState("");
  const [cltAbatimentoMinutos, setCltAbatimentoMinutos] = useState("");
  const [cltAbatimentoObservacao, setCltAbatimentoObservacao] = useState("");
  const [pjHorasAbatimentoModal, setPjHorasAbatimentoModal] = useState<{
    colaboradorId: string;
    nome: string;
    gestorId: string;
    eventoId: string;
    saldoHoras: number;
  } | null>(null);
  const [pjHorasAbatimentoHoras, setPjHorasAbatimentoHoras] = useState("");
  const [pjHorasAbatimentoMinutos, setPjHorasAbatimentoMinutos] = useState("");
  const [pjHorasAbatimentoObservacao, setPjHorasAbatimentoObservacao] = useState("");
  const [pjDiasAbatimentoModal, setPjDiasAbatimentoModal] = useState<{
    colaboradorId: string;
    nome: string;
    gestorId: string;
    eventoId: string;
    saldoDias: number;
  } | null>(null);
  const [pjDiasAbatimentoDataFolga, setPjDiasAbatimentoDataFolga] = useState("");
  const [pjDiasAbatimentoObservacao, setPjDiasAbatimentoObservacao] = useState("");
  const [colaboradorFolgaDetalheId, setColaboradorFolgaDetalheId] = useState<string | null>(null);
  const [outrosDetalheAberto, setOutrosDetalheAberto] = useState(false);
  const [paginaHorasColabCLT, setPaginaHorasColabCLT] = useState(1);
  const [itensPorPaginaHorasColabCLT, setItensPorPaginaHorasColabCLT] = useState(10);
  const [paginaHorasColabPJ, setPaginaHorasColabPJ] = useState(1);
  const [itensPorPaginaHorasColabPJ, setItensPorPaginaHorasColabPJ] = useState(10);
  const [paginaFolgasPJ, setPaginaFolgasPJ] = useState(1);
  const [itensPorPaginaFolgasPJ, setItensPorPaginaFolgasPJ] = useState(10);
  const [paginaLancamentosRecentes, setPaginaLancamentosRecentes] = useState(1);
  const [itensPorPaginaLancamentosRecentes, setItensPorPaginaLancamentosRecentes] = useState(10);
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
        isAdmin?: boolean;
      }>;
    },
  });
  const isAdmin = Boolean(data?.isAdmin);
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

  const lancamentosEmAberto = useMemo(() => {
    return lancamentos.filter((l) => (l.valorAPagar || 0) > 0.009 || (l.bancoHoras || 0) > 0.009);
  }, [lancamentos]);
  const saldosPorColab = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nome: string; regime: string; saldoHoras: number; saldoValor: number; gestorId: string; eventoId: string }
    >();
    lancamentos.forEach((l) => {
      const entry = map.get(l.colaboradorId) || {
        id: l.colaboradorId,
        nome: l.colaboradorNome,
        regime: l.regime,
        saldoHoras: 0,
        saldoValor: 0,
        gestorId: l.gestorId,
        eventoId: l.eventoId,
      };
      entry.saldoHoras += (l.bancoHoras || 0) - (l.horasAbatidas || 0);
      entry.saldoValor += (l.valorAPagar || 0) - (l.valorAbatido || 0);
      map.set(l.colaboradorId, entry);
    });
    return Array.from(map.values()).map((e) => ({
      ...e,
      saldoHoras: Math.max(e.saldoHoras, 0) < HOURS_EPSILON ? 0 : Math.max(e.saldoHoras, 0),
      saldoValor: roundMoney(Math.max(e.saldoValor, 0)) <= MONEY_EPSILON ? 0 : roundMoney(Math.max(e.saldoValor, 0)),
    }));
  }, [lancamentos]);

  const gestoresOptions = useMemo(() => {
    const map = new Map<string, string>();
    (data?.lancamentos ?? []).forEach((l) => map.set(l.gestorId, l.gestorNome));
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [data?.lancamentos]);

  const totalHoras = saldosPorColab.reduce((s, l) => s + l.saldoHoras, 0);
  const colabsAtivos = saldosPorColab
    .filter((c) => c.saldoHoras > HOURS_EPSILON || c.saldoValor > MONEY_EPSILON)
    .map((c) => c.id);
  const uniqueColabIds = colabsAtivos;
  const cltUnique = uniqueColabIds.filter((id) => {
    const row = saldosPorColab.find((l) => l.id === id);
    return row?.regime === "CLT";
  }).length;
  const pjCount = uniqueColabIds.filter((id) => {
    const row = saldosPorColab.find((l) => l.id === id);
    return row?.regime === "PJ";
  }).length;
  const totalEventos = [
    ...new Set(
      lancamentos
        .filter((l) => {
          const colab = saldosPorColab.find((s) => s.id === l.colaboradorId);
          return (colab?.saldoHoras || 0) > HOURS_EPSILON || (colab?.saldoValor || 0) > MONEY_EPSILON;
        })
        .map((l) => l.eventoId),
    ),
  ].length;
  const totalColaboradoresAtuais = cadastroData?.colaboradores.length ?? 0;
  const totalGestoresAtuais = cadastroData?.gestores.length ?? 0;

  const horasPorColab = useMemo(() => {
    return saldosPorColab
      .map((s) => ({ id: s.id, nome: s.nome, horas: s.saldoHoras, regime: s.regime, valorAPagar: s.saldoValor }))
      .filter((s) => s.horas > HOURS_EPSILON || s.valorAPagar > MONEY_EPSILON)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [saldosPorColab]);
  const metaByColab = useMemo(() => {
    const map = new Map<string, { gestorId: string; eventoId: string }>();
    saldosPorColab.forEach((s) => {
      map.set(s.id, { gestorId: s.gestorId, eventoId: s.eventoId });
    });
    return map;
  }, [saldosPorColab]);

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

  const colaboradoresAgrupadosEmOutros = useMemo(() => {
    const sorted = [...horasPorColab].sort((a, b) => b.horas - a.horas);
    return sorted.slice(10);
  }, [horasPorColab]);

  const horasPorColabFiltrada = useMemo(() => {
    const termo = buscaColaborador.trim().toLowerCase();
    if (!termo) return horasPorColab;
    return horasPorColab.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [buscaColaborador, horasPorColab]);
  const horasPorColabCltFiltrada = useMemo(
    () => horasPorColabFiltrada.filter((item) => item.regime === "CLT"),
    [horasPorColabFiltrada],
  );
  const horasPorColabPjFiltrada = useMemo(
    () => horasPorColabFiltrada.filter((item) => item.regime === "PJ"),
    [horasPorColabFiltrada],
  );

  const folgasPJPorColab = useMemo(() => {
    const map = new Map<
      string,
      { id: string; nome: string; dias: number; regime: string; gestorId: string; eventoId: string }
    >();
    lancamentos.forEach((l) => {
      if (l.regime !== "PJ") return;
      const dias = l.diasFolgaPJ || 0;
      const entry = map.get(l.colaboradorId) || {
        id: l.colaboradorId,
        nome: l.colaboradorNome,
        dias: 0,
        regime: l.regime,
        gestorId: l.gestorId,
        eventoId: l.eventoId,
      };
      entry.dias += dias;
      map.set(l.colaboradorId, entry);
    });
    return Array.from(map.values())
      .map((entry) => ({ ...entry, dias: Math.max(entry.dias, 0) }))
      .filter((entry) => entry.dias > 0.0001)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [lancamentos]);

  const folgasPJPorColabFiltrada = useMemo(() => {
    const termo = buscaFolgaPJ.trim().toLowerCase();
    if (!termo) return folgasPJPorColab;
    return folgasPJPorColab.filter((item) => item.nome.toLowerCase().includes(termo));
  }, [buscaFolgaPJ, folgasPJPorColab]);

  const totalPaginasFolgasPJ = Math.max(1, Math.ceil(folgasPJPorColabFiltrada.length / Math.max(1, itensPorPaginaFolgasPJ)));
  const folgasPJPorColabPaginada = useMemo(() => {
    const start = (paginaFolgasPJ - 1) * itensPorPaginaFolgasPJ;
    const end = start + itensPorPaginaFolgasPJ;
    return folgasPJPorColabFiltrada.slice(start, end);
  }, [folgasPJPorColabFiltrada, paginaFolgasPJ, itensPorPaginaFolgasPJ]);

  const totalPaginasHorasColabCLT = Math.max(
    1,
    Math.ceil(horasPorColabCltFiltrada.length / Math.max(1, itensPorPaginaHorasColabCLT)),
  );
  const horasPorColabCltPaginada = useMemo(() => {
    const start = (paginaHorasColabCLT - 1) * itensPorPaginaHorasColabCLT;
    const end = start + itensPorPaginaHorasColabCLT;
    return horasPorColabCltFiltrada.slice(start, end);
  }, [horasPorColabCltFiltrada, paginaHorasColabCLT, itensPorPaginaHorasColabCLT]);
  const totalPaginasHorasColabPJ = Math.max(
    1,
    Math.ceil(horasPorColabPjFiltrada.length / Math.max(1, itensPorPaginaHorasColabPJ)),
  );
  const horasPorColabPjPaginada = useMemo(() => {
    const start = (paginaHorasColabPJ - 1) * itensPorPaginaHorasColabPJ;
    const end = start + itensPorPaginaHorasColabPJ;
    return horasPorColabPjFiltrada.slice(start, end);
  }, [horasPorColabPjFiltrada, paginaHorasColabPJ, itensPorPaginaHorasColabPJ]);

  const colaboradorDetalhe = useMemo(
    () => horasPorColab.find((c) => c.id === colaboradorDetalheId) ?? null,
    [colaboradorDetalheId, horasPorColab],
  );

  const lancamentosDoColaborador = useMemo(() => {
    if (!colaboradorDetalheId) return [];
    return lancamentos
      .filter(
        (l) =>
          l.colaboradorId === colaboradorDetalheId &&
          (((l.valorAPagar || 0) - (l.valorAbatido || 0)) > MONEY_EPSILON ||
            ((l.bancoHoras || 0) - (l.horasAbatidas || 0)) > HOURS_EPSILON),
      )
      .sort((a, b) => new Date(b.data + "T12:00:00").getTime() - new Date(a.data + "T12:00:00").getTime());
  }, [colaboradorDetalheId, lancamentos]);
  const lancamentosFolgaDoColaborador = useMemo(() => {
    if (!colaboradorFolgaDetalheId) return [];
    return lancamentos
      .filter((l) => l.colaboradorId === colaboradorFolgaDetalheId && l.regime === "PJ" && (l.diasFolgaPJ || 0) > 0)
      .sort((a, b) => new Date(b.data + "T12:00:00").getTime() - new Date(a.data + "T12:00:00").getTime());
  }, [colaboradorFolgaDetalheId, lancamentos]);

  const statusByColabId = useMemo(() => {
    const map = new Map<string, string>();
    (cadastroData?.colaboradores ?? []).forEach((c) => {
      if (c.id) map.set(c.id, c.status || "");
    });
    return map;
  }, [cadastroData?.colaboradores]);

  const lancamentosRecentes = useMemo(() => {
    return [...lancamentos].sort((a, b) => {
      if (a.sheetRowNumber !== b.sheetRowNumber) {
        return b.sheetRowNumber - a.sheetRowNumber;
      }
      return new Date(b.data + "T12:00:00").getTime() - new Date(a.data + "T12:00:00").getTime();
    });
  }, [lancamentos]);

  const totalPaginasLancamentosRecentes = Math.max(
    1,
    Math.ceil(lancamentosRecentes.length / Math.max(1, itensPorPaginaLancamentosRecentes)),
  );
  const lancamentosRecentesPaginados = useMemo(() => {
    const start = (paginaLancamentosRecentes - 1) * itensPorPaginaLancamentosRecentes;
    const end = start + itensPorPaginaLancamentosRecentes;
    return lancamentosRecentes.slice(start, end);
  }, [lancamentosRecentes, paginaLancamentosRecentes, itensPorPaginaLancamentosRecentes]);

  useEffect(() => {
    setPaginaHorasColabCLT(1);
    setPaginaHorasColabPJ(1);
  }, [buscaColaborador, mesSelecionado, anoSelecionado, gestorFiltro]);
  useEffect(() => {
    setPaginaFolgasPJ(1);
  }, [buscaFolgaPJ, mesSelecionado, anoSelecionado, gestorFiltro]);

  useEffect(() => {
    if (paginaHorasColabCLT > totalPaginasHorasColabCLT) {
      setPaginaHorasColabCLT(totalPaginasHorasColabCLT);
    }
  }, [paginaHorasColabCLT, totalPaginasHorasColabCLT]);
  useEffect(() => {
    if (paginaHorasColabPJ > totalPaginasHorasColabPJ) {
      setPaginaHorasColabPJ(totalPaginasHorasColabPJ);
    }
  }, [paginaHorasColabPJ, totalPaginasHorasColabPJ]);
  useEffect(() => {
    if (paginaFolgasPJ > totalPaginasFolgasPJ) {
      setPaginaFolgasPJ(totalPaginasFolgasPJ);
    }
  }, [paginaFolgasPJ, totalPaginasFolgasPJ]);

  useEffect(() => {
    setPaginaLancamentosRecentes(1);
  }, [mesSelecionado, anoSelecionado, gestorFiltro]);

  useEffect(() => {
    if (paginaLancamentosRecentes > totalPaginasLancamentosRecentes) {
      setPaginaLancamentosRecentes(totalPaginasLancamentosRecentes);
    }
  }, [paginaLancamentosRecentes, totalPaginasLancamentosRecentes]);

  const atualizarAbatimentoMutation = useMutation({
    mutationFn: async () => ({ ok: true }),
  });
  const abatimentoCltMutation = useMutation({
    mutationFn: async (payload: {
      colaboradorId: string;
      gestorId: string;
      eventoId: string;
      valorAbatido?: number;
      horasAbatidas?: number;
      observacao?: string;
    }) => {
      const r = await fetch("/api/lancamentos", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "clt", ...payload }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao lançar abatimento CLT");
      }
      return r.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      setCltAbatimentoModal(null);
      setCltAbatimentoValor("");
      setCltAbatimentoHoras("");
      setCltAbatimentoMinutos("");
      setCltAbatimentoObservacao("");
    },
  });
  const abatimentoPjHorasMutation = useMutation({
    mutationFn: async (payload: {
      colaboradorId: string;
      gestorId: string;
      eventoId: string;
      horasAbatidas: number;
      observacao?: string;
    }) => {
      const r = await fetch("/api/lancamentos", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pj_horas", ...payload }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao lançar abatimento de horas PJ");
      }
      return r.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      setPjHorasAbatimentoModal(null);
      setPjHorasAbatimentoHoras("");
      setPjHorasAbatimentoMinutos("");
      setPjHorasAbatimentoObservacao("");
    },
  });
  const abatimentoPjDiasMutation = useMutation({
    mutationFn: async (payload: {
      colaboradorId: string;
      gestorId: string;
      eventoId: string;
      diaFolgaPJ: string;
      observacao?: string;
    }) => {
      const r = await fetch("/api/lancamentos", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pj_dias", ...payload }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao lançar abatimento de dias PJ");
      }
      return r.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      setPjDiasAbatimentoModal(null);
      setPjDiasAbatimentoDataFolga("");
      setPjDiasAbatimentoObservacao("");
    },
  });

  const horasPorEvento = useMemo(() => {
    const map = new Map<string, { nome: string; horas: number }>();
    lancamentos.forEach((l) => {
      const entry = map.get(l.eventoId) || { nome: l.eventoNome, horas: 0 };
      entry.horas += (l.bancoHoras || 0) - (l.horasAbatidas || 0);
      map.set(l.eventoId, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [lancamentos]);

  const cardClass = "bg-card rounded-lg border-[0.5px] border-border p-4 sm:p-5";
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
      <div className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
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
        <div className="flex items-center gap-3 flex-wrap">
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
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none w-full sm:w-auto"
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
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none w-full sm:w-auto"
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

      {isAdmin && <div className="grid grid-cols-3 gap-4 mb-6 max-lg:grid-cols-1">
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Total de horas em aberto</p>
          <p className="text-2xl font-bold text-foreground">
            {formatHoras(totalHoras)}
          </p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Colaboradores com horas em aberto</p>
          <p className="text-2xl font-bold text-foreground">{colabsAtivos.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {cltUnique} CLT · {pjCount} PJ
          </p>
        </div>
        <div className={metricClass}>
          <p className="text-xs text-muted-foreground mb-1">Eventos com horas em aberto</p>
          <p className="text-2xl font-bold text-foreground">{totalEventos}</p>
        </div>
      </div>}
      {isAdmin && <div className="grid grid-cols-2 gap-4 mb-6 max-lg:grid-cols-1">
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
      </div>}

      {isAdmin && <div className="grid grid-cols-2 gap-4 mb-6 max-lg:grid-cols-1">
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Relatório de horas extras totais por funcionário
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Exibe os 10 colaboradores com mais horas extras em aberto no período; os demais são agrupados em "Outros".
          </p>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={horasPorColabGrafico} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={(value: number) => [formatHoras(Number(value || 0)), "Horas"]} />
              <Bar
                dataKey="horas"
                radius={[0, 4, 4, 0]}
                barSize={16}
                onClick={(entry: { id?: string }) => {
                  if (entry?.id === "outros") {
                    setOutrosDetalheAberto(true);
                  }
                }}
              >
                {horasPorColabGrafico.map((entry, i) => (
                  <Cell
                    key={entry.id}
                    fill={entry.id === "outros" ? "#8A8A8A" : entry.regime === "CLT" ? "#185FA5" : "#548235"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-[#185FA5]" />
              CLT
            </div>
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-[#548235]" />
              PJ
            </div>
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-[#8A8A8A]" />
              Outros (agrupados)
            </div>
            <span className="text-muted-foreground">Clique em "Outros" no gráfico para ver o detalhamento.</span>
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição de horas por evento</h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-full sm:w-[55%] h-[220px] sm:h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
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
                  <Tooltip formatter={(value: number) => [formatHoras(Number(value || 0)), "Horas"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3 sm:pl-4">
              {horasPorEvento.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-foreground truncate">{ev.nome}</span>
                  <span className="text-muted-foreground ml-auto font-medium">
                    {formatHoras(ev.horas)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>}

      {isAdmin && <div className={`${cardClass} mb-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Horas em aberto por funcionário (CLT)</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="text"
              placeholder="Pesquisar funcionário..."
              value={buscaColaborador}
              onChange={(e) => setBuscaColaborador(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Itens/página</label>
              <input
                type="number"
                min={1}
                value={itensPorPaginaHorasColabCLT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setItensPorPaginaHorasColabCLT(Number.isFinite(v) && v > 0 ? Math.floor(v) : 10);
                  setPaginaHorasColabCLT(1);
                }}
                className="w-20 px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Funcionário", "Regime", "Status", "Horas totais", "Valor a pagar", "Detalhes"].map((h) => (
                  <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horasPorColabCltPaginada.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{item.nome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={item.regime} />
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={statusByColabId.get(item.id)} />
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getHorasHighlightClass(
                        item.horas,
                      )}`}
                    >
                      {formatHoras(item.horas)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium">
                    R$ {item.valorAPagar.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => {
                        const meta = metaByColab.get(item.id);
                        if (!meta) {
                          window.alert("Não foi possível identificar gestor/evento para este colaborador.");
                          return;
                        }
                        setCltAbatimentoModal({
                          colaboradorId: item.id,
                          nome: item.nome,
                          gestorId: meta.gestorId,
                          eventoId: meta.eventoId,
                          saldoHoras: item.horas,
                          saldoValor: item.valorAPagar,
                        });
                          setCltAbatimentoObservacao("");
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      title="Abater lançamentos"
                    >
                      Abater
                    </button>
                  </td>
                </tr>
              ))}
              {horasPorColabCltPaginada.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nenhuma hora extra encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {paginaHorasColabCLT} de {totalPaginasHorasColabCLT} · {horasPorColabCltFiltrada.length} registro(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaginaHorasColabCLT((p) => Math.max(1, p - 1))}
              disabled={paginaHorasColabCLT <= 1}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPaginaHorasColabCLT((p) => Math.min(totalPaginasHorasColabCLT, p + 1))}
              disabled={paginaHorasColabCLT >= totalPaginasHorasColabCLT}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>}

      <div className={`${cardClass} mb-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Horas em aberto por funcionário (PJ)</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Itens/página</label>
            <input
              type="number"
              min={1}
              value={itensPorPaginaHorasColabPJ}
              onChange={(e) => {
                const v = Number(e.target.value);
                setItensPorPaginaHorasColabPJ(Number.isFinite(v) && v > 0 ? Math.floor(v) : 10);
                setPaginaHorasColabPJ(1);
              }}
              className="w-20 px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Funcionário", "Regime", "Status", "Horas totais", "Detalhes"].map((h) => (
                  <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {horasPorColabPjPaginada.map((item) => (
                <tr key={`pj-${item.id}`} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{item.nome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={item.regime} />
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={statusByColabId.get(item.id)} />
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getHorasHighlightClass(
                        item.horas,
                      )}`}
                    >
                      {formatHoras(item.horas)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() =>
                        (() => {
                          const meta = metaByColab.get(item.id);
                          if (!meta?.gestorId || !meta?.eventoId) {
                            window.alert("Não foi possível identificar gestor/evento para este colaborador PJ.");
                            return;
                          }
                          setPjHorasAbatimentoModal({
                            colaboradorId: item.id,
                            nome: item.nome,
                            gestorId: meta.gestorId,
                            eventoId: meta.eventoId,
                            saldoHoras: item.horas,
                          });
                          setPjHorasAbatimentoObservacao("");
                        })()
                      }
                      className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      title="Abater lançamentos"
                    >
                      Abater
                    </button>
                  </td>
                </tr>
              ))}
              {horasPorColabPjPaginada.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhuma hora PJ encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {paginaHorasColabPJ} de {totalPaginasHorasColabPJ} · {horasPorColabPjFiltrada.length} registro(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaginaHorasColabPJ((p) => Math.max(1, p - 1))}
              disabled={paginaHorasColabPJ <= 1}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPaginaHorasColabPJ((p) => Math.min(totalPaginasHorasColabPJ, p + 1))}
              disabled={paginaHorasColabPJ >= totalPaginasHorasColabPJ}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      <div className={`${cardClass} mb-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Dias de folga (PJ) por funcionário</h3>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              type="text"
              placeholder="Pesquisar funcionário..."
              value={buscaFolgaPJ}
              onChange={(e) => setBuscaFolgaPJ(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Itens/página</label>
              <input
                type="number"
                min={1}
                value={itensPorPaginaFolgasPJ}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setItensPorPaginaFolgasPJ(Number.isFinite(v) && v > 0 ? Math.floor(v) : 10);
                  setPaginaFolgasPJ(1);
                }}
                className="w-20 px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Funcionário", "Regime", "Status", "Dias totais de folga", "Detalhes"].map((h) => (
                  <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {folgasPJPorColabPaginada.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 px-3 font-medium">{item.nome}</td>
                  <td className="py-2.5 px-3">
                    <Badge regime={item.regime} />
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge status={statusByColabId.get(item.id)} />
                  </td>
                  <td className="py-2.5 px-3 font-medium">
                    {item.dias.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} dia(s)
                  </td>
                  <td className="py-2.5 px-3">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPjDiasAbatimentoDataFolga("");
                          setPjDiasAbatimentoObservacao("");
                          setPjDiasAbatimentoModal({
                            colaboradorId: item.id,
                            nome: item.nome,
                            gestorId: item.gestorId,
                            eventoId: item.eventoId,
                            saldoDias: item.dias,
                          });
                        }}
                        className="inline-flex items-center justify-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                        title="Abater dias de folga"
                      >
                        Abater
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {folgasPJPorColabPaginada.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    Nenhum dia de folga PJ encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {paginaFolgasPJ} de {totalPaginasFolgasPJ} · {folgasPJPorColabFiltrada.length} registro(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaginaFolgasPJ((p) => Math.max(1, p - 1))}
              disabled={paginaFolgasPJ <= 1}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPaginaFolgasPJ((p) => Math.min(totalPaginasFolgasPJ, p + 1))}
              disabled={paginaFolgasPJ >= totalPaginasFolgasPJ}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {isAdmin && <div className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Histórico de Lançamentos/Abatimentos</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Itens/página</label>
            <input
              type="number"
              min={1}
              value={itensPorPaginaLancamentosRecentes}
              onChange={(e) => {
                const v = Number(e.target.value);
                setItensPorPaginaLancamentosRecentes(Number.isFinite(v) && v > 0 ? Math.floor(v) : 10);
                setPaginaLancamentosRecentes(1);
              }}
              className="w-20 px-2 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Tipo", "Colaborador", "Regime", "Evento", "Data", "Dia de Folga (PJ)", "Horas/Dia", "Valor", "Feriado", "Gestor"].map(
                  (h) => (
                    <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lancamentosRecentesPaginados.map((l) => (
                <tr
                  key={l.id}
                  className={`border-b border-border last:border-0 ${
                    isAbatimentoRow(l)
                      ? "bg-[#FF3B3B]/20 hover:bg-[#FF3B3B]/28"
                      : "bg-[#39FF14]/20 hover:bg-[#39FF14]/28"
                  }`}
                >
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    {isAbatimentoRow(l) ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FCEBEC] text-[#8B2B33]">
                        Abatimento
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EAF6EE] text-[#1F5D35]">
                        Lançamento
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-medium first:rounded-l-xl last:rounded-r-xl">{l.colaboradorNome}</td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    <Badge regime={l.regime} />
                  </td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">{isAbatimentoRow(l) ? "-" : l.eventoNome}</td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    {l.diaFolgaPJ ? new Date(l.diaFolgaPJ + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    {(l.diasFolgaPJ || 0) !== 0
                      ? `${(l.diasFolgaPJ || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} Dia(s)`
                      : (l.horasAbatidas || 0) > 0
                        ? `- ${formatHoras(l.horasAbatidas || 0)}`
                        : isAbatimentoRow(l)
                          ? "-"
                      : formatHoras(l.horas)}
                  </td>
                  <td className="py-2.5 px-3 font-medium first:rounded-l-xl last:rounded-r-xl">
                    {(l.valorAPagar || 0) > 0
                      ? `R$ ${(l.valorAPagar || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : (l.valorAbatido || 0) > 0
                        ? `- R$ ${(l.valorAbatido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "-"}
                  </td>
                  <td className="py-2.5 px-3 first:rounded-l-xl last:rounded-r-xl">
                    {l.feriado ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806]">
                        Sim
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground first:rounded-l-xl last:rounded-r-xl">
                    {l.gestorNome}
                  </td>
                </tr>
              ))}
              {lancamentosRecentesPaginados.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {paginaLancamentosRecentes} de {totalPaginasLancamentosRecentes} · {lancamentosRecentes.length} registro(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaginaLancamentosRecentes((p) => Math.max(1, p - 1))}
              disabled={paginaLancamentosRecentes <= 1}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPaginaLancamentosRecentes((p) => Math.min(totalPaginasLancamentosRecentes, p + 1))}
              disabled={paginaLancamentosRecentes >= totalPaginasLancamentosRecentes}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>}

      {colaboradorDetalhe && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-5xl rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Lançamentos de {colaboradorDetalhe.nome}</h3>
                <p className="text-xs text-muted-foreground">
                  {lancamentosDoColaborador.length} lançamento(s) em aberto no período selecionado.
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
                    {["Data", "Evento", "Horas", "Feriado", "Saldo", "Ações"].map((h) => (
                      <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentosDoColaborador.map((l) => {
                    const saldoPendente = Math.max((l.valorAPagar || 0) - (l.valorAbatido || 0), 0);
                    return (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 px-3">
                          {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-3">{l.eventoNome}</td>
                        <td className="py-2.5 px-3">
                          {formatHoras(l.horas)}
                        </td>
                        <td className="py-2.5 px-3">{l.feriado ? "Sim" : "Não"}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium">
                            R$ {saldoPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                window.alert("Use o módulo CLT para realizar abatimentos.");
                              }}
                              disabled={false}
                              className="inline-flex items-center rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                            >
                              Abater
                            </button>
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
                          </div>
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
            {atualizarAbatimentoMutation.isError && (
              <p className="mt-3 text-xs text-destructive">
                {atualizarAbatimentoMutation.error instanceof Error
                  ? atualizarAbatimentoMutation.error.message
                  : "Não foi possível atualizar o abatimento."}
              </p>
            )}
          </div>
        </div>
      )}
      {cltAbatimentoModal && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Abater CLT</h3>
                <p className="text-xs text-muted-foreground">Colaborador: {cltAbatimentoModal.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Saldo atual: {formatHoras(cltAbatimentoModal.saldoHoras)} | R${" "}
                  {cltAbatimentoModal.saldoValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCltAbatimentoModal(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Abatimento combinado (opcional nos dois)</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Valor a abater (R$)</label>
                <input
                  type="text"
                  value={cltAbatimentoValor}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d,]/g, "");
                    const parts = raw.split(",");
                    const intPart = parts[0] ?? "";
                    const decPart = (parts[1] ?? "").slice(0, 2);
                    const normalized = parts.length > 1 ? `${intPart},${decPart}` : intPart;
                    setCltAbatimentoValor(normalized);
                  }}
                  placeholder="Ex.: 250,00"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Horas a abater</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cltAbatimentoHoras}
                    onChange={(e) => setCltAbatimentoHoras(e.target.value.replace(/\D/g, ""))}
                    placeholder="HH"
                    className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                  <span className="text-sm text-muted-foreground">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cltAbatimentoMinutos}
                    onChange={(e) => setCltAbatimentoMinutos(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    placeholder="MM"
                    maxLength={2}
                    className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Observação</label>
                <textarea
                  value={cltAbatimentoObservacao}
                  onChange={(e) => setCltAbatimentoObservacao(e.target.value)}
                  placeholder="Motivo do abatimento"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Prévia:{" "}
                {(() => {
                  const valor = Number(cltAbatimentoValor.replace(/\./g, "").replace(",", ".").trim() || "0");
                  const hh = Number(cltAbatimentoHoras || "0");
                  const mm = Number(cltAbatimentoMinutos || "0");
                  const horas = Number.isFinite(hh) && Number.isFinite(mm) ? hh + mm / 60 : 0;
                  const parts: string[] = [];
                  if (valor > 0) parts.push(`Valor abatido: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
                  if (horas > 0) parts.push(`Horas abatidas: ${formatHoras(horas)}`);
                  return parts.length ? parts.join(" | ") : "Nenhum abatimento informado";
                })()}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const valorAbatido = Number(cltAbatimentoValor.replace(/\./g, "").replace(",", ".").trim() || "0");
                    const hh = Number(cltAbatimentoHoras || "0");
                    const mm = Number(cltAbatimentoMinutos || "0");
                    if (cltAbatimentoValor && !/^\d+(,\d{1,2})?$/.test(cltAbatimentoValor)) {
                      window.alert("O valor deve ter no máximo duas casas decimais.");
                      return;
                    }
                    if (cltAbatimentoHoras && !/^\d+$/.test(cltAbatimentoHoras)) {
                      window.alert("Horas deve conter somente números.");
                      return;
                    }
                    if (cltAbatimentoMinutos && !/^\d{1,2}$/.test(cltAbatimentoMinutos)) {
                      window.alert("Minutos deve conter no máximo 2 dígitos.");
                      return;
                    }
                    if (!Number.isFinite(valorAbatido) || valorAbatido < 0) {
                      window.alert("Informe um valor monetário válido.");
                      return;
                    }
                    if (!Number.isFinite(hh) || hh < 0 || !Number.isFinite(mm) || mm < 0 || mm > 59) {
                      window.alert("Informe horas e minutos válidos.");
                      return;
                    }
                    const horasAbatidas = hh + mm / 60;
                    if (valorAbatido <= 0 && horasAbatidas <= 0) {
                      window.alert("Informe valor e/ou horas para abatimento.");
                      return;
                    }
                    const saldoValor = roundMoney(cltAbatimentoModal.saldoValor);
                    const valorInformado = roundMoney(valorAbatido);
                    if (valorInformado > saldoValor) {
                      window.alert("O valor abatido não pode ser maior que o saldo de valor disponível.");
                      return;
                    }
                    const saldoMinutos = toRoundedMinutes(cltAbatimentoModal.saldoHoras);
                    const abatimentoMinutos = hh * 60 + mm;
                    if (abatimentoMinutos > saldoMinutos) {
                      window.alert("As horas abatidas não podem ser maiores que o saldo de horas disponível.");
                      return;
                    }
                    const partesPreview = [
                      valorAbatido > 0
                        ? `Valor: R$ ${valorAbatido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : null,
                      horasAbatidas > 0 ? `Horas: ${formatHoras(horasAbatidas)}` : null,
                    ].filter(Boolean);
                    const confirmed = window.confirm(
                      `Tem certeza que deseja lançar este abatimento?\n${partesPreview.join("\n")}`,
                    );
                    if (!confirmed) return;
                    const observacao = cltAbatimentoObservacao.trim();
                    abatimentoCltMutation.mutate({
                      colaboradorId: cltAbatimentoModal.colaboradorId,
                      gestorId: cltAbatimentoModal.gestorId,
                      eventoId: cltAbatimentoModal.eventoId,
                      ...(valorAbatido > 0 ? { valorAbatido } : {}),
                      ...(horasAbatidas > 0 ? { horasAbatidas } : {}),
                      ...(observacao ? { observacao } : {}),
                    });
                  }}
                  disabled={abatimentoCltMutation.isPending}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {abatimentoCltMutation.isPending ? "Salvando..." : "Salvar abatimento"}
                </button>
              </div>
              {abatimentoCltMutation.isError && (
                <p className="text-xs text-destructive">
                  {abatimentoCltMutation.error instanceof Error
                    ? abatimentoCltMutation.error.message
                    : "Não foi possível salvar o abatimento CLT."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {pjHorasAbatimentoModal && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Abater horas PJ</h3>
                <p className="text-xs text-muted-foreground">Colaborador: {pjHorasAbatimentoModal.nome}</p>
                <p className="text-xs text-muted-foreground">Saldo atual: {formatHoras(pjHorasAbatimentoModal.saldoHoras)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPjHorasAbatimentoModal(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Horas a abater</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pjHorasAbatimentoHoras}
                    onChange={(e) => setPjHorasAbatimentoHoras(e.target.value.replace(/\D/g, ""))}
                    placeholder="HH"
                    className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                  <span className="text-sm text-muted-foreground">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={pjHorasAbatimentoMinutos}
                    onChange={(e) => setPjHorasAbatimentoMinutos(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    placeholder="MM"
                    maxLength={2}
                    className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Observação</label>
                <textarea
                  value={pjHorasAbatimentoObservacao}
                  onChange={(e) => setPjHorasAbatimentoObservacao(e.target.value)}
                  placeholder="Motivo do abatimento"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const hh = Number(pjHorasAbatimentoHoras || "0");
                    const mm = Number(pjHorasAbatimentoMinutos || "0");
                    if (!Number.isFinite(hh) || hh < 0 || !Number.isFinite(mm) || mm < 0 || mm > 59) {
                      window.alert("Informe horas e minutos válidos.");
                      return;
                    }
                    const horasAbatidas = hh + mm / 60;
                    if (horasAbatidas <= 0) {
                      window.alert("Informe um tempo maior que zero para abatimento.");
                      return;
                    }
                    if (hh * 60 + mm > toRoundedMinutes(pjHorasAbatimentoModal.saldoHoras)) {
                      window.alert("As horas abatidas não podem ser maiores que o saldo disponível.");
                      return;
                    }
                    const confirmed = window.confirm(
                      `Tem certeza que deseja abater ${formatHoras(horasAbatidas)} deste colaborador?`,
                    );
                    if (!confirmed) return;
                    const observacao = pjHorasAbatimentoObservacao.trim();
                    abatimentoPjHorasMutation.mutate({
                      colaboradorId: pjHorasAbatimentoModal.colaboradorId,
                      gestorId: pjHorasAbatimentoModal.gestorId,
                      eventoId: pjHorasAbatimentoModal.eventoId,
                      horasAbatidas,
                      ...(observacao ? { observacao } : {}),
                    });
                  }}
                  disabled={abatimentoPjHorasMutation.isPending}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {abatimentoPjHorasMutation.isPending ? "Salvando..." : "Salvar abatimento"}
                </button>
              </div>
              {abatimentoPjHorasMutation.isError && (
                <p className="text-xs text-destructive">
                  {abatimentoPjHorasMutation.error instanceof Error
                    ? abatimentoPjHorasMutation.error.message
                    : "Não foi possível salvar o abatimento PJ de horas."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {pjDiasAbatimentoModal && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Abater dias PJ</h3>
                <p className="text-xs text-muted-foreground">Colaborador: {pjDiasAbatimentoModal.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Saldo atual: {pjDiasAbatimentoModal.saldoDias.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dia(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPjDiasAbatimentoModal(null);
                  setPjDiasAbatimentoDataFolga("");
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Dia de folga (PJ)</label>
                <input
                  type="date"
                  value={pjDiasAbatimentoDataFolga}
                  onChange={(e) => setPjDiasAbatimentoDataFolga(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada abatimento desconta automaticamente 1 dia.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Observação</label>
                <textarea
                  value={pjDiasAbatimentoObservacao}
                  onChange={(e) => setPjDiasAbatimentoObservacao(e.target.value)}
                  placeholder="Motivo do abatimento"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const diaFolgaPJ = pjDiasAbatimentoDataFolga.trim();
                    if (!diaFolgaPJ || !/^\d{4}-\d{2}-\d{2}$/.test(diaFolgaPJ)) {
                      window.alert("Informe uma data válida para o Dia de Folga (PJ).");
                      return;
                    }
                    if (pjDiasAbatimentoModal.saldoDias < 1) {
                      window.alert("Saldo de folga insuficiente para abatimento.");
                      return;
                    }
                    const confirmed = window.confirm(
                      `Tem certeza que deseja abater 1 dia deste colaborador para uso em ${new Date(
                        diaFolgaPJ + "T12:00:00",
                      ).toLocaleDateString("pt-BR")}?`,
                    );
                    if (!confirmed) return;
                    const observacao = pjDiasAbatimentoObservacao.trim();
                    abatimentoPjDiasMutation.mutate({
                      colaboradorId: pjDiasAbatimentoModal.colaboradorId,
                      gestorId: pjDiasAbatimentoModal.gestorId,
                      eventoId: pjDiasAbatimentoModal.eventoId,
                      diaFolgaPJ,
                      ...(observacao ? { observacao } : {}),
                    });
                  }}
                  disabled={abatimentoPjDiasMutation.isPending}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {abatimentoPjDiasMutation.isPending ? "Salvando..." : "Salvar abatimento"}
                </button>
              </div>
              {abatimentoPjDiasMutation.isError && (
                <p className="text-xs text-destructive">
                  {abatimentoPjDiasMutation.error instanceof Error
                    ? abatimentoPjDiasMutation.error.message
                    : "Não foi possível salvar o abatimento PJ de dias."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {outrosDetalheAberto && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Detalhamento de "Outros"</h3>
                <p className="text-xs text-muted-foreground">
                  {colaboradoresAgrupadosEmOutros.length} colaborador(es) agrupados fora do top 10 do gráfico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOutrosDetalheAberto(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Colaborador", "Regime", "Horas"].map((h) => (
                      <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colaboradoresAgrupadosEmOutros.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 px-3 font-medium">{item.nome}</td>
                      <td className="py-2.5 px-3">
                        <Badge regime={item.regime} />
                      </td>
                      <td className="py-2.5 px-3">
                        {formatHoras(item.horas)}
                      </td>
                    </tr>
                  ))}
                  {colaboradoresAgrupadosEmOutros.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-muted-foreground">
                        Não há colaboradores agrupados em "Outros" para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {colaboradorFolgaDetalheId && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto mt-8 w-full max-w-4xl rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Lançamentos de folga (PJ)</h3>
                <p className="text-xs text-muted-foreground">
                  {lancamentosFolgaDoColaborador.length} lançamento(s) com dias de folga para o colaborador selecionado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setColaboradorFolgaDetalheId(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Data", "Evento", "Dias de folga", "Feriado", "Ações"].map((h) => (
                      <th key={h} className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lancamentosFolgaDoColaborador.map((l) => (
                    <tr key={`folga-${l.id}`} className="border-b border-border last:border-0">
                      <td className="py-2.5 px-3">{new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                      <td className="py-2.5 px-3">{l.eventoNome}</td>
                      <td className="py-2.5 px-3 font-medium">
                        {(l.diasFolgaPJ || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dia(s)
                      </td>
                      <td className="py-2.5 px-3">{l.feriado ? "Sim" : "Não"}</td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => window.alert("Abatimento de dias de folga PJ será aplicado na próxima etapa.")}
                          className="inline-flex items-center rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          Abater
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lancamentosFolgaDoColaborador.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        Não há lançamentos de folga PJ para este colaborador.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
