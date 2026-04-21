/** Ordinal for UI copy (1st, 2nd, 3rd, …). */
export function ordinalEn(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

export function articleLabel(number: number, suffix: string | null): string {
  const suf = suffix ? `-${suffix.toUpperCase()}` : "";
  return `Article ${number}${suf}`;
}

export function formatShortIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
