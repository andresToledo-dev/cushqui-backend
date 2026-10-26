import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp, findCategory, createTestAccount, deactivateAccounts } from './shared-test.module';

describe('Transaction Manual Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let transactionId: string;
  let initialBalance: number;
  let expectedBalance: number;

  // INCOME category of the seed user ("Salario") and an "E2E" subcategory under it, created once if missing
  let categoryId: string;
  let subcategoryId: string;
  let accountId: string; // own account: other suites must not change its balance
  const incomeAmount = 10;
  const editedAmount = 5;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
    accountId = await createTestAccount('Transaction manual');

    const salario = await findCategory('Salario', 'INCOME');
    categoryId = salario.id;
    subcategoryId = salario.subcategories.find((s: any) => s.name === 'E2E')?.id;
    if (!subcategoryId) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories/subcategories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E', parentCategoryId: categoryId, color: '#64B5F6' })
        .expect(201);
      subcategoryId = res.body.id;
    }
  });

  afterAll(async () => {
    await deactivateAccounts([accountId]);
    await closeSharedTestApp();
  });

  describe('Manual transaction: INCOME -> edit -> delete', () => {
    it('should login with seed user and get access token', () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
      console.log('✅ Access token obtained:', accessToken.substring(0, 20) + '...');
    });

    it('should get initial account balance and store it', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      initialBalance = res.body.balance;
      expectedBalance = initialBalance;
      console.log('✅ Initial account balance stored:', { initialBalance, expectedBalance });
      expect(res.body.balance).toBeDefined();
    });

    it('should create an INCOME transaction of 10 EUR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
          amount: incomeAmount,
          currency: 'EUR',
          type: 'INCOME',
          categoryId,
          subcategoryId,
          transactionDate: new Date().toISOString(),
          merchant: 'Test Income',
          description: 'Manual income test',
        })
        .expect(201);

      expect(res.body.amount).toBe(incomeAmount);
      expect(res.body.type).toBe('INCOME');
      expect(res.body.status).toBe('CLASSIFIED');
      expect(res.body.categoryId).toBe(categoryId);
      expect(res.body.subcategoryId).toBe(subcategoryId);

      transactionId = res.body.id;
      // INCOME adds to balance
      expectedBalance += incomeAmount;
      console.log('✅ POST /transactions (INCOME) response:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected balance after INCOME:', expectedBalance);
    });

    it('should verify account balance increased by income amount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      console.log('✅ Account balance after INCOME:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected:', expectedBalance, '| Received:', res.body.balance);
      expect(res.body.balance).toBe(expectedBalance);
    });

    it('should edit the transaction to 5 EUR', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: editedAmount,
        })
        .expect(200);

      expect(res.body.amount).toBe(editedAmount);
      expect(res.body.id).toBe(transactionId);
      // Adjust expected balance: remove old amount, add new amount
      expectedBalance = expectedBalance - incomeAmount + editedAmount;
      console.log('✅ PATCH /transactions/:id response:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected balance after edit:', expectedBalance);
    });

    it('should verify account balance adjusted correctly after edit', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      console.log('✅ Account balance after edit:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected:', expectedBalance, '| Received:', res.body.balance);
      expect(res.body.balance).toBe(expectedBalance);
    });

    it('should delete the transaction (soft delete)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Delete reverses the effect of the transaction
      expectedBalance -= editedAmount;
      console.log('✅ DELETE /transactions/:id - 204 No Content');
      console.log('📊 Expected balance after delete:', expectedBalance);
    });

    it('should verify account balance back to initial after delete', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      console.log('✅ Account balance after delete:', JSON.stringify(res.body, null, 2));
      console.log('📊 Expected:', expectedBalance, '| Received:', res.body.balance);
      expect(res.body.balance).toBe(expectedBalance);
      // Should be back to initial balance
      expect(res.body.balance).toBe(initialBalance);
    });

    it('should verify transaction is soft deleted (not in list)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 10 })
        .expect(200);

      const deletedTx = res.body.data.find((tx: any) => tx.id === transactionId);
      expect(deletedTx).toBeUndefined();
      console.log('✅ Verified transaction is soft deleted - not in transactions list');
    });
  });
});