import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
import { DocumentsService } from './documents.service';
import { ListDocumentsQueryDto } from './dto/list-documents.query.dto';

@ApiTags('documents')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Listar registro documental (ficha + estado de pipeline; sin HTML crudo)',
  })
  list(@Query() query: ListDocumentsQueryDto) {
    return this.documentsService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Ficha + texto extraído de un documento (no el HTML crudo)',
  })
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Post(':id/reprocess')
  @Roles(UserRole.ADMIN)
  @ApiForbiddenResponse()
  @ApiOperation({
    summary: 'Reencolar extract del documento (ADMIN)',
  })
  reprocess(@Param('id') id: string) {
    return this.documentsService.reprocess(id);
  }
}
