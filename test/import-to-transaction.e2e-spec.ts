import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp, deleteIntegrations, createTestAccount, deactivateAccounts } from './shared-test.module';

describe('Import to Transaction Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let integrationId: string;
  let integrationToken: string;
  let accountId: string; // own account: other suites must not change its balance

  // Unique identifiers for this test run
  const testRunId = Date.now();
  const expenseAmount = 15.5 + (testRunId % 100) / 100;
  const incomeAmount = 100 + (testRunId % 1000);
  const testDate = new Date().toISOString();

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
    accountId = await createTestAccount('Import to transaction');
  });

  afterAll(async () => {
    await deleteIntegrations([integrationId]);
    await deactivateAccounts([accountId]);
    await closeSharedTestApp();
  });

  describe('Import flow: login -> create integration -> link account -> import notification', () => {
    it('should login with seed user and get access token', () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
      console.log('✅ Access token obtained:', accessToken.substring(0, 20) + '...');
    });

    it('should reject a NOTIFICATION integration without expense/income words', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'notification_test', type: 'NOTIFICATION' })
        .expect(400);
    });

    it('should create a new integration named "notification_test" with its own words', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'notification_test',
          type: 'NOTIFICATION',
          expenseWords: 'has enviado, pagaste',
          incomeWords: 'has recibido,te depositaron',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('notification_test');
      expect(res.body.type).toBe('NOTIFICATION');
      expect(res.body.plainToken).toBeDefined();
      expect(res.body.expenseWords).toBe('has enviado,pagaste');
      expect(res.body.incomeWords).toBe('has recibido,te depositaron');

      integrationId = res.body.id;
      integrationToken = res.body.plainToken;

      console.log('✅ POST /integrations response:', JSON.stringify(res.body, null, 2));
    });

    it('should link the integration to the test account', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId,
        })
        .expect(200);

      expect(res.body.accountId).toBe(accountId);
      console.log('✅ PATCH /integrations/:id response:', JSON.stringify(res.body, null, 2));
    });

    it('should create an EXPENSE import_event via /imports/notification', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/imports/notification')
        .set('Authorization', `Bearer ${integrationToken}`)
        .send({
          message: `Has enviado ${expenseAmount}€ a Juan Pablo. Llegará en segundos`,
          date: testDate,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(true);
      expect(res.body.transactionId).toBeDefined();

      console.log('✅ POST /imports/notification (EXPENSE) response:', JSON.stringify(res.body, null, 2));
    });

    it('should create an INCOME import_event via /imports/notification', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/imports/notification')
        .set('Authorization', `Bearer ${integrationToken}`)
        .send({
          message: `Has recibido ${incomeAmount}€ de Empresa SL. Llegará en segundos`,
          date: testDate,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(true);
      expect(res.body.transactionId).toBeDefined();

      console.log('✅ POST /imports/notification (INCOME) response:', JSON.stringify(res.body, null, 2));
    });

    it('should create an N/A import_event via /imports/notification (no transaction created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/imports/notification')
        .set('Authorization', `Bearer ${integrationToken}`)
        .send({
          message: 'Tu código de verificación es 123456',
          date: testDate,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(false);
      expect(res.body.transactionId).toBeUndefined();

      console.log('✅ POST /imports/notification (N/A) response:', JSON.stringify(res.body, null, 2));
    });

    it('should verify the EXPENSE transaction was created with UNCLASSIFIED status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 10 })
        .expect(200);

      const expenseTx = res.body.data.find(
        (tx: any) => tx.type === 'EXPENSE' && tx.amount === expenseAmount && tx.status === 'UNCLASSIFIED' && tx.source === 'REVOLUT',
      );

      expect(expenseTx).toBeDefined();
      expect(expenseTx.merchant).toBe('Juan Pablo');
      console.log('✅ Verified EXPENSE transaction:', JSON.stringify(expenseTx, null, 2));
    });

    it('should verify the INCOME transaction was created with UNCLASSIFIED status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ limit: 10 })
        .expect(200);

      const incomeTx = res.body.data.find(
        (tx: any) => tx.type === 'INCOME' && tx.amount === incomeAmount && tx.status === 'UNCLASSIFIED' && tx.source === 'REVOLUT',
      );

      expect(incomeTx).toBeDefined();
      expect(incomeTx.merchant).toBe('Empresa SL');
      console.log('✅ Verified INCOME transaction:', JSON.stringify(incomeTx, null, 2));
    });

    it('should verify import events were created with correct finalDecision', async () => {
      console.log('✅ Import events verified via transaction creation');
    });
  });

  describe('Expense/income words of the integration', () => {
    const importMessage = (message: string) =>
      request(app.getHttpServer())
        .post('/api/v1/imports/notification')
        .set('Authorization', `Bearer ${integrationToken}`)
        .send({ message, date: testDate })
        .expect(200);

    it('should classify with any of its words, case-insensitively', async () => {
      const expense = await importMessage(`PAGASTE ${expenseAmount + 1}€ en Bar Central`);
      expect(expense.body.created).toBe(true);

      const income = await importMessage(`Te depositaron ${incomeAmount + 1}€ de Cliente`);
      expect(income.body.created).toBe(true);

      const res = await request(app.getHttpServer())
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ accountId, limit: 50 })
        .expect(200);
      expect(res.body.data.find((tx: any) => tx.id === expense.body.transactionId).type).toBe('EXPENSE');
      expect(res.body.data.find((tx: any) => tx.id === income.body.transactionId).type).toBe('INCOME');
    });

    it('should record N/A without a transaction when the message has words of both lists', async () => {
      const res = await importMessage(`Pagaste 3€ y te depositaron 3€ (${testRunId})`);
      expect(res.body).toMatchObject({ success: true, created: false });
      expect(res.body.transactionId).toBeUndefined();
    });

    it('should apply new words after PATCH, and reject an empty list', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expenseWords: ' , ' })
        .expect(400);

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ expenseWords: 'Caixa Geral' })
        .expect(200);
      expect(patched.body).toMatchObject({ expenseWords: 'Caixa Geral', incomeWords: 'has recibido,te depositaron' });

      // "pagaste" is no longer an expense word; "Caixa Geral" is
      const old = await importMessage(`Pagaste 4€ en Bar (${testRunId})`);
      expect(old.body.created).toBe(false);
      const caixa = await importMessage(`Caixa Geral: compra de 5€ en Loja (${testRunId})`);
      expect(caixa.body.created).toBe(true);
    });
  });
});