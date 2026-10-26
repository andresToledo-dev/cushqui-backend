import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp, findCategory, deleteIntegrations, createTestAccount, deactivateAccounts } from "./shared-test.module";

describe("Notification Balance Flow (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let integrationToken: string;
  let integrationId: string;
  let initialBalance: number;
  let expectedBalance: number;
  let importedTransactionId: string;
  const expenseAmount = 25.5;

  // Default "Prestamos" category of the seed user (looked up by name: its id is random)
  let categoryId: string;
  let accountId: string; // own account: other suites must not change its balance

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
    accountId = await createTestAccount("Notification balance");
    categoryId = (await findCategory("Prestamos", "EXPENSE")).id;
  });

  afterAll(async () => {
    await deleteIntegrations([integrationId]);
    await deactivateAccounts([accountId]);
    await closeSharedTestApp();
  });

  describe("Notification import: create unclassified -> classify", () => {
    it("should login with seed user and get access token", () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe("string");
      expect(accessToken.length).toBeGreaterThan(0);
      console.log("✅ Access token obtained:", accessToken.substring(0, 20) + "...");
    });

    it("should create an integration linked to the test account and obtain its token", async () => {
      // Always a new integration: it must be linked to this suite's own account
      const res = await request(app.getHttpServer())
        .post("/api/v1/integrations")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "notification_balance_test",
          type: "NOTIFICATION",
          accountId,
        })
        .expect(201);

      integrationToken = res.body.plainToken;
      integrationId = res.body.id;
      console.log("✅ Created new integration and got token:", integrationToken.substring(0, 20) + "...");

      expect(integrationToken).toBeDefined();
      expect(typeof integrationToken).toBe("string");
    });

    it("should get initial account balance and store it", async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/accounts/${accountId}`).set("Authorization", `Bearer ${accessToken}`).expect(200);

      initialBalance = res.body.balance;
      expectedBalance = initialBalance;

      console.log("✅ Initial account balance stored:", { initialBalance, expectedBalance });
      expect(res.body.balance).toBeDefined();
    });

    it("should create an UNCLASSIFIED transaction via /imports/notification (EXPENSE)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/imports/notification")
        .set("Authorization", `Bearer ${integrationToken}`)
        .send({
          message: `Has enviado ${expenseAmount}€ a Supermercado. Llegará en segundos`,
          date: new Date().toISOString(),
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.created).toBe(true);
      expect(res.body.transactionId).toBeDefined();

      importedTransactionId = res.body.transactionId;
      // EXPENSE subtracts from balance
      expectedBalance -= expenseAmount;

      console.log("✅ POST /imports/notification (UNCLASSIFIED EXPENSE) response:", JSON.stringify(res.body, null, 2));
      console.log("📊 Expected balance after import:", expectedBalance);
    });

    it("should verify account balance decreased by expense amount", async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/accounts/${accountId}`).set("Authorization", `Bearer ${accessToken}`).expect(200);

      console.log("✅ Account balance after import:", JSON.stringify(res.body, null, 2));
      console.log("📊 Expected:", expectedBalance, "| Received:", res.body.balance);
      expect(res.body.balance).toBe(expectedBalance);
    });

    it("should verify transaction was created as UNCLASSIFIED", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/transactions").set("Authorization", `Bearer ${accessToken}`).query({ limit: 5 }).expect(200);

      const importedTx = res.body.data.find((tx: any) => tx.source === "REVOLUT" && tx.status === "UNCLASSIFIED" && tx.amount === expenseAmount);

      expect(importedTx).toBeDefined();
      expect(importedTx.status).toBe("UNCLASSIFIED");
      expect(importedTx.categoryId).toBeUndefined();
      expect(importedTx.subcategoryId).toBeUndefined();

      console.log("✅ Verified UNCLASSIFIED transaction:", JSON.stringify(importedTx, null, 2));
    });

    it("should classify the transaction using the Prestamos category", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/transactions").set("Authorization", `Bearer ${accessToken}`).query({ limit: 5 }).expect(200);

      const importedTx = res.body.data.find((tx: any) => tx.source === "REVOLUT" && tx.status === "UNCLASSIFIED" && tx.amount === expenseAmount);

      expect(importedTx).toBeDefined();

      const classifyRes = await request(app.getHttpServer())
        .post(`/api/v1/transactions/${importedTx.id}/classify`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          categoryId,
        })
        .expect(201);

      expect(classifyRes.body.status).toBe("CLASSIFIED");
      expect(classifyRes.body.categoryId).toBe(categoryId);

      console.log("✅ POST /transactions/:id/classify response:", JSON.stringify(classifyRes.body, null, 2));
    });

    it("should verify transaction is now CLASSIFIED with correct category", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/transactions").set("Authorization", `Bearer ${accessToken}`).query({ limit: 5 }).expect(200);

      const classifiedTx = res.body.data.find((tx: any) => tx.source === "REVOLUT" && tx.status === "CLASSIFIED" && tx.amount === expenseAmount && tx.categoryId === categoryId);

      expect(classifiedTx).toBeDefined();
      expect(classifiedTx.status).toBe("CLASSIFIED");
      expect(classifiedTx.categoryId).toBe(categoryId);

      console.log("✅ Verified CLASSIFIED transaction:", JSON.stringify(classifiedTx, null, 2));
    });
  });
});
