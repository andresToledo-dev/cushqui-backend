import { extractAmount, parseAmount } from './notification-amount.util';

describe('parseAmount', () => {
  it.each([
    ['12.05', 12.05],
    ['12,05', 12.05],
    ['1203', 1203],
    ['1203,03', 1203.03],
    ['1203.03', 1203.03],
    ['1.190', 1190],
    ['1190,00', 1190],
    ['15.9', 15.9],
    ['1.190,50', 1190.5],
    ['1,190.50', 1190.5],
    ['1.190.000', 1190000],
    ['12.', 12],
  ])('reads %s as %d', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
});

describe('extractAmount', () => {
  it('reads the Revolut transfer amount with a thousands separator', () => {
    const message = 'Transferencia realizada ✅\nHas enviado 1.190 € a Produtividade Crescente Imobiliaria. Llegará en segundos';
    expect(extractAmount(message)).toBe(1190);
  });

  it('reads the whole amount, not only its last group', () => {
    expect(extractAmount('Has recibido 1.190.000 € de Empresa SL')).toBe(1190000);
  });

  it.each([
    ['Has enviado 15.90€ a Juan Pablo', 15.9],
    ['Compra de €13.05 confirmada, CONTINENTE', 13.05],
    ['Pago de € 13.05 en Bar', 13.05],
    ['Compra de 12,05 EUR en Pingo Doce', 12.05],
    ['Compra de EUR 12,05 en Pingo Doce', 12.05],
    ['Compra de 12,05eur en Pingo Doce', 12.05],
    ['Pagaste 10 € y te han enviado 20 €', 10],
  ])('reads "%s" as %d', (message, expected) => {
    expect(extractAmount(message)).toBe(expected);
  });

  it.each([
    ['without currency', 'Tu código es 1234'],
    ['with EUR inside another word', 'Pedido 1234 EUROPA'],
  ])('returns null %s', (_label, message) => {
    expect(extractAmount(message)).toBeNull();
  });
});
