import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from './shared-test.module';

/**
 * Scenario:
 *   open Revolut 500 · open Caixa 10 · adjust Revolut to 510 · transfer 30 Revolut -> Caixa
 *   · edit the transfer to 20 (no extra movement recorded)
 */
describe('Movements Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let revolutId: string;
  let caixaId: string;
  let transferId: string;

  const suffix = Date.now();

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);

  const getMovements = async (accountId: string) => {
    const res = await auth(api().get('/api/v1/movements').query({ accountId, limit: 100 })).expect(200);
    return res.body.data;
  };

  const getBalance = async (accountId: string) => {
    const res = await auth(api().get(`/api/v1/accounts/${accountId}`)).expect(200);
    return res.body.balance;
  };

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  it('should open Revolut with 500 EUR and Caixa with 10 EUR', async () => {
    const revolut = await auth(api().post('/api/v1/accounts'))
      .send({ name: `Revolut ${suffix}`, type: 'BANK', currency: 'EUR', balance: 500 })
      .expect(201);
    const caixa = await auth(api().post('/api/v1/accounts'))
      .send({ name: `Caixa ${suffix}`, type: 'BANK', currency: 'EUR', balance: 10 })
      .expect(201);

    revolutId = revolut.body.id;
    caixaId = caixa.body.id;

    expect(revolut.body.balance).toBe(500);
    expect(caixa.body.balance).toBe(10);
  });

  it('should record an OPENING for each account', async () => {
    const [revolutMovements, caixaMovements] = await Promise.all([getMovements(revolutId), getMovements(caixaId)]);

    expect(revolutMovements).toEqual([expect.objectContaining({ type: 'OPENING', amount: 500 })]);
    expect(caixaMovements).toEqual([expect.objectContaining({ type: 'OPENING', amount: 10 })]);
  });

  it('should adjust Revolut to 510 EUR and record +10', async () => {
    const res = await auth(api().post(`/api/v1/accounts/${revolutId}/adjustments`))
      .send({ balance: 510, note: 'Missing income' })
      .expect(201);

    expect(res.body.balance).toBe(510);

    const adjustment = (await getMovements(revolutId)).find((m: any) => m.type === 'ADJUSTMENT');
    expect(adjustment).toEqual(
      expect.objectContaining({ amount: 10, balanceBefore: 500, balanceAfter: 510, note: 'Missing income' }),
    );
  });

  it('should transfer 30 EUR from Revolut to Caixa as a single movement', async () => {
    const res = await auth(api().post('/api/v1/transfers'))
      .send({ fromAccountId: revolutId, toAccountId: caixaId, amount: 30, currency: 'EUR', date: new Date().toISOString() })
      .expect(201);

    transferId = res.body.movementId;

    expect(await getBalance(revolutId)).toBe(480);
    expect(await getBalance(caixaId)).toBe(40);
  });

  it('should return the full history: 2 openings, 1 adjustment, 1 transfer', async () => {
    const [revolutMovements, caixaMovements] = await Promise.all([getMovements(revolutId), getMovements(caixaId)]);
    const all = new Map<string, any>([...revolutMovements, ...caixaMovements].map((m: any) => [m.id, m]));

    expect(all.size).toBe(4);
    expect([...all.values()].map((m) => m.type).sort()).toEqual(['ADJUSTMENT', 'OPENING', 'OPENING', 'TRANSFER']);

    const transfer = all.get(transferId);
    expect(transfer).toEqual(
      expect.objectContaining({
        type: 'TRANSFER',
        amount: 30,
        account: { id: revolutId, name: `Revolut ${suffix}` },
        toAccount: { id: caixaId, name: `Caixa ${suffix}` },
      }),
    );

    // The transfer shows up in both accounts' history
    expect(caixaMovements.some((m: any) => m.id === transferId)).toBe(true);
  });

  it('should not create any transaction for these movements', async () => {
    const res = await auth(api().get('/api/v1/transactions').query({ accountId: revolutId })).expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('should edit the transfer to 20 EUR without recording a new movement', async () => {
    const res = await auth(api().patch(`/api/v1/transfers/${transferId}`)).send({ amount: 20 }).expect(200);

    expect(res.body.amount).toBe(20);
    expect(await getBalance(revolutId)).toBe(490);
    expect(await getBalance(caixaId)).toBe(30);

    const [revolutMovements, caixaMovements] = await Promise.all([getMovements(revolutId), getMovements(caixaId)]);
    const all = new Map<string, any>([...revolutMovements, ...caixaMovements].map((m: any) => [m.id, m]));

    expect(all.size).toBe(4);
    expect(all.get(transferId).amount).toBe(20);
  });

  it('should not allow editing an OPENING or ADJUSTMENT through /transfers', async () => {
    const opening = (await getMovements(revolutId)).find((m: any) => m.type === 'OPENING');

    await auth(api().patch(`/api/v1/transfers/${opening.id}`)).send({ amount: 1 }).expect(404);
  });
});
