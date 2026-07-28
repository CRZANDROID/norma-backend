import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../database/prisma-client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRegulatoryProfileDto } from './dto/create-regulatory-profile.dto';
import { ListProfilesQueryDto } from './dto/list-profiles.query.dto';
import { UpdateRegulatoryProfileDto } from './dto/update-regulatory-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('clients/:clientId/profiles')
  findByClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query() query: ListProfilesQueryDto,
  ) {
    return this.profilesService.findByClient(user, clientId, query);
  }

  @Post('clients/:clientId/profiles')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  create(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateRegulatoryProfileDto,
  ) {
    return this.profilesService.create(user, clientId, dto);
  }

  @Patch('profiles/:id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.profilesService.deactivate(id);
  }

  @Patch('profiles/:id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  activate(@Param('id') id: string) {
    return this.profilesService.activate(id);
  }

  @Patch('profiles/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRegulatoryProfileDto,
  ) {
    return this.profilesService.update(user, id, dto);
  }

  @Get('profiles/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.profilesService.findOne(user, id);
  }
}
