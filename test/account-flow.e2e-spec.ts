import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from "./shared-test.module";

describe("Account Flow (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let accountId: string;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  describe("Account flow: login -> create -> update", () => {
    it("should login with seed user and get access token", () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe("string");
      expect(accessToken.length).toBeGreaterThan(0);
      console.log("✅ Access token obtained:", accessToken.substring(0, 20) + "...");
    });

    it("should create an account with balance 0, house emoji, and yellow color", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/accounts")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Test Account",
          type: "BANK",
          currency: "EUR",
          balance: 0,
          icon: "🏠",
          color: "#FFD700",
        })
        .expect(201);

      expect(res.body.name).toBe("Test Account");
      expect(res.body.type).toBe("BANK");
      expect(res.body.currency).toBe("EUR");
      expect(res.body.balance).toBe(0);
      expect(res.body.icon).toBe("🏠");
      expect(res.body.color).toBe("#FFD700");
      expect(res.body.isActive).toBe(true);

      accountId = res.body.id;
      console.log("✅ POST /accounts response:", JSON.stringify(res.body, null, 2));
    });

    it("should update the account to clover emoji and green color", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          icon: "🍀",
          color: "#00FF00",
        })
        .expect(200);

      expect(res.body.icon).toBe("🍀");
      expect(res.body.color).toBe("#00FF00");
      expect(res.body.balance).toBe(0);
      expect(res.body.id).toBe(accountId);

      console.log("✅ PATCH /accounts/:id response:", JSON.stringify(res.body, null, 2));
    });

    it("should reject changing the balance through PATCH", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ balance: 30 })
        .expect(400);
    });

    it("should adjust the balance to 30 EUR", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/adjustments`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ balance: 30 })
        .expect(201);

      expect(res.body.balance).toBe(30);

      console.log("✅ POST /accounts/:id/adjustments response:", JSON.stringify(res.body, null, 2));
    });

    it("should verify the updated account when fetching by ID", async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/accounts/${accountId}`).set("Authorization", `Bearer ${accessToken}`).expect(200);

      expect(res.body.icon).toBe("🍀");
      expect(res.body.color).toBe("#00FF00");
      expect(res.body.balance).toBe(30);

      console.log("✅ GET /accounts/:id response:", JSON.stringify(res.body, null, 2));
    });

    it("should verify the account appears in the accounts list with correct icon and color", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/accounts").set("Authorization", `Bearer ${accessToken}`).expect(200);

      const account = res.body.find((acc: any) => acc.id === accountId);
      expect(account).toBeDefined();
      expect(account.icon).toBe("🍀");
      expect(account.color).toBe("#00FF00");
      expect(account.balance).toBe(30);

      console.log("✅ Account verified in list:", JSON.stringify(account, null, 2));
    });

    it("should keep the balance when updating other fields", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Renamed Account" })
        .expect(200);

      expect(res.body.name).toBe("Renamed Account");
      expect(res.body.balance).toBe(30);
    });
  });
});
