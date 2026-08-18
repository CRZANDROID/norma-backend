import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type UploadedObject = {
  bucket: string;
  path: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  publicUrl: string | null;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: SupabaseClient | null = null;
  private bucket: string = 'documents';
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL')?.trim();
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    this.bucket =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET')?.trim() || 'documents';

    if (!url || !key) {
      this.configured = false;
      return;
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.configured = true;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Sube bytes a un path explícito (crawl). Si no hay Supabase, escribe en
   * `data/crawl/` para no bloquear el piloto local.
   */
  async putObject(params: {
    path: string;
    buffer: Buffer;
    contentType: string;
    upsert?: boolean;
  }): Promise<UploadedObject> {
    const objectPath = this.normalizePath(params.path);
    if (!params.buffer?.length) {
      throw new BadRequestException('Archivo vacío');
    }

    if (this.configured && this.client) {
      const { error } = await this.client.storage
        .from(this.bucket)
        .upload(objectPath, params.buffer, {
          contentType: params.contentType || 'application/octet-stream',
          upsert: params.upsert ?? false,
        });

      if (error && !/already exists|duplicate/i.test(error.message)) {
        throw new InternalServerErrorException(
          `Error al subir a Storage: ${error.message}`,
        );
      }

      const { data: publicData } = this.client.storage
        .from(this.bucket)
        .getPublicUrl(objectPath);

      return {
        bucket: this.bucket,
        path: objectPath,
        filename: objectPath.split('/').pop() || 'file',
        mimeType: params.contentType || null,
        sizeBytes: params.buffer.length,
        publicUrl: publicData?.publicUrl ?? null,
      };
    }

    const localRoot = join(process.cwd(), 'data', 'crawl');
    const localPath = join(localRoot, ...objectPath.split('/'));
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, params.buffer);
    this.logger.log(`crawl artifact local path=${localPath}`);

    return {
      bucket: 'local',
      path: objectPath,
      filename: objectPath.split('/').pop() || 'file',
      mimeType: params.contentType || null,
      sizeBytes: params.buffer.length,
      publicUrl: null,
    };
  }

  private ensureClient(): SupabaseClient {
    if (!this.configured || !this.client) {
      throw new ServiceUnavailableException(
        'Supabase Storage no configurado. Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return this.client;
  }

  buildObjectPath(params: {
    filename: string;
    folder?: string;
    clientId?: string;
  }): string {
    const safeName = this.sanitizeFilename(params.filename);
    const parts: string[] = [];

    if (params.clientId) {
      parts.push('clients', params.clientId);
    }
    if (params.folder) {
      parts.push(
        ...params.folder
          .split('/')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => this.sanitizeSegment(p)),
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    parts.push(`${stamp}_${safeName}`);
    return parts.join('/');
  }

  async upload(
    file: Express.Multer.File,
    options: { folder?: string; clientId?: string } = {},
  ): Promise<UploadedObject> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo vacío o no enviado (campo: file).');
    }

    const client = this.ensureClient();
    const path = this.buildObjectPath({
      filename: file.originalname || 'upload.bin',
      folder: options.folder,
      clientId: options.clientId,
    });

    const { error } = await client.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Error al subir a Storage: ${error.message}`,
      );
    }

    const { data: publicData } = client.storage
      .from(this.bucket)
      .getPublicUrl(path);

    return {
      bucket: this.bucket,
      path,
      filename: file.originalname,
      mimeType: file.mimetype || null,
      sizeBytes: file.size ?? file.buffer.length,
      publicUrl: publicData?.publicUrl ?? null,
    };
  }

  async download(path: string): Promise<{
    data: Buffer;
    contentType: string;
    filename: string;
  }> {
    const client = this.ensureClient();
    const objectPath = this.normalizePath(path);

    const { data, error } = await client.storage
      .from(this.bucket)
      .download(objectPath);

    if (error || !data) {
      throw new NotFoundException(
        `Archivo no encontrado: ${objectPath}${error ? ` (${error.message})` : ''}`,
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const filename = objectPath.split('/').pop() || 'download.bin';

    return {
      data: Buffer.from(arrayBuffer),
      contentType: data.type || 'application/octet-stream',
      filename,
    };
  }

  async createSignedUrl(
    path: string,
    expiresIn = 3600,
  ): Promise<{ path: string; signedUrl: string; expiresIn: number }> {
    const client = this.ensureClient();
    const objectPath = this.normalizePath(path);

    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUrl(objectPath, expiresIn);

    if (error || !data?.signedUrl) {
      throw new NotFoundException(
        `No se pudo firmar URL para: ${objectPath}${error ? ` (${error.message})` : ''}`,
      );
    }

    return {
      path: objectPath,
      signedUrl: data.signedUrl,
      expiresIn,
    };
  }

  private normalizePath(path: string): string {
    const cleaned = path.replace(/^\/+/, '').replace(/\.\./g, '');
    if (!cleaned) {
      throw new BadRequestException('path inválido');
    }
    return cleaned;
  }

  private sanitizeFilename(name: string): string {
    const base = name.split(/[/\\]/).pop() || 'file';
    return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'file';
  }

  private sanitizeSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'x';
  }
}
