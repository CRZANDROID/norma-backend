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
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientContactsService } from './client-contacts.service';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';

@ApiTags('contacts')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller()
@UseGuards(JwtAuthGuard)
export class ClientContactsController {
  constructor(private readonly contactsService: ClientContactsService) {}

  @Get('clients/:clientId/contacts')
  @ApiOperation({ summary: 'Listar contactos directos de un cliente' })
  findByClient(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.contactsService.findByClient(user, clientId, query);
  }

  @Post('clients/:clientId/contacts')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear contacto directo del cliente' })
  @ApiForbiddenResponse()
  create(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientContactDto,
  ) {
    return this.contactsService.create(user, clientId, dto);
  }

  @Patch('contacts/:id/deactivate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-deactivate contacto' })
  @ApiForbiddenResponse()
  deactivate(@Param('id') id: string) {
    return this.contactsService.deactivate(id);
  }

  @Patch('contacts/:id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Soft-activate contacto' })
  @ApiForbiddenResponse()
  activate(@Param('id') id: string) {
    return this.contactsService.activate(id);
  }

  @Patch('contacts/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar contacto' })
  @ApiForbiddenResponse()
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientContactDto,
  ) {
    return this.contactsService.update(user, id, dto);
  }

  @Get('contacts/:id')
  @ApiOperation({ summary: 'Detalle de contacto' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contactsService.findOne(user, id);
  }
}
