import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';

// In production the working dir (e.g. /app) is owned by root while the process
// runs as a non-root user, so it isn't writable. Fall back to the OS temp dir,
// which is always writable. Override with UPLOAD_DIR if you mount a volume.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? resolve(process.env.UPLOAD_DIR)
  : process.env.NODE_ENV === 'production'
    ? join(tmpdir(), 'uploads')
    : join(process.cwd(), 'uploads');

// Lazily ensure the upload dir exists. We must NOT create it at module-load time:
// passing a string `destination` to multer's diskStorage runs mkdirp.sync() inside
// its constructor (which the @UseInterceptors decorator evaluates at import), so a
// non-writable dir would crash the entire app at boot. Using a `destination`
// function defers dir creation to request time, where a failure is contained.
function ensureUploadDir(cb: (err: Error | null, dir: string) => void) {
  try {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  } catch (err) {
    cb(err as Error, UPLOAD_DIR);
  }
}

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly config: ConfigService) {}

  @Post('signature')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get upload signature (Cloudinary if configured, else stub)' })
  signature(@Body() body: { folder?: string }) {
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const uploadPreset = this.config.get<string>('CLOUDINARY_UPLOAD_PRESET');
    const folder = body?.folder ?? 'indiasmarttrade';
    if (apiSecret && apiKey && cloudName && uploadPreset) {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = `folder=${folder}&timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
      const signature = createHash('sha1').update(params).digest('hex');
      return {
        provider: 'cloudinary',
        timestamp,
        signature,
        apiKey,
        cloudName,
        folder,
        uploadPreset,
        url: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      };
    }
    return {
      provider: 'stub',
      uploadUrl: 'http://localhost:4000/upload/dev',
    };
  }

  @Post('dev')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Local dev upload — saves to backend/uploads/' })
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => ensureUploadDir(cb),
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '');
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /image\/(png|jpe?g|webp|gif)|application\/pdf/.test(file.mimetype);
        cb(ok ? null : new BadRequestException('Unsupported file type'), ok);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    return {
      url: `http://localhost:4000/upload/files/${file.filename}`,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  @Get('files/:filename')
  @ApiOperation({ summary: 'Serve a previously-uploaded dev file' })
  serve(@Param('filename') filename: string, @Res() res: Response) {
    if (!/^[\w-]+\.[\w]+$/.test(filename)) throw new BadRequestException('Invalid filename');
    const path = join(UPLOAD_DIR, filename);
    if (!existsSync(path)) throw new NotFoundException();
    res.sendFile(path);
  }
}
