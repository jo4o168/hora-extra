"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getFeriadoNacionalInfo } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import type { CadastroResponse } from "@/lib/sheets/service";
import { useRouter, useSearchParams } from "next/navigation";
import type { LancamentoRow } from "@/lib/sheets/types";

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
  const inactive =
    lowered.startsWith("nao") ||
    lowered.includes("inativo") ||
    lowered.includes("deslig") ||
    lowered.includes("afast");
  const active = !inactive && lowered.includes("ativo");
  const cls = active
    ? "bg-[#E2EFDA] text-[#27500A]"
    : inactive
      ? "bg-[#F8D7DA] text-[#842029]"
      : "bg-[#F1F3F5] text-[#495057]";
  const label = active ? "Ativo" : inactive ? "Não ativo" : value;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function FeriadoNacionalBadge({ nome }: { nome: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806]">
      Feriado nacional · {nome}
    </span>
  );
}

function isWeekendDate(ymd: string): boolean {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

export default function LancamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sheetRowNumberParam = Number(searchParams.get("sheetRowNumber") || "");
  const emEdicao = Number.isFinite(sheetRowNumberParam) && sheetRowNumberParam > 0;
  const { data: cadastro, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["cadastro"],
    queryFn: async (): Promise<CadastroResponse> => {
      const r = await fetch("/api/cadastro", { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao carregar cadastro");
      }
      return r.json();
    },
  });

  const [gestorId, setGestorId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [eventoId, setEventoId] = useState("");
  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const cadastroDisponivel = Boolean(cadastro && !isError);
  const [preenchimentoInicialFeito, setPreenchimentoInicialFeito] = useState(false);

  const { data: lancamentosData } = useQuery({
    queryKey: ["lancamentos", emEdicao ? sheetRowNumberParam : "new"],
    enabled: emEdicao,
    queryFn: async (): Promise<{ lancamentos: LancamentoRow[] }> => {
      const r = await fetch("/api/lancamentos", { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar lançamentos");
      return r.json();
    },
  });

  useEffect(() => {
    if (emEdicao) return;
    const gestorIdParam = searchParams.get("gestorId");
    const colaboradorIdParam = searchParams.get("colaboradorId");
    const eventoIdParam = searchParams.get("eventoId");
    const dataParam = searchParams.get("data");

    if (gestorIdParam) setGestorId(gestorIdParam);
    if (colaboradorIdParam) setColaboradorId(colaboradorIdParam);
    if (eventoIdParam) setEventoId(eventoIdParam);
    if (dataParam) setData(dataParam);
  }, [searchParams, emEdicao]);

  useEffect(() => {
    if (!emEdicao || preenchimentoInicialFeito || !lancamentosData?.lancamentos?.length) return;
    const alvo = lancamentosData.lancamentos.find((l) => l.sheetRowNumber === sheetRowNumberParam);
    if (!alvo) return;
    setGestorId(alvo.gestorId);
    setColaboradorId(alvo.colaboradorId);
    setEventoId(alvo.eventoId);
    setData(alvo.data);
    setHoraInicio(alvo.horaInicio || "");
    setHoraFim(alvo.horaFim || "");
    setPreenchimentoInicialFeito(true);
  }, [emEdicao, preenchimentoInicialFeito, lancamentosData?.lancamentos, sheetRowNumberParam]);

  const gestores = cadastro?.gestores ?? [];
  const colaboradores = cadastro?.colaboradores ?? [];
  const eventos = cadastro?.eventos ?? [];

  const normalized = (value: string) => value.trim().toLowerCase();
  const colabsFiltrados = colaboradores.filter((c) => normalized(c.gestorId) === normalized(gestorId));
  const colabSelecionado = colaboradores.find((c) => c.id === colaboradorId);

  const feriadoInfo = useMemo(() => getFeriadoNacionalInfo(data), [data]);
  const feriado = feriadoInfo.isFeriado;
  const fimDeSemana = useMemo(() => isWeekendDate(data), [data]);
  const exigeFolgaDiaPJ = Boolean(colabSelecionado?.regime === "PJ" && (feriado || fimDeSemana));

  const horas = useMemo(
    () => calcHorasEntreHorarios(horaInicio, horaFim),
    [horaInicio, horaFim],
  );

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lancamentos", {
        method: emEdicao ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(emEdicao ? { sheetRowNumber: sheetRowNumberParam } : {}),
          gestorId,
          colaboradorId,
          eventoId,
          data,
          horaInicio: exigeFolgaDiaPJ ? "" : horaInicio,
          horaFim: exigeFolgaDiaPJ ? "" : horaFim,
          horas: exigeFolgaDiaPJ ? 0 : horas,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Erro ao salvar");
      }
      return r.json();
    },
  });

  function limpar() {
    setGestorId("");
    setColaboradorId("");
    setEventoId("");
    setData("");
    setHoraInicio("");
    setHoraFim("");
    setConfirmado(false);
  }

  async function handleSalvar() {
    if (!gestorId || !colaboradorId || !eventoId || !data) return;
    if (!exigeFolgaDiaPJ && (!horaInicio || !horaFim || horas <= 0)) return;
    if (!cadastroDisponivel) return;

    const colab = colaboradores.find((c) => c.id === colaboradorId);
    const gestor = gestores.find((g) => g.id === gestorId);
    const evento = eventos.find((e) => e.id === eventoId);
    if (!colab || !gestor || !evento) return;

    try {
      await salvarMutation.mutateAsync();
      setConfirmado(true);
      if (emEdicao) {
        setTimeout(() => {
          router.push("/relatorio");
        }, 600);
        return;
      }
      setTimeout(() => {
        limpar();
      }, 2000);
    } catch {
      setConfirmado(false);
    }
  }

  const cardClass = "bg-card rounded-lg border-[0.5px] border-border p-6";
  const selectClass =
    "w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none";
  const labelClass = "block text-sm font-medium text-foreground mb-1.5";

  const podeSalvarBase =
    cadastroDisponivel &&
    gestorId &&
    colaboradorId &&
    eventoId &&
    data &&
    (exigeFolgaDiaPJ || (horaInicio && horaFim && horas > 0));

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Lançar horas extras</h2>
        {emEdicao && (
          <span className="inline-flex items-center rounded-full bg-[#FFF4CC] px-3 py-1 text-xs font-semibold text-[#7A5A00]">
            Modo edição
          </span>
        )}
      </div>
      {emEdicao && (
        <div className="mb-4 rounded-lg border border-[#F5D97A] bg-[#FFFBEA] px-4 py-3">
          <p className="text-sm font-medium text-[#7A5A00]">
            Você está editando um lançamento existente.
          </p>
          <p className="mt-1 text-xs text-[#8A6B0A]">
            Ao salvar, os dados serão atualizados na mesma linha da planilha (não será criado um novo registro).
          </p>
        </div>
      )}
      {isLoading && (
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">Carregando cadastro...</p>
        </div>
      )}
      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Cadastro indisponível no momento. Os dropdowns são carregados pelo Google Sheets.
          </p>
          <p className="mt-1 text-xs text-destructive/90">
            {error instanceof Error ? error.message : "Verifique a configuração da API e da planilha."}
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
      )}

      <div className={`${cardClass} mb-4`}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Identificação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Gestor responsável</label>
            <select
              className={selectClass}
              value={gestorId}
              onChange={(e) => {
                setGestorId(e.target.value);
                setColaboradorId("");
              }}
              disabled={!cadastroDisponivel}
            >
              <option value="">{cadastroDisponivel ? "Selecione..." : "Aguardando cadastro..."}</option>
              {gestores.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Colaborador</label>
            <select
              className={selectClass}
              value={colaboradorId}
              onChange={(e) => setColaboradorId(e.target.value)}
              disabled={!cadastroDisponivel || !gestorId}
            >
              <option value="">Selecione...</option>
              {colabsFiltrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {colabSelecionado && (
          <div className="mt-4 px-4 py-3 rounded-lg bg-muted flex items-center gap-4 text-sm">
            <span className="font-medium">{colabSelecionado.nome}</span>
            <span className="text-muted-foreground">{colabSelecionado.cargo}</span>
            <Badge regime={colabSelecionado.regime} />
            <StatusBadge status={colabSelecionado.status} />
          </div>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Dados do evento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Evento</label>
            <select
              className={selectClass}
              value={eventoId}
              onChange={(e) => setEventoId(e.target.value)}
              disabled={!cadastroDisponivel}
            >
              <option value="">Selecione...</option>
              {eventos.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Data</label>
            <input
              type="date"
              className={selectClass}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            {data && feriado && feriadoInfo.nome && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <FeriadoNacionalBadge nome={feriadoInfo.nome} />
                <span className="text-xs text-muted-foreground">
                  Considerado automaticamente no envio à planilha.
                </span>
              </div>
            )}
            {data && !feriado && (
              <p className="mt-2 text-xs text-muted-foreground">Não é feriado nacional nesta data.</p>
            )}
          </div>
          {!exigeFolgaDiaPJ && (
            <>
              <div>
                <label className={labelClass}>Horário inicial</label>
                <input
                  type="time"
                  className={selectClass}
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Horário final</label>
                <input
                  type="time"
                  className={selectClass}
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {exigeFolgaDiaPJ && (
          <p className="mt-4 text-sm text-foreground">
            <span className="font-semibold">Regra PJ aplicada:</span>{" "}
            <span className="text-muted-foreground">
              nesta data (fim de semana/feriado), não é necessário informar horas; será lançado 1 dia em Dias de
              Folga (PJ).
            </span>
          </p>
        )}
        {!exigeFolgaDiaPJ && horaInicio && horaFim && (
          <p className="mt-4 text-sm text-foreground">
            <span className="text-muted-foreground">Total calculado:</span>{" "}
            <span className="font-semibold">
              {horas > 0
                ? `${Math.floor(horas)}h${String(Math.round((horas - Math.floor(horas)) * 60)).padStart(2, "0")}min`
                : "—"}
            </span>
            {horas > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({horas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}h)
              </span>
            )}
            {horas <= 0 && horaInicio && horaFim && (
              <span className="text-muted-foreground ml-2 text-xs">
                (ajuste os horários; se o turno passar da meia-noite, o fim deve ser menor que o início)
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex gap-3 flex-col sm:flex-row">
        <button
          onClick={limpar}
          className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Limpar
        </button>
        <button
          onClick={handleSalvar}
          disabled={!podeSalvarBase || salvarMutation.isPending}
          className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:pointer-events-none"
        >
          {salvarMutation.isPending ? "Salvando..." : emEdicao ? "Salvar alterações" : "Salvar lançamento"}
        </button>
      </div>
      {salvarMutation.isError && (
        <p className="text-sm text-destructive mt-3">
          {salvarMutation.error instanceof Error
            ? salvarMutation.error.message
            : "Não foi possível registrar. Tente novamente."}
        </p>
      )}

      {confirmado && (
        <div className={`${cardClass} mt-6 border-accent`}>
          <p className="text-sm text-accent font-medium">
            ✓ {emEdicao ? "Lançamento atualizado com sucesso!" : "Lançamento registrado com sucesso!"}
          </p>
        </div>
      )}
    </div>
  );
}
