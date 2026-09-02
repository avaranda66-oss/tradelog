/**
 * B3 Trading Calendar Engine (Official 2026 Edition)
 * Contagem rigorosa de sessões de negociação da B3 (Brasil, Bolsa, Balcão).
 */

export type BusinessDate = string; // Formato estrito 'YYYY-MM-DD'

export const SUPPORTED_YEARS = [2026] as const;

/**
 * Feriados Oficiais da B3 em 2026 (Sem Negociação):
 * - 01/01/2026 (Ano Novo)
 * - 16/02/2026 e 17/02/2026 (Carnaval)
 * - 03/04/2026 (Paixão de Cristo / Sexta-feira Santa)
 * - 21/04/2026 (Tiradentes)
 * - 01/05/2026 (Dia do Trabalho)
 * - 04/06/2026 (Corpus Christi)
 * - 07/09/2026 (Independência do Brasil)
 * - 12/10/2026 (Nossa Senhora Aparecida)
 * - 02/11/2026 (Finados)
 * - 20/11/2026 (Dia da Consciência Negra)
 * - 24/12/2026 (Véspera de Natal - sem pregão)
 * - 25/12/2026 (Natal)
 * - 31/12/2026 (Último dia útil do ano - sem pregão)
 * 
 * NOTA:
 * - 18/02/2026 (Quarta de Cinzas): Negociação especial a partir das 13h -> É trading day.
 * - 09/07/2026 (Revolução Constitucionalista SP): Pregão normal na B3 -> É trading day.
 */
const B3_HOLIDAYS_2026 = new Set<string>([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-04-03',
  '2026-04-21',
  '2026-05-01',
  '2026-06-04',
  '2026-09-07',
  '2026-10-12',
  '2026-11-02',
  '2026-11-20',
  '2026-12-24',
  '2026-12-25',
  '2026-12-31',
]);

/**
 * Validador estrito de data financeira (YYYY-MM-DD) sem parsing UTC inconsistente
 */
export function parseBusinessDate(raw: string): BusinessDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`Data com formato inválido: "${raw}". Formato esperado: YYYY-MM-DD`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (year < 2020 || year > 2035) {
    throw new Error(`Ano fora do range suportado: ${year}`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`Mês inválido: ${month}`);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    throw new Error(`Dia inválido (${day}) para o mês ${month}/${year}`);
  }

  return raw as BusinessDate;
}

/**
 * Verifica se uma data específica é sessão de negociação ativa da B3
 */
export function isB3TradingDay(dateStr: BusinessDate): boolean {
  const clean = parseBusinessDate(dateStr);
  const [yStr, mStr, dStr] = clean.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = parseInt(dStr, 10);

  // Date local sem offset UTC
  const dt = new Date(y, m, d);
  const dayOfWeek = dt.getDay();

  // Fim de semana (0 = Domingo, 6 = Sábado)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Feriado oficial B3
  if (B3_HOLIDAYS_2026.has(clean)) {
    return false;
  }

  return true;
}

/**
 * Retorna todas as sessões de negociação da B3 entre duas datas
 * Convenção padrão: (start, end] (start excluído, end incluído)
 */
export function getB3TradingDays(
  startStr: BusinessDate,
  endStr: BusinessDate,
  convention: 'EXCLUDE_START_INCLUDE_END' | 'INCLUDE_BOTH' = 'EXCLUDE_START_INCLUDE_END'
): BusinessDate[] {
  const start = parseBusinessDate(startStr);
  const end = parseBusinessDate(endStr);

  if (start > end) return [];

  const [sy, sm, sd] = start.split('-').map((v) => parseInt(v, 10));
  const [ey, em, ed] = end.split('-').map((v) => parseInt(v, 10));

  const cur = new Date(sy, sm - 1, sd);
  const targetEnd = new Date(ey, em - 1, ed);

  const days: BusinessDate[] = [];

  if (convention === 'EXCLUDE_START_INCLUDE_END') {
    cur.setDate(cur.getDate() + 1);
  }

  while (cur <= targetEnd) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dStr = `${yyyy}-${mm}-${dd}` as BusinessDate;

    if (isB3TradingDay(dStr)) {
      days.push(dStr);
    }
    cur.setDate(cur.getDate() + 1);
  }

  return days;
}

/**
 * Conta o número de sessões B3 úteis entre duas datas
 * Convenção padrão: (start, end] (start excluído, end incluído)
 */
export function countB3TradingDays(
  startStr: BusinessDate,
  endStr: BusinessDate,
  convention: 'EXCLUDE_START_INCLUDE_END' | 'INCLUDE_BOTH' = 'EXCLUDE_START_INCLUDE_END'
): number {
  return getB3TradingDays(startStr, endStr, convention).length;
}
