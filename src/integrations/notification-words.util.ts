import { FinalDecision } from '@prisma/client';

/**
 * Cleans a comma-separated list as typed by the user: trims each word, drops empty ones and
 * repeats (case-insensitive) and joins them back with ",". This is what gets stored and returned.
 */
export function normalizeWords(input: string): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of input.split(',')) {
    const word = raw.trim().replace(/\s+/g, ' ');
    const key = word.toLowerCase();
    if (word && !seen.has(key)) {
      seen.add(key);
      words.push(word);
    }
  }
  return words.join(',');
}

/** Stored list → lowercase words ready to compare. */
export function parseWords(stored: string | null | undefined): string[] {
  return stored ? normalizeWords(stored).toLowerCase().split(',').filter(Boolean) : [];
}

/**
 * Expense or income depending on which list has words contained in the message (case-insensitive).
 * Matches in both lists, or in none, are ambiguous → NA (no transaction is created).
 */
export function classifyMessage(
  message: string,
  expenseWords: string | null | undefined,
  incomeWords: string | null | undefined,
): FinalDecision {
  const text = message.toLowerCase();
  const isExpense = parseWords(expenseWords).some((word) => text.includes(word));
  const isIncome = parseWords(incomeWords).some((word) => text.includes(word));

  if (isExpense === isIncome) return FinalDecision.NA;
  return isExpense ? FinalDecision.EXPENSE : FinalDecision.INCOME;
}
