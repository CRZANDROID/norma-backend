import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../database/prisma-client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UsersService } from './users.service';

@ApiTags('memberships')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'Solo ADMIN' })
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MembershipsController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar role/status de membership' })
  update(@Param('id') id: string, @Body() dto: UpdateMembershipDto) {
    return this.usersService.updateMembership(id, dto);
  }
}
