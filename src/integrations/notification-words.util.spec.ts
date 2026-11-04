import { FinalDecision } from '@prisma/client';
import { classifyMessage, findWordsRuleViolation, normalizeWords, parseWords } from './notification-words.util';

describe('notification-words.util', () => {
  describe('normalizeWords', () => {
    it('should trim, collapse spaces and drop empty and repeated words (case-insensitive)', () => {
      expect(normalizeWords(' has enviado ,, has   gastado,HAS ENVIADO, ')).toBe('has enviado,has gastado');
    });

    it('should return an empty string when there are no words', () => {
      expect(normalizeWords(' , ,')).toBe('');
    });
  });

  describe('findWordsRuleViolation', () => {
    it.each([
      ['one word', 'pagaste'],
      ['5 phrases', 'a,b,c,d,e'],
      ['4 words in a phrase', 'te ha enviado dinero'],
      ['a word of 15 characters', 'a'.repeat(15)],
    ])('should accept %s', (_label, words) => {
      expect(findWordsRuleViolation(words)).toBeNull();
    });

    it.each([
      ['6 phrases', 'a,b,c,d,e,f', 'at most 5 phrases'],
      ['5 words in a phrase', 'te ha enviado mucho dinero', 'at most 4 words'],
      ['a word of 16 characters', `compra ${'a'.repeat(16)}`, 'at most 15 characters'],
    ])('should reject %s', (_label, words, message) => {
      expect(findWordsRuleViolation(words)).toContain(message);
    });
  });

  describe('parseWords', () => {
    it('should return lowercase words, or none for null', () => {
      expect(parseWords('Caixa Geral,Te depositaron')).toEqual(['caixa geral', 'te depositaron']);
      expect(parseWords(null)).toEqual([]);
    });
  });

  describe('classifyMessage', () => {
    const expense = 'has enviado,Caixa Geral';
    const income = 'has recibido,te han enviado';

    it.each([
      ['Has enviado 15,90 € a Juan', FinalDecision.EXPENSE],
      ['CAIXA GERAL: compra de 12,50 €', FinalDecision.EXPENSE],
      ['Has recibido 100 € de Empresa', FinalDecision.INCOME],
      ['Te han enviado 20 €', FinalDecision.INCOME],
      ['Tu código de verificación es 123456', FinalDecision.NA],
      // Words of both lists: ambiguous
      ['Caixa Geral: te han enviado 20 €', FinalDecision.NA],
    ])('"%s" → %s', (message, decision) => {
      expect(classifyMessage(message, expense, income)).toBe(decision);
    });

    it('should be NA when the integration has no words', () => {
      expect(classifyMessage('Has enviado 10 €', null, null)).toBe(FinalDecision.NA);
    });
  });
});
