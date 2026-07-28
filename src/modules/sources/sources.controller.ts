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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSourceDto } from './dto/create-source.dto';
import { ListSourcesQueryDto } from './dto/list-sources.query.dto';
import { UpdateSourceDto } from './dto/update-source.dto';
import { SourcesService } from './sources.service';

@Controller('sources')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)
  findAll(@Query() query: ListSourcesQueryDto) {
    return this.sourcesService.findAll(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSourceDto) {
    return this.sourcesService.create(dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string) {
    return this.sourcesService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  activate(@Param('id') id: string) {
    return this.sourcesService.activate(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sourcesService.update(id, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)
  findOne(@Param('id') id: string) {
    return this.sourcesService.findOne(id);
  }
}
