import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from "./shared-test.module";

describe("Subcategories Flow (e2e)", () => {
  let app: INestApplication;
  let accessToken: string;
  let prestamosCategoryId: string;
  let persona1SubcategoryId: string;
  let persona2SubcategoryId: string;
  let createdSubcategoryId: string;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    // Leave the seed user's categories as they were
    if (createdSubcategoryId) {
      await request(app.getHttpServer()).delete(`/api/v1/categories/${createdSubcategoryId}`).set("Authorization", `Bearer ${accessToken}`);
    }
    await closeSharedTestApp();
  });

  describe("Subcategories flow: login -> token -> subcategories CRUD", () => {
    it("should login with seed user and get access token", () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe("string");
      expect(accessToken.length).toBeGreaterThan(0);
      console.log("✅ Access token obtained:", accessToken.substring(0, 20) + "...");
    });

    it('should find "Prestamos" category', async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/categories").set("Authorization", `Bearer ${accessToken}`).expect(200);

      const prestamos = res.body.find((c: any) => c.name === "Prestamos");
      expect(prestamos).toBeDefined();
      expect(prestamos.id).toBeDefined();
      expect(prestamos.icon).toBe("💰");
      expect(prestamos.color).toBe("#FF6B35");
      prestamosCategoryId = prestamos.id;
      console.log("✅ Prestamos category found:", prestamos);
    });

    it('should get subcategories of "Prestamos" (default: Persona 1 and Persona 2)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/categories/${prestamosCategoryId}/subcategories`).set("Authorization", `Bearer ${accessToken}`).expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const persona1 = res.body.find((s: any) => s.name === "Persona 1");
      const persona2 = res.body.find((s: any) => s.name === "Persona 2");

      expect(persona1).toBeDefined();
      expect(persona1.icon).toBe("💰");
      expect(persona1.parentId).toBe(prestamosCategoryId);
      console.log("✅ Persona 1 subcategory:", persona1);

      expect(persona2).toBeDefined();
      expect(persona2.icon).toBe("💰");
      expect(persona2.parentId).toBe(prestamosCategoryId);
      console.log("✅ Persona 2 subcategory:", persona2);

      // Default colors: parent lightened 20%, then 15% more (the API does not generate colors on create)
      expect(persona1.color).toBe("#ff895d");
      expect(persona2.color).toBe("#ff9b75");
      // Subcategories always have the type of their parent
      expect(persona1.type).toBe("EXPENSE");
      expect(persona2.type).toBe("EXPENSE");

      persona1SubcategoryId = persona1.id;
      persona2SubcategoryId = persona2.id;
    });

    it('should create a new subcategory under "Prestamos"', async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "María",
          parentCategoryId: prestamosCategoryId,
          color: "#FFB896",
        })
        .expect(201);

      expect(res.body.name).toBe("María");
      expect(res.body.icon).toBe("💰");
      expect(res.body.parentId).toBe(prestamosCategoryId);
      expect(res.body.color).toBe("#FFB896"); // Color chosen by the frontend
      expect(res.body.type).toBe("EXPENSE"); // Type inherited from "Prestamos"
      createdSubcategoryId = res.body.id;
      console.log("✅ New subcategory created:", res.body);
    });

    it("should update subcategory name", async () => {
      // Renames the subcategory this test created, not a default one
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/subcategories/${createdSubcategoryId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "María Updated",
        })
        .expect(200);

      expect(res.body.name).toBe("María Updated");
      expect(res.body.id).toBe(createdSubcategoryId);
      // Other fields should remain unchanged
      expect(res.body.icon).toBe("💰");
      expect(res.body.color).toBe("#FFB896");
      console.log("✅ Subcategory updated:", res.body);
    });

    it("should return 400 when creating subcategory under another subcategory (max 2 levels)", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Nieto",
          parentCategoryId: persona1SubcategoryId, // This is a subcategory, not a top-level category
          color: "#FFFFFF",
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
          color: "#FFFFFF",
        })
        .expect(404);
      console.log("✅ Correctly rejected non-existent parent");
    });

    it("should return 400 when the subcategory color is missing or not hex", async () => {
      for (const color of [undefined, "red", "#FFF"]) {
        await request(app.getHttpServer())
          .post("/api/v1/categories/subcategories")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ name: "Sin color", parentCategoryId: prestamosCategoryId, color })
          .expect(400);
      }
    });

    it("should return 400 when a subcategory is sent with its own type", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/categories/subcategories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Con tipo", parentCategoryId: prestamosCategoryId, color: "#FFFFFF", type: "INCOME" })
        .expect(400);
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
