import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AiService } from './ai.service';
import { AskAiDto } from './dto/ask-ai.dto';

@ApiTags('ai')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  @Roles(
    UserRole.ADMIN,
    UserRole.ANALYST,
    UserRole.VIEWER,
    UserRole.CLIENT_USER,
  )
  @ApiOperation({
    summary: '¿OpenAI está configurado? (no llama al modelo)',
  })
  status() {
    return this.aiService.status();
  }

  @Post('ask')
  @Roles(
    UserRole.ADMIN,
    UserRole.ANALYST,
    UserRole.VIEWER,
    UserRole.CLIENT_USER,
  )
  @ApiOperation({
    summary:
      'Preguntar al modelo sobre clientes, perfiles y fuentes ya registrados',
  })
  @ApiForbiddenResponse()
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskAiDto) {
    return this.aiService.ask(user, dto);
  }
}
