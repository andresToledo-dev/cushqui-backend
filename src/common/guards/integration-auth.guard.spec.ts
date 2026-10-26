import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { IntegrationAuthGuard } from './integration-auth.guard';
import { hashIntegrationToken } from '../../integrations/integration-token.util';

describe('IntegrationAuthGuard', () => {
  const token = 'a'.repeat(64);
  const integration = { id: 'integration-id', isActive: true, user: { id: 'user-id' }, account: null };

  const prisma = { integration: { findUnique: jest.fn() } };
  const guard = new IntegrationAuthGuard(prisma as any);

  const context = (authorization?: string) => {
    const request: any = { headers: { authorization } };
    return {
      request,
      ctx: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should find the integration by the SHA256 of the token with a single lookup', async () => {
    prisma.integration.findUnique.mockResolvedValue(integration);
    const { request, ctx } = context(`Bearer ${token}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(prisma.integration.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.integration.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashIntegrationToken(token) },
      include: { user: true, account: true },
    });
    expect(request.integration).toBe(integration);
    expect(request.user).toBe(integration.user);
  });

  it('should reject a missing or non-Bearer header without querying the DB', async () => {
    await expect(guard.canActivate(context().ctx)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context(`Basic ${token}`).ctx)).rejects.toThrow(UnauthorizedException);
    expect(prisma.integration.findUnique).not.toHaveBeenCalled();
  });

  it('should reject an unknown token', async () => {
    prisma.integration.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toThrow('Invalid integration token');
  });

  it('should reject the token of an inactive integration', async () => {
    prisma.integration.findUnique.mockResolvedValue({ ...integration, isActive: false });

    await expect(guard.canActivate(context(`Bearer ${token}`).ctx)).rejects.toThrow('Invalid integration token');
  });
});
