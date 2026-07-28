import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '../../database/prisma-client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UsersService } from './users.service';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MembershipsController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMembershipDto) {
    return this.usersService.updateMembership(id, dto);
  }
}
