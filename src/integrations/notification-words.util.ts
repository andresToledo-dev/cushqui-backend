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

/** Limits of a list: at most 5 phrases, each of at most 4 words of at most 15 characters. */
export const MAX_PHRASES = 5;
export const MAX_WORDS_PER_PHRASE = 4;
export const MAX_WORD_LENGTH = 15;

/** Checks an already normalized list. Returns what is wrong with it, or null if it is valid. */
export function findWordsRuleViolation(normalized: string): string | null {
  const phrases = normalized.split(',');
  if (phrases.length > MAX_PHRASES) {
    return `must contain at most ${MAX_PHRASES} phrases`;
  }
  for (const phrase of phrases) {
    const words = phrase.split(' ');
    if (words.length > MAX_WORDS_PER_PHRASE) {
      return `"${phrase}" must have at most ${MAX_WORDS_PER_PHRASE} words`;
    }
    const longWord = words.find((word) => word.length > MAX_WORD_LENGTH);
    if (longWord) {
      return `"${longWord}" must have at most ${MAX_WORD_LENGTH} characters`;
    }
  }
  return null;
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
