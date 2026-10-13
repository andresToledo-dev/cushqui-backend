import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginatedResponseDto } from '../transactions/dto/paginated-response.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementResponseDto } from './dto/movement-response.dto';
import { movementInclude, toMovementResponseDto } from './movement.util';

@Injectable()
export class MovementsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, query: MovementQueryDto): Promise<PaginatedResponseDto<MovementResponseDto>> {
    const { page = 1, limit = 20, ...filters } = query;

    const where: Prisma.AccountMovementWhereInput = {
      userId,
      ...(filters.accountId && {
        OR: [{ accountId: filters.accountId }, { toAccountId: filters.accountId }],
      }),
      ...(filters.type && { type: filters.type }),
      ...((filters.from || filters.to) && {
        movementDate: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      }),
    };

    const [movements, total] = await Promise.all([
      this.prisma.accountMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountMovement.count({ where }),
    ]);

    return {
      data: movements.map((m) => toMovementResponseDto(m)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
