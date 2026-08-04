import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { SessionGuard } from '../auth/guards/session.guard';
import { UploadImageResponseDto } from './dto/upload-image-response.dto';
import { StorageService } from './storage.service';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@ApiTags('Uploads')
@Controller('uploads')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class UploadsController {
  constructor(private readonly storageService: StorageService) {}

  @Post('images')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Upload an image to object storage (R2)',
    description:
      'Accepts multipart field `file` (jpeg/png/webp/gif/heic/heif, max 5MB). Returns a public URL to store on product variants, expert avatars, or treatment progress photos.',
  })
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
  @ApiOkResponse({ type: UploadImageResponseDto })
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ): Promise<UploadImageResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: jpeg, png, webp, gif, heic, heif',
      );
    }

    return this.storageService.uploadImage({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
  }
}
