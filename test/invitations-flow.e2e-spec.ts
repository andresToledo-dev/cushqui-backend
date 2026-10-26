import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp, createInvitation } from './shared-test.module';

describe('Invitations Flow (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  const register = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/auth/register').send(body);
  const newUser = (suffix: string, invitationCode?: string) => ({
    email: `invite-${suffix}-${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Invited User',
    ...(invitationCode !== undefined ? { invitationCode } : {}),
  });

  beforeAll(async () => {
    app = await getSharedTestApp();
    adminToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  it('should expose the role in /auth/me (seed user is ADMIN)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('should reject a registration without a code or with an unknown code', async () => {
    await register(newUser('nocode')).expect(400);
    const res = await register(newUser('fake', 'AAAA-BBBB-CCCC')).expect(400);
    expect(res.body.message).toBe('Invalid or expired invitation code');
  });

  it('should register with a valid code (any case, without dashes) only once', async () => {
    const { id, code } = await createInvitation();
    const user = newUser('once', code.toLowerCase().replace(/-/g, ''));

    const registerRes = await register(user).expect(201);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`)
      .expect(200);
    expect(me.body.role).toBe('USER');

    // The code cannot be reused, not even by another email
    await register(newUser('reuse', code)).expect(400);

    const list = await request(app.getHttpServer()).get('/api/v1/invitations').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const used = list.body.find((i: any) => i.id === id);
    expect(used).toMatchObject({ status: 'USED', usedByEmail: user.email });
    expect(list.body.every((i: any) => i.code === undefined)).toBe(true);

    // A non-admin user cannot manage invitations
    const userToken = registerRes.body.accessToken;
    await request(app.getHttpServer()).post('/api/v1/invitations').set('Authorization', `Bearer ${userToken}`).send({}).expect(403);
    await request(app.getHttpServer()).get('/api/v1/invitations').set('Authorization', `Bearer ${userToken}`).expect(403);

    // A used invitation cannot be revoked
    await request(app.getHttpServer()).delete(`/api/v1/invitations/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(409);
  });

  it('should only accept the email the invitation was issued for', async () => {
    const email = `invite-bound-${Date.now()}@example.com`;
    const { code } = await createInvitation({ email });

    await register(newUser('other', code)).expect(400);
    await register({ ...newUser('bound', code), email: email.toUpperCase() }).expect(201);
  });

  it('should reject a revoked invitation', async () => {
    const { id, code } = await createInvitation();

    const res = await request(app.getHttpServer()).delete(`/api/v1/invitations/${id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.status).toBe('REVOKED');

    await register(newUser('revoked', code)).expect(400);
  });

  it('should validate the invitation body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiresInDays: 31 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'not-an-email' })
      .expect(400);
  });
});
