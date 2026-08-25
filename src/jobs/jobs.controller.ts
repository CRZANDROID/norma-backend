import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../database/prisma-client';
import type { AuthUser } from '../modules/auth/auth.types';
import { CurrentUser } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { Roles } from '../modules/auth/roles.decorator';
import { RolesGuard } from '../modules/auth/roles.guard';
import { ListJobRunsQueryDto } from './dto/list-job-runs.query.dto';
import { ProgressDateQueryDto } from './dto/progress-date.query.dto';
import { TriggerCrawlDto } from './dto/trigger-crawl.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('status')
  @Roles(
    UserRole.ADMIN,
    UserRole.ANALYST,
    UserRole.VIEWER,
    UserRole.CLIENT_USER,
  )
  @ApiOperation({
    summary: 'Estado de Redis, worker y conectores piloto (no encola)',
  })
  status() {
    return this.jobsService.status();
  }

  @Get('runs')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Listar ejecuciones de crawl (job_runs)' })
  listRuns(@Query() query: ListJobRunsQueryDto) {
    return this.jobsService.listRuns(query);
  }

  @Get('progress')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Resumen ejecutivo: una fila por fuente (último crawl del día, copy en español)',
  })
  progress(@Query() query: ProgressDateQueryDto) {
    return this.jobsService.progress(query);
  }

  @Post('crawl')
  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse()
  @ApiOperation({
    summary: 'Encolar crawl de una fuente ACTIVE (idempotente por día)',
  })
  trigger(@CurrentUser() user: AuthUser, @Body() dto: TriggerCrawlDto) {
    return this.jobsService.trigger(dto, user.id);
  }

  @Post('crawl/all')
  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse()
  @ApiOperation({
    summary: 'Encolar crawl de todas las fuentes ACTIVE',
  })
  triggerAll(@CurrentUser() user: AuthUser) {
    return this.jobsService.triggerAll(user.id);
  }
}
