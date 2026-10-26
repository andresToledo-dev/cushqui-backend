import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { hashIntegrationToken } from "../../integrations/integration-token.util";

@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Integration token required");
    }

    const token = authHeader.substring(7);
    const integration = await this.prisma.integration.findUnique({
      where: { tokenHash: hashIntegrationToken(token) },
      include: {
        user: true,
        account: true,
      },
    });

    if (!integration || !integration.isActive) {
      throw new UnauthorizedException("Invalid integration token");
    }

    request.user = integration.user;
    request.integration = integration;
    return true;
  }
}
