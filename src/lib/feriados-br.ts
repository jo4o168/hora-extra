import Holidays from "date-holidays";

const br = new Holidays("BR");

/**
 * Feriados nacionais (tipo `public` no calendário BR do date-holidays).
 * Datas sem ano válido ou fora do calendário retornam não feriado.
 */
export function getFeriadoNacionalInfo(isoDateYmd: string): { isFeriado: boolean; nome?: string } {
  if (!isoDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(isoDateYmd)) {
    return { isFeriado: false };
  }

  const d = new Date(`${isoDateYmd}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { isFeriado: false };
  }

  const hit = br.isHoliday(d);
  if (!hit) {
    return { isFeriado: false };
  }

  const list = Array.isArray(hit) ? hit : [hit];
  const pub = list.find((h) => h.type === "public");
  if (!pub) {
    return { isFeriado: false };
  }

  return { isFeriado: true, nome: pub.name };
}

export function isFeriadoNacionalBr(isoDateYmd: string): boolean {
  return getFeriadoNacionalInfo(isoDateYmd).isFeriado;
}
