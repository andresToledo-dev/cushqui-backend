import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp, createTestAccount, deactivateAccounts, deleteIntegrations } from "./shared-test.module";

describe("Convert transaction to transfer (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let accountA: string;
  let accountB: string;
  let tokenA: string;
  let tokenB: string;
  const integrationIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${accessToken}` });
  const balanceOf = async (id: string): Promise<number> => (await api().get(`/api/v1/accounts/${id}`).set(auth()).expect(200)).body.balance;

  const createIntegration = async (name: string, accountId: string): Promise<string> => {
    const res = await api()
      .post("/api/v1/integrations")
      .set(auth())
      .send({ name, type: "NOTIFICATION", accountId, expenseWords: "has enviado", incomeWords: "has recibido" })
      .expect(201);
    integrationIds.push(res.body.id);
    return res.body.plainToken;
  };

  const notify = async (token: string, message: string, date: string) =>
    (await api().post("/api/v1/imports/notification").set("Authorization", `Bearer ${token}`).send({ message, date }).expect(200)).body;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
    accountA = await createTestAccount("Convert A", 1000);
    accountB = await createTestAccount("Convert B", 200);
    tokenA = await createIntegration("convert_a", accountA);
    tokenB = await createIntegration("convert_b", accountB);
  });

  afterAll(async () => {
    await deleteIntegrations(integrationIds);
    await deactivateAccounts([accountA, accountB]);
    await closeSharedTestApp();
  });

  it("should convert one imported expense: only the other account changes", async () => {
    const date = new Date().toISOString();
    const message = "Has enviado 500.00€ a Ahorro";
    const imported = await notify(tokenA, message, date);
    expect(imported.created).toBe(true);
    expect(await balanceOf(accountA)).toBe(500);

    const res = await api()
      .post(`/api/v1/transactions/${imported.transactionId}/convert-to-transfer`)
      .set(auth())
      .send({ otherAccountId: accountB })
      .expect(201);

    expect(res.body).toMatchObject({ type: "TRANSFER", amount: 500, account: { id: accountA }, toAccount: { id: accountB } });
    expect(await balanceOf(accountA)).toBe(500);
    expect(await balanceOf(accountB)).toBe(700);

    // It is no longer a transaction, and the movements show the transfer
    await api().get(`/api/v1/transactions/${imported.transactionId}`).set(auth()).expect(404);
    const movements = await api().get(`/api/v1/movements?accountId=${accountB}&type=TRANSFER`).set(auth()).expect(200);
    expect(movements.body.data.map((movement: { id: string }) => movement.id)).toContain(res.body.id);

    // Reports stop counting the expense
    const account = await api().get(`/api/v1/accounts/${accountA}`).set(auth()).expect(200);
    const stats = await api().get("/api/v1/statistics/accounts").set(auth()).expect(200);
    expect(stats.body.find((row: { account: string }) => row.account === account.body.name).expenses).toBe(0);

    // The notification sent again is still a duplicate: no new expense
    const resent = await notify(tokenA, message, date);
    expect(resent).toMatchObject({ created: false, duplicate: true });
    expect(await balanceOf(accountA)).toBe(500);

    // Converting it again is not possible
    await api()
      .post(`/api/v1/transactions/${imported.transactionId}/convert-to-transfer`)
      .set(auth())
      .send({ otherAccountId: accountB })
      .expect(404);
    expect(await balanceOf(accountB)).toBe(700);
  });

  it("should propose the other side and convert both without changing balances", async () => {
    const date = new Date().toISOString();
    const expense = await notify(tokenA, "Has enviado 100.00€ a Cuenta B", date);
    const income = await notify(tokenB, "Has recibido 100.00€ de Cuenta A", date);
    expect(await balanceOf(accountA)).toBe(400);
    expect(await balanceOf(accountB)).toBe(800);

    const candidates = await api().get(`/api/v1/transactions/${expense.transactionId}/transfer-candidates`).set(auth()).expect(200);
    expect(candidates.body.map((candidate: { id: string }) => candidate.id)).toContain(income.transactionId);

    const res = await api()
      .post(`/api/v1/transactions/${expense.transactionId}/convert-to-transfer`)
      .set(auth())
      .send({ otherTransactionId: income.transactionId })
      .expect(201);

    expect(res.body).toMatchObject({ amount: 100, account: { id: accountA }, toAccount: { id: accountB } });
    expect(await balanceOf(accountA)).toBe(400);
    expect(await balanceOf(accountB)).toBe(800);
    await api().get(`/api/v1/transactions/${income.transactionId}`).set(auth()).expect(404);
  });

  it("should reject another amount and the same account", async () => {
    const date = new Date().toISOString();
    const expense = await notify(tokenA, "Has enviado 10.00€ a Cuenta B", date);
    const income = await notify(tokenB, "Has recibido 9.00€ de Cuenta A", date);

    await api()
      .post(`/api/v1/transactions/${expense.transactionId}/convert-to-transfer`)
      .set(auth())
      .send({ otherTransactionId: income.transactionId })
      .expect(400);

    await api()
      .post(`/api/v1/transactions/${expense.transactionId}/convert-to-transfer`)
      .set(auth())
      .send({ otherAccountId: accountA })
      .expect(400);
  });
});
