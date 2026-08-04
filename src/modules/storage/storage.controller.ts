import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { UserRole } from '../../database/prisma-client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DownloadQueryDto } from './dto/download.query.dto';
import { SignedUrlQueryDto } from './dto/signed-url.query.dto';
import { UploadQueryDto } from './dto/upload.query.dto';
import { StorageService } from './storage.service';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

@ApiTags('storage')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse()
@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.ANALYST)
  @ApiOperation({ summary: 'Subir archivo a Supabase Storage' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiForbiddenResponse()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query() query: UploadQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Envía el archivo en multipart/form-data con el campo "file".',
      );
    }

    return this.storageService.upload(file, {
      folder: query.folder,
      clientId: query.clientId,
    });
  }

  @Get('download')
  @Roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)
  @ApiOperation({ summary: 'Descargar archivo por path' })
  async download(@Query() query: DownloadQueryDto, @Res() res: Response) {
    const result = await this.storageService.download(query.path);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.data);
  }

  @Get('signed-url')
  @Roles(UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)
  @ApiOperation({ summary: 'URL firmada temporal' })
  signedUrl(@Query() query: SignedUrlQueryDto) {
    return this.storageService.createSignedUrl(
      query.path,
      query.expiresIn ?? 3600,
    );
  }
}
