/**
 * Retorna a data de hoje no formato ISO "2026-08-06"
 * Funciona tanto no server quanto no client
 */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}
