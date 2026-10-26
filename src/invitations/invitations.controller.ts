import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('invitations')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@ApiResponse({ status: 403, description: 'Only ADMIN users can manage invitations' })
@Controller('invitations')
export class InvitationsController {
  constructor(private invitationsService: InvitationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an invitation code (returned only once)' })
  @ApiResponse({ status: 201, type: InvitationResponseDto })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List invitations with their status (codes are never returned)' })
  @ApiResponse({ status: 200, type: [InvitationResponseDto] })
  async findAll(): Promise<InvitationResponseDto[]> {
    return this.invitationsService.findAll();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an unused invitation' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: InvitationResponseDto })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({ status: 409, description: 'Invitation already used' })
  async revoke(@Param('id') id: string): Promise<InvitationResponseDto> {
    return this.invitationsService.revoke(id);
  }
}
