import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp, createTestAccount, deactivateAccounts } from './shared-test.module';

describe('Transfer Account Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let fromInitialBalance: number;
  let toInitialBalance: number;
  let fromExpectedBalance: number;
  let toExpectedBalance: number;
  let movementId: string;

  // Own accounts: other suites running in parallel must not change these balances
  let fromAccountId: string;
  let toAccountId: string;
  const transferAmount = 50;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
    [fromAccountId, toAccountId] = await Promise.all([createTestAccount('Transfer from'), createTestAccount('Transfer to')]);
  });

  afterAll(async () => {
    await deactivateAccounts([fromAccountId, toAccountId]);
    await closeSharedTestApp();
  });

  describe('Transfer: source -> destination', () => {
    it('should login with seed user and get access token', () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
      console.log('✅ Access token obtained:', accessToken.substring(0, 20) + '...');
    });

    it('should get initial balances for both accounts and store them', async () => {
      const [fromRes, toRes] = await Promise.all([
        request(app.getHttpServer()).get(`/api/v1/accounts/${fromAccountId}`).set('Authorization', `Bearer ${accessToken}`).expect(200),
        request(app.getHttpServer()).get(`/api/v1/accounts/${toAccountId}`).set('Authorization', `Bearer ${accessToken}`).expect(200),
      ]);

      fromInitialBalance = fromRes.body.balance;
      toInitialBalance = toRes.body.balance;
      fromExpectedBalance = fromInitialBalance;
      toExpectedBalance = toInitialBalance;

      console.log('✅ Initial from account:', JSON.stringify(fromRes.body, null, 2));
      console.log('✅ Initial to account:', JSON.stringify(toRes.body, null, 2));
      console.log('📊 Stored initial balances - From:', fromInitialBalance, '| To:', toInitialBalance);

      expect(fromRes.body.balance).toBeDefined();
      expect(toRes.body.balance).toBeDefined();
    });

    it('should create a transfer of 50 EUR from source to destination', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fromAccountId,
          toAccountId,
          amount: transferAmount,
          currency: 'EUR',
          date: new Date().toISOString(),
        })
        .expect(201);

      expect(res.body.amount).toBe(transferAmount);
      expect(res.body.currency).toBe('EUR');
      expect(res.body.movementId).toBeDefined();
      movementId = res.body.movementId;

      // Update expected balances
      fromExpectedBalance -= transferAmount; // Source account decreases
      toExpectedBalance += transferAmount;   // Destination account increases

      console.log('✅ POST /transfers response:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected balances after transfer - From:', fromExpectedBalance, '| To:', toExpectedBalance);
    });

    it('should verify source balance decreased by transfer amount', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/accounts/${fromAccountId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

      console.log('✅ Source balance after transfer:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected:', fromExpectedBalance, '| Received:', res.body.balance);
      expect(res.body.balance).toBe(fromExpectedBalance);
    });

    it('should verify destination balance increased by transfer amount', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/accounts/${toAccountId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);

      console.log('✅ Destination balance after transfer:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected:', toExpectedBalance, '| Received:', res.body.balance);
      expect(res.body.balance).toBe(toExpectedBalance);
    });

    it('should record ONE TRANSFER movement with both account references', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ type: 'TRANSFER', limit: 100 })
        .expect(200);

      const matching = res.body.data.filter((m: any) => m.id === movementId);
      expect(matching).toHaveLength(1);

      const movement = matching[0];
      expect(movement.type).toBe('TRANSFER');
      expect(movement.amount).toBe(transferAmount);
      expect(movement.account.id).toBe(fromAccountId);
      expect(movement.toAccount.id).toBe(toAccountId);

      console.log('✅ Verified single TRANSFER movement:', JSON.stringify(movement, null, 2));
    });

    it('should not list the transfer in /transactions', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/transactions').set('Authorization', `Bearer ${accessToken}`).query({ limit: 100 }).expect(200);

      expect(res.body.data.some((tx: any) => tx.id === movementId)).toBe(false);
      expect(res.body.data.every((tx: any) => tx.type === 'INCOME' || tx.type === 'EXPENSE')).toBe(true);
    });
  });
});