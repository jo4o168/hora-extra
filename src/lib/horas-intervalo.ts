/**
 * Calcula duração em horas entre dois horários no formato HH:mm (24h).
 * Se o término for <= início, assume turno que cruza meia-noite (ex.: 22:00 → 02:00).
 */
export function calcHorasEntreHorarios(inicioHHmm: string, fimHHmm: string): number {
  if (!inicioHHmm?.trim() || !fimHHmm?.trim()) return 0;
  const [ih, im] = inicioHHmm.split(":").map((n) => Number(n));
  const [fh, fm] = fimHHmm.split(":").map((n) => Number(n));
  if ([ih, im, fh, fm].some((n) => Number.isNaN(n))) return 0;

  let start = ih * 60 + im;
  let end = fh * 60 + fm;
  if (end <= start) {
    end += 24 * 60;
  }
  const minutes = end - start;
  return Math.round((minutes / 60) * 100) / 100;
}
