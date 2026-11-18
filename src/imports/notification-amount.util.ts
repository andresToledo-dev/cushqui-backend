/** € or the code EUR as a whole word (not inside another word), case-insensitive. */
const CURRENCY = '(?:€|(?<![A-Za-z])EUR(?![A-Za-z]))';
const NUMBER = '(\\d[\\d.,]*)';

/** First amount next to the currency, before ("€13.05", "EUR 12,05") or after it ("1.190 €", "12,05 EUR"). */
const AMOUNT_WITH_CURRENCY = new RegExp(`${CURRENCY}\\s*${NUMBER}|${NUMBER}\\s*${CURRENCY}`, 'i');

/**
 * Reads a notification amount, where "." and "," can be either separator.
 * The last separator decides: 1 or 2 digits after it are decimals ("12,05", "1203.03");
 * 3 or more mean it separates thousands ("1.190" = 1190). Every other separator is a thousands one.
 */
export function parseAmount(raw: string): number | null {
  const value = raw.replace(/[.,]+$/, '');
  const lastSeparator = Math.max(value.lastIndexOf('.'), value.lastIndexOf(','));
  const integerPart = (lastSeparator === -1 ? value : value.slice(0, lastSeparator)).replace(/[.,]/g, '');
  const tail = lastSeparator === -1 ? '' : value.slice(lastSeparator + 1);

  const normalized = tail.length >= 1 && tail.length <= 2 ? `${integerPart}.${tail}` : `${integerPart}${tail}`;
  const amount = Number(normalized);
  return normalized && Number.isFinite(amount) ? amount : null;
}

/** First amount in euros of the message, or null if there is none (a number without currency is not an amount). */
export function extractAmount(message: string): number | null {
  const match = message.match(AMOUNT_WITH_CURRENCY);
  if (!match) return null;
  return parseAmount(match[1] ?? match[2]);
}
