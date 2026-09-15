import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../../database/prisma-client';
import { ProgressDateQueryDto } from '../../jobs/dto/progress-date.query.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListFindingsQueryDto } from './dto/list-findings.query.dto';
import { RewriteFindingDto } from './dto/rewrite-finding.dto';
import { UpdateFindingDto } from './dto/update-finding.dto';
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
      'Listar hallazgos paginados. lote=incluidos|excluidos|enviados; counts incluye included/excluded/sent y semáforo',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListFindingsQueryDto) {
    return this.findingsService.list(user, query);
  }

  @Get('progress')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Resumen ejecutivo de análisis: una fila por fuente (hallazgos del día, copy en español)',
  })
  progress(
    @CurrentUser() user: AuthUser,
    @Query() query: ProgressDateQueryDto,
  ) {
    return this.findingsService.progress(user, query);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Editar título, justificación y/o semáforo (impact) a mano. No cambia status.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFindingDto,
  ) {
    return this.findingsService.update(user, id, dto);
  }

  @Post(':id/exclude')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Sacar el hallazgo del próximo informe (Y/O/R). GREEN → 400.',
  })
  exclude(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.exclude(user, id);
  }

  @Post(':id/include')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Volver a incluir el hallazgo en el próximo informe.',
  })
  include(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.include(user, id);
  }

  @Post(':id/rewrite')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Reescribir con OpenAI (edita el borrador vigente). 422 con el limitante si la IA no cambia nada.',
  })
  rewrite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RewriteFindingDto,
  ) {
    return this.findingsService.rewrite(user, id, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Detalle de un hallazgo' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.findingsService.findOne(user, id);
  }
}
