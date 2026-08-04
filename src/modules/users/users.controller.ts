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
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../database/prisma-client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@ApiForbiddenResponse({ description: 'Solo ADMIN' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios' })
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Crear usuario (email/password)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post(':id/memberships')
  @ApiOperation({ summary: 'Asignar membership a cliente' })
  createMembership(
    @Param('id') id: string,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.usersService.createMembership(id, dto);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Cambiar rol global' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Soft-deactivate usuario' })
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Soft-activate usuario' })
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle usuario + memberships' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
