/**
 * B3 Trading Calendar Engine (Official 2026 Edition)
 * Contagem rigorosa de sessões de negociação da B3 (Brasil, Bolsa, Balcão).
 */

export type BusinessDate = string; // Formato estrito 'YYYY-MM-DD'

export const SUPPORTED_YEARS = [2026] as const;

export class UnsupportedB3CalendarYearError extends Error {
  constructor(year: number) {
    super(`Ano ${year} não suportado pelo calendário B3 oficial do sistema. Anos suportados: ${SUPPORTED_YEARS.join(', ')}`);
    this.name = 'UnsupportedB3CalendarYearError';
  }
}

/**
 * Retorna a data de hoje no fuso horário oficial da B3 (America/Sao_Paulo)
 * Garante que avaliações após as 21h UTC não avancem inadvertidamente para o dia seguinte.
 */
export function getBrazilTodayDate(refDate: Date = new Date()): BusinessDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(refDate) as BusinessDate;
}

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

  if (!SUPPORTED_YEARS.includes(y as (typeof SUPPORTED_YEARS)[number])) {
    throw new UnsupportedB3CalendarYearError(y);
  }

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

export type CalendarConvention =
  | 'EXCLUDE_START_INCLUDE_END' // Padrão de contagem de dias úteis transcorridos (D0, Dn]
  | 'INCLUDE_START_EXCLUDE_END' // Padrão canônico B3 para taxas DI acumuladas no período [D0, Dn)
  | 'INCLUDE_BOTH';

/**
 * Retorna todas as sessões de negociação da B3 entre duas datas
 */
export function getB3TradingDays(
  startStr: BusinessDate,
  endStr: BusinessDate,
  convention: CalendarConvention = 'EXCLUDE_START_INCLUDE_END'
): BusinessDate[] {
  const start = parseBusinessDate(startStr);
  const end = parseBusinessDate(endStr);

  const startYear = parseInt(start.split('-')[0], 10);
  const endYear = parseInt(end.split('-')[0], 10);

  if (!SUPPORTED_YEARS.includes(startYear as (typeof SUPPORTED_YEARS)[number])) {
    throw new UnsupportedB3CalendarYearError(startYear);
  }
  if (!SUPPORTED_YEARS.includes(endYear as (typeof SUPPORTED_YEARS)[number])) {
    throw new UnsupportedB3CalendarYearError(endYear);
  }

  if (start > end) return [];

  const [sy, sm, sd] = start.split('-').map((v) => parseInt(v, 10));
  const [ey, em, ed] = end.split('-').map((v) => parseInt(v, 10));

  const cur = new Date(sy, sm - 1, sd);
  const targetEnd = new Date(ey, em - 1, ed);

  const days: BusinessDate[] = [];

  if (convention === 'EXCLUDE_START_INCLUDE_END') {
    cur.setDate(cur.getDate() + 1);
  }

  while (convention === 'INCLUDE_START_EXCLUDE_END' ? cur < targetEnd : cur <= targetEnd) {
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
 */
export function countB3TradingDays(
  startStr: BusinessDate,
  endStr: BusinessDate,
  convention: CalendarConvention = 'EXCLUDE_START_INCLUDE_END'
): number {
  return getB3TradingDays(startStr, endStr, convention).length;
}

/**
 * Retorna as datas de observação da Taxa DI aplicáveis no período entre a abertura (openDate) e valorização (valuationDate)
 * Metodologia Oficial B3: intervalo [openDate, valuationDate) onde cada dia D_k remunera a passagem para D_{k+1}.
 */
export function getDiObservationDates(
  openDateStr: BusinessDate,
  valuationDateStr: BusinessDate
): BusinessDate[] {
  return getB3TradingDays(openDateStr, valuationDateStr, 'INCLUDE_START_EXCLUDE_END');
}

/**
 * Normaliza uma data para o dia útil de pregão da B3 mais recente (mesmo dia se útil, ou dia útil anterior caso fim de semana/feriado)
 */
export function getPreviousOrSameB3TradingDay(dateStr: BusinessDate): BusinessDate {
  const clean = parseBusinessDate(dateStr);
  const [yStr, mStr, dStr] = clean.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = parseInt(dStr, 10);

  if (!SUPPORTED_YEARS.includes(y as (typeof SUPPORTED_YEARS)[number])) {
    throw new UnsupportedB3CalendarYearError(y);
  }

  const cur = new Date(y, m, d);
  while (true) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dStrFormatted = `${yyyy}-${mm}-${dd}` as BusinessDate;

    if (isB3TradingDay(dStrFormatted)) {
      return dStrFormatted;
    }
    cur.setDate(cur.getDate() - 1);
  }
}

/**
 * Normaliza uma data para o dia útil de pregão da B3 inicial (mesmo dia se útil, ou próximo dia útil caso fim de semana/feriado)
 * Usado para início de operações registradas fora de pregão (ex: ordens enviadas em fins de semana)
 */
export function getNextOrSameB3TradingDay(dateStr: BusinessDate): BusinessDate {
  const clean = parseBusinessDate(dateStr);
  const [yStr, mStr, dStr] = clean.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  const d = parseInt(dStr, 10);

  if (!SUPPORTED_YEARS.includes(y as (typeof SUPPORTED_YEARS)[number])) {
    throw new UnsupportedB3CalendarYearError(y);
  }

  const cur = new Date(y, m, d);
  while (true) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    const dStrFormatted = `${yyyy}-${mm}-${dd}` as BusinessDate;

    if (isB3TradingDay(dStrFormatted)) {
      return dStrFormatted;
    }
    cur.setDate(cur.getDate() + 1);
  }
}
