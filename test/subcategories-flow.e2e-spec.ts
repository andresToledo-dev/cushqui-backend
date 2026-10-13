import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from "./shared-test.module";

describe("Subcategories Flow (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let prestamosCategoryId: string;
  let juanPabloSubcategoryId: string;
  let anaSubcategoryId: string;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  describe("Subcategories flow: login -> token -> subcategories CRUD", () => {
    it("should login with seed user and get access token", () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe("string");
      expect(accessToken.length).toBeGreaterThan(0);
      console.log("✅ Access token obtained:", accessToken.substring(0, 20) + "...");
    });

    it('should find "Préstamos" category', async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/categories").set("Authorization", `Bearer ${accessToken}`).expect(200);

      const prestamos = res.body.find((c: any) => c.name === "Préstamos");
      expect(prestamos).toBeDefined();
      expect(prestamos.id).toBeDefined();
      expect(prestamos.icon).toBe("💰");
      expect(prestamos.color).toBe("#FF6B35");
      prestamosCategoryId = prestamos.id;
      console.log("✅ Préstamos category found:", prestamos);
    });

    it('should get subcategories of "Préstamos" (should have Juan Pablo and Ana)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/categories/${prestamosCategoryId}/subcategories`).set("Authorization", `Bearer ${accessToken}`).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const juanPablo = res.body.find((s: any) => s.name === "Juan Pablo");
      const ana = res.body.find((s: any) => s.name === "Ana");

      expect(juanPablo).toBeDefined();
      expect(juanPablo.icon).toBe("💰");
      expect(juanPablo.parentId).toBe(prestamosCategoryId);
      console.log("✅ Juan Pablo subcategory:", juanPablo);

      expect(ana).toBeDefined();
      expect(ana.icon).toBe("💰");
      expect(ana.parentId).toBe(prestamosCategoryId);
      console.log("✅ Ana subcategory:", ana);

      // Verify color gradient: first subcategory lighter than parent, second lighter than first
      // Using actual values from implementation: lightenColor('#FF6B35', 20) = #ff895d, lightenColor('#ff895d', 15) = #ff9b75
      expect(juanPablo.color).toBe("#ff895d");
      expect(ana.color).toBe("#ff9b75");
      console.log("✅ Color gradient verified - Juan Pablo:", juanPablo.color, ", Ana:", ana.color);

      juanPabloSubcategoryId = juanPablo.id;
      anaSubcategoryId = ana.id;
    });

    it('should create a new subcategory under "Préstamos"', async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "María",
          parentCategoryId: prestamosCategoryId,
        })
        .expect(201);

      expect(res.body.name).toBe("María");
      expect(res.body.icon).toBe("💰");
      expect(res.body.parentId).toBe(prestamosCategoryId);
      // Third subcategory should be lighter than Ana's color: lightenColor('#ff9b75', 15) = #ffb896
      expect(res.body.color).toBe("#ffb896");
      console.log("✅ New subcategory created:", res.body);
    });

    it("should update subcategory name", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/subcategories/${juanPabloSubcategoryId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Juan Pablo Updated",
        })
        .expect(200);

      expect(res.body.name).toBe("Juan Pablo Updated");
      expect(res.body.id).toBe(juanPabloSubcategoryId);
      // Other fields should remain unchanged
      expect(res.body.icon).toBe("💰");
      expect(res.body.color).toBe("#ff895d");
      console.log("✅ Subcategory updated:", res.body);
    });

    it("should return 400 when creating subcategory under another subcategory (max 2 levels)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Nieto",
          parentCategoryId: juanPabloSubcategoryId, // This is a subcategory, not a top-level category
        })
        .expect(400);
      console.log("✅ Correctly rejected subcategory under subcategory");
    });

    it("should return 404 for non-existent parent category", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Test",
          parentCategoryId: "00000000-0000-0000-0000-000000000000",
        })
        .expect(404);
      console.log("✅ Correctly rejected non-existent parent");
    });

    it("should return 401 without token", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .send({
          name: "Test",
          parentCategoryId: prestamosCategoryId,
        })
        .expect(401);
      console.log("✅ Correctly requires authentication");
    });
  });
});
