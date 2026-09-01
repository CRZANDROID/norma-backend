import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../database/prisma-client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListFindingsQueryDto } from './dto/list-findings.query.dto';
import { FindingsService } from './findings.service';

@ApiTags('findings')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('findings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Listar hallazgos clasificados (semáforo; filtro sourceId / sourceCode; sin inbox)',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListFindingsQueryDto) {
    return this.findingsService.list(user, query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Detalle de un hallazgo' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.findOne(user, id);
  }
}
