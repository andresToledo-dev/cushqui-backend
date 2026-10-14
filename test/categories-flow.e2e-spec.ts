import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from './shared-test.module';

describe('Categories Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let categoryId: string;
  let subcategoryId: string;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  describe('Categories flow: login -> GET categories -> CRUD category -> CRUD subcategory', () => {
    it('should login with seed user and get access token', () => {
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
      console.log('✅ Access token obtained:', accessToken.substring(0, 20) + '...');
    });

    it('should GET categories (global + user)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      // Verify structure: only top-level categories (parentId: null)
      for (const category of res.body) {
        expect(category.parentId).toBeNull();
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('icon');
        expect(category).toHaveProperty('color');
        expect(category).toHaveProperty('subcategories');
        expect(Array.isArray(category.subcategories)).toBe(true);
      }

      console.log('✅ GET /categories response:', JSON.stringify(res.body, null, 2));
    });

    it('should CREATE a new category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Category',
          type: 'EXPENSE',
          icon: '🧪',
          color: '#FF0000',
        })
        .expect(201);

      expect(res.body.name).toBe('Test Category');
      expect(res.body.type).toBe('EXPENSE');
      expect(res.body.icon).toBe('🧪');
      expect(res.body.color).toBe('#FF0000');
      expect(res.body.parentId).toBeNull();
      expect(res.body.userId).toBeDefined();
      expect(res.body.subcategories).toEqual([]);

      categoryId = res.body.id;
      console.log('✅ POST /categories response:', JSON.stringify(res.body, null, 2));
    });

    it('should UPDATE the category (name, icon, color)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Test Category',
          icon: '🔬',
          color: '#00FF00',
        })
        .expect(200);

      expect(res.body.name).toBe('Updated Test Category');
      expect(res.body.icon).toBe('🔬');
      expect(res.body.color).toBe('#00FF00');
      expect(res.body.id).toBe(categoryId);
      expect(res.body.subcategories).toEqual([]);

      console.log('✅ PATCH /categories/:id response:', JSON.stringify(res.body, null, 2));
    });

    it('should CREATE a subcategory under the category', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories/subcategories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Subcategory',
          parentCategoryId: categoryId,
          color: '#33FF33',
        })
        .expect(201);

      expect(res.body.name).toBe('Test Subcategory');
      expect(res.body.icon).toBe('🔬'); // Inherits parent's icon
      expect(res.body.parentId).toBe(categoryId);
      expect(res.body.color).toBe('#33FF33'); // Chosen by the frontend
      expect(res.body.type).toBe('EXPENSE'); // Inherits parent's type
      expect(res.body.userId).toBeDefined();

      subcategoryId = res.body.id;
      console.log('✅ POST /categories/subcategories response:', JSON.stringify(res.body, null, 2));
    });

    it('should change the type of an unused category and of its subcategories', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'INCOME' })
        .expect(200);

      expect(res.body.type).toBe('INCOME');
      expect(res.body.subcategories.every((s: any) => s.type === 'INCOME')).toBe(true);
    });

    it('should UPDATE the subcategory (name only)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/subcategories/${subcategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Test Subcategory',
        })
        .expect(200);

      expect(res.body.name).toBe('Updated Test Subcategory');
      expect(res.body.id).toBe(subcategoryId);
      expect(res.body.icon).toBe('🔬'); // Unchanged
      expect(res.body.color).toBeDefined(); // Unchanged
      expect(res.body.parentId).toBe(categoryId);

      console.log('✅ PATCH /categories/subcategories/:id response:', JSON.stringify(res.body, null, 2));
    });

    it('should DELETE the subcategory', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${subcategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      console.log('✅ DELETE /categories/:id (subcategory) - 204 No Content');

      // Verify subcategory is deleted
      const res = await request(app.getHttpServer())
        .get(`/api/v1/categories/${categoryId}/subcategories`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(0);
      console.log('✅ Verified subcategory deleted - subcategories list is empty');
    });

    it('should DELETE the category', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      console.log('✅ DELETE /categories/:id (category) - 204 No Content');

      // Verify category is deleted
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const deletedCategory = res.body.find((c: any) => c.id === categoryId);
      expect(deletedCategory).toBeUndefined();
      console.log('✅ Verified category deleted - not found in categories list');
    });
  });
});