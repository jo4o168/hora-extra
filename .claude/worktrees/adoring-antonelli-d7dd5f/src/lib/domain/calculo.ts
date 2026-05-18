import type { Colaborador } from "./types";

function calcularValorHora(colab: Colaborador): number {
  if (colab.regime === "PJ") return colab.valorHora || 0;
  return colab.salario / 220;
}

export function calcularValor(colab: Colaborador, horas: number, feriado: boolean): number {
  const valorHora = calcularValorHora(colab);
  const multiplicador = feriado ? 2 : 1.5;
  return valorHora * horas * multiplicador;
}

export function getValorHoraDisplay(colab: Colaborador): string {
  const salario = colab.salario > 0 ? colab.salario : (colab.valorHora ?? 0);
  return `R$ ${salario.toLocaleString("pt-BR")}/mês`;
}
