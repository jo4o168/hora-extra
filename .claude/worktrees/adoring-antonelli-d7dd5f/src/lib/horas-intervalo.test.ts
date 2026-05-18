import { describe, it, expect } from "vitest";
import { calcHorasEntreHorarios } from "./horas-intervalo";

describe("calcHorasEntreHorarios", () => {
  it("mesmo dia", () => {
    expect(calcHorasEntreHorarios("08:00", "12:00")).toBe(4);
  });
  it("com minutos", () => {
    expect(calcHorasEntreHorarios("08:30", "10:00")).toBe(1.5);
  });
  it("cruza meia-noite", () => {
    expect(calcHorasEntreHorarios("22:00", "02:00")).toBe(4);
  });
});
