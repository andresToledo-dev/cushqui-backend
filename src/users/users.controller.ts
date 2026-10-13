import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UpdateNameDto {
  @ApiProperty({ example: 'New Name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async me(@CurrentUser() user: UserResponseDto): Promise<UserResponseDto> {
    return user;
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateNameDto): Promise<UserResponseDto> {
    return this.usersService.updateName(userId, dto.name);
  }
}