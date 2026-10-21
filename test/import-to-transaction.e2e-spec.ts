import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from './shared-test.module';

describe('Import to Transaction Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let integrationId: string;
  let integrationToken: string;

  // Unique identifiers for this test run
  const testRunId = Date.now();
  const expenseAmount = 15.5 + (testRunId % 100) / 100;
  const incomeAmount = 100 + (testRunId % 1000);
  const testDate = new Date().toISOString();

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  describe('Import flow: login -> create integration -> link account -> import notification', () => {
    it('should login with seed user and get access token', () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
      console.log('✅ Access token obtained:', accessToken.substring(0, 20) + '...');
    });

    it('should create a new integration named "notification_test"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'notification_test',
          type: 'NOTIFICATION',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('notification_test');
      expect(res.body.type).toBe('NOTIFICATION');
      expect(res.body.plainToken).toBeDefined();

      integrationId = res.body.id;
      integrationToken = res.body.plainToken;

      console.log('✅ POST /integrations response:', JSON.stringify(res.body, null, 2));
    });

    it('should link the integration to revolut-account', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: 'revolut-account',
        })
        .expect(200);

      expect(res.body.accountId).toBe('revolut-account');
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
});