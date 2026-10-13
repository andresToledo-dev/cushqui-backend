import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import * as bcrypt from "bcrypt";

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
    const integrations = await this.prisma.integration.findMany({
      where: {
        isActive: true,
      },
      include: {
        user: true,
        account: true,
      },
    });

    for (const integration of integrations) {
      const isValid = await bcrypt.compare(token, integration.tokenHash);
      if (isValid) {
        request.user = integration.user;
        request.integration = integration;
        return true;
      }
    }

    throw new UnauthorizedException("Invalid integration token");
  }
}
