"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { calcularValor, getValorHoraDisplay } from "@/lib/domain/calculo";
import { getFeriadoNacionalInfo } from "@/lib/feriados-br";
import { calcHorasEntreHorarios } from "@/lib/horas-intervalo";
import type { CadastroResponse } from "@/lib/sheets/service";

function Badge({ regime }: { regime: string }) {
  const cls =
    regime === "CLT"
      ? "bg-[#E2EFDA] text-[#27500A]"
      : "bg-[#E6F1FB] text-[#0C447C]";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{regime}</span>
  );
}

function FeriadoNacionalBadge({ nome }: { nome: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FAEEDA] text-[#633806]">
      Feriado nacional · {nome}
    </span>
  );
}

export default function LancamentoPage() {
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

  const gestores = cadastro?.gestores ?? [];
  const colaboradores = cadastro?.colaboradores ?? [];
  const eventos = cadastro?.eventos ?? [];

  const normalized = (value: string) => value.trim().toLowerCase();
  const colabsFiltrados = colaboradores.filter((c) => normalized(c.gestorId) === normalized(gestorId));
  const colabSelecionado = colaboradores.find((c) => c.id === colaboradorId);

  const feriadoInfo = useMemo(() => getFeriadoNacionalInfo(data), [data]);
  const feriado = feriadoInfo.isFeriado;

  const horas = useMemo(
    () => calcHorasEntreHorarios(horaInicio, horaFim),
    [horaInicio, horaFim],
  );

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lancamentos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gestorId,
          colaboradorId,
          eventoId,
          data,
          horaInicio,
          horaFim,
          horas,
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
    if (!gestorId || !colaboradorId || !eventoId || !data || !horaInicio || !horaFim) return;
    if (horas <= 0) return;
    if (!cadastroDisponivel) return;

    const colab = colaboradores.find((c) => c.id === colaboradorId);
    const gestor = gestores.find((g) => g.id === gestorId);
    const evento = eventos.find((e) => e.id === eventoId);
    if (!colab || !gestor || !evento) return;

    try {
      await salvarMutation.mutateAsync();
      setConfirmado(true);
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
    horaInicio &&
    horaFim &&
    horas > 0;

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold text-foreground mb-6">Lançar horas extras</h2>
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
        <div className="grid grid-cols-2 gap-4">
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
            <span className="text-muted-foreground ml-auto">
              {getValorHoraDisplay(colabSelecionado)}
            </span>
          </div>
        )}
      </div>

      <div className={`${cardClass} mb-6`}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Dados do evento</h3>
        <div className="grid grid-cols-2 gap-4">
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
        </div>

        {horaInicio && horaFim && (
          <p className="mt-4 text-sm text-foreground">
            <span className="text-muted-foreground">Total calculado:</span>{" "}
            <span className="font-semibold">{horas > 0 ? `${horas}h` : "—"}</span>
            {horas <= 0 && horaInicio && horaFim && (
              <span className="text-muted-foreground ml-2 text-xs">
                (ajuste os horários; se o turno passar da meia-noite, o fim deve ser menor que o início)
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex gap-3">
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
          {salvarMutation.isPending ? "Salvando..." : "Salvar lançamento"}
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
          <p className="text-sm text-accent font-medium">✓ Lançamento registrado com sucesso!</p>
        </div>
      )}
    </div>
  );
}
