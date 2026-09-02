import { createId } from '@paralleldrive/cuid2';

/**
 * Converte número no formato brasileiro (1.000,00) para float JS
 */
export function parseBRNumber(str: string): number {
  if (!str || str.trim() === '-' || str.trim() === '') return 0;
  const normalized = str.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (Number.isNaN(n)) {
    throw new Error(`Número brasileiro inválido: "${str}"`);
  }
  return n;
}

/**
 * Gera um ID único usando CUID2 com prefixo opcional
 */
export function generateId(prefix?: string): string {
  const id = createId();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Formata número para exibição brasileira
 */
export function formatBRNumber(n: number, decimals = 2): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata data ISO para exibição "06/08/2026"
 */
export function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Converte "06/08/2026" para "2026-08-06"
 */
export function parseDateBR(brDate: string): string {
  const parts = brDate.split('/');
  if (parts.length !== 3) return brDate;
  const [day, month, year] = parts;
  // Aceita ano com 2 ou 4 dígitos
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Retorna a data de hoje no formato ISO "2026-08-06"
 */
export function todayISO(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Converte pontos em resultado financeiro (2 contratos mini = pts * 0.20 * qtd)
 */
export function pointsToReais(points: number, contracts: number): number {
  return points * 0.20 * contracts;
}

/**
 * Classifica resultado como positivo, negativo ou neutro
 */
export function resultClass(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}
