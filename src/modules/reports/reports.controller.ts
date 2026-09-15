import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../database/prisma-client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports.query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Listar informes. fileUrl apunta a GET /reports/:id/file.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListReportsQueryDto) {
    return this.reportsService.list(user, query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiConflictResponse({
    description: 'El día del rango (o hoy) sigue classifying.',
  })
  @ApiOperation({
    summary:
      'Generar informe draft (Y/O/R no excluidos ni enviados) y guardar el PDF. No envía correo.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user, dto);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiConflictResponse({
    description: 'Informe sent/discarded, o el día sigue classifying.',
  })
  @ApiOperation({
    summary:
      'Reescribe el PDF draft con los candidatos vigentes. 409 si está sent o discarded.',
  })
  regenerate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reportsService.regenerate(user, id);
  }

  @Get(':id/file')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary:
      'Ver o descargar el PDF. Query download=1 fuerza attachment; por defecto inline.',
  })
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.reportsService.getFile(user, id);
    const asAttachment = download === '1' || download === 'true';
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${asAttachment ? 'attachment' : 'inline'}; filename="${file.filename}"`,
    );
    res.send(file.data);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Detalle del informe + hallazgos incluidos.' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.reportsService.findOne(user, id);
  }
}
