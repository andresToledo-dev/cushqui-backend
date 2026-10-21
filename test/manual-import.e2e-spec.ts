import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from "./shared-test.module";

describe("Manual Import Flow (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let manualToken: string;
  let notificationToken: string;
  let accountId: string;
  let balance: number;

  // Unique per run: the name lookup must match exactly one active account
  const testRunId = Date.now();
  const accountName = `Manual Import ${testRunId}`;
  const externalId = `manual-e2e-${testRunId}`;

  const getBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/accounts/${accountId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    return res.body.balance;
  };

  const importManual = (token: string, body: object) =>
    request(app.getHttpServer()).post("/api/v1/imports/manual").set("Authorization", `Bearer ${token}`).send(body);

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    // The account has transactions, so this only deactivates it
    if (accountId) {
      await request(app.getHttpServer())
        .delete(`/api/v1/accounts/${accountId}`)
        .set("Authorization", `Bearer ${accessToken}`);
    }
    await closeSharedTestApp();
  });

  describe("MANUAL integration -> import by id and by name -> duplicates and errors", () => {
    it("should create an account and MANUAL + NOTIFICATION integrations", async () => {
      const accountRes = await request(app.getHttpServer())
        .post("/api/v1/accounts")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: accountName, type: "BANK", currency: "EUR", balance: 100 })
        .expect(201);
      accountId = accountRes.body.id;
      balance = 100;

      const manualRes = await request(app.getHttpServer())
        .post("/api/v1/integrations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "manual_test", type: "MANUAL" })
        .expect(201);
      expect(manualRes.body.type).toBe("MANUAL");
      manualToken = manualRes.body.plainToken;

      const notificationRes = await request(app.getHttpServer())
        .post("/api/v1/integrations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "manual_test_notification", type: "NOTIFICATION", accountId })
        .expect(201);
      notificationToken = notificationRes.body.plainToken;
    });

    it("should import an EXPENSE by accountId and lower the balance", async () => {
      const res = await importManual(manualToken, {
        type: "EXPENSE",
        amount: 12.5,
        accountId,
        description: "Cena manual",
      }).expect(200);

      expect(res.body).toMatchObject({ success: true, created: true });
      expect(res.body.transactionId).toBeDefined();
      balance -= 12.5;
      expect(await getBalance()).toBeCloseTo(balance, 4);

      const txRes = await request(app.getHttpServer())
        .get(`/api/v1/transactions/${res.body.transactionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(txRes.body).toMatchObject({
        accountId,
        amount: 12.5,
        type: "EXPENSE",
        status: "UNCLASSIFIED",
        source: "MANUAL",
        merchant: "Cena manual",
      });
    });

    it("should import an INCOME by accountName (case-insensitive) and raise the balance", async () => {
      const res = await importManual(manualToken, {
        type: "INCOME",
        amount: 40,
        accountName: accountName.toUpperCase(),
        date: "2026-10-02T12:00:00Z",
        externalId,
      }).expect(200);

      expect(res.body).toMatchObject({ success: true, created: true });
      balance += 40;
      expect(await getBalance()).toBeCloseTo(balance, 4);
    });

    it("should report a duplicate for the same externalId without touching the balance", async () => {
      const res = await importManual(manualToken, {
        type: "INCOME",
        amount: 40,
        accountId,
        date: "2026-10-02T12:00:00Z",
        externalId,
      }).expect(200);

      expect(res.body).toMatchObject({ success: true, created: false, duplicate: true });
      expect(await getBalance()).toBeCloseTo(balance, 4);
    });

    it("should reject a NOTIFICATION token on /imports/manual and a MANUAL token on /imports/notification", async () => {
      await importManual(notificationToken, { type: "EXPENSE", amount: 1, accountId }).expect(403);

      await request(app.getHttpServer())
        .post("/api/v1/imports/notification")
        .set("Authorization", `Bearer ${manualToken}`)
        .send({ message: "Has enviado 1€ a Juan Pablo.", date: new Date().toISOString() })
        .expect(403);

      expect(await getBalance()).toBeCloseTo(balance, 4);
    });

    it.each([
      ["a negative amount", { type: "EXPENSE", amount: -5 }],
      ["an invalid type", { type: "TRANSFER", amount: 5 }],
      ["both accountId and accountName", { type: "EXPENSE", amount: 5, accountName: "x" }],
      ["no account", { type: "EXPENSE", amount: 5, accountId: undefined }],
    ])("should reject %s with 400", async (_label, body) => {
      await importManual(manualToken, { accountId, ...body }).expect(400);
    });

    it("should return 404 for an unknown account", async () => {
      await importManual(manualToken, { type: "EXPENSE", amount: 5, accountName: `missing ${testRunId}` }).expect(404);
      expect(await getBalance()).toBeCloseTo(balance, 4);
    });
  });
});
