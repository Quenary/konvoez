import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import path from 'path';

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  limitInputPixels?: number;
}

const DEFAULT_IMAGE_PROCESSING_OPTIONS: ImageProcessingOptions = {
  width: 512,
  height: 512,
  quality: 85,
  limitInputPixels: 268402689,
};

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  /**
   * Processes an image buffer, resizes it and converts it to WebP format.
   *
   * @param file The uploaded file object
   * @param options Processing options like width, height, and quality
   * @returns The modified file object
   */
  public async convertToWebp(
    file: Express.Multer.File,
    options: ImageProcessingOptions = DEFAULT_IMAGE_PROCESSING_OPTIONS,
  ): Promise<Express.Multer.File> {
    const { width, height, quality, limitInputPixels } = {
      ...DEFAULT_IMAGE_PROCESSING_OPTIONS,
      ...options,
    };

    if (!file?.buffer) {
      throw new BadRequestException('File buffer is missing');
    }

    try {
      const webpBuffer = await sharp(file.buffer, { limitInputPixels })
        .rotate()
        .resize(width, height, {
          fit: 'cover',
          position: sharp.strategy.attention,
        })
        .webp({ quality })
        .toBuffer();

      const originalNameWithoutExt = path.parse(file.originalname).name;
      const newOriginalName = `${originalNameWithoutExt}.webp`;

      return {
        ...file,
        buffer: webpBuffer,
        originalname: newOriginalName,
        mimetype: 'image/webp',
        size: webpBuffer.length,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to process image ${file.originalname}: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadRequestException('Invalid or corrupted image file');
    }
  }
}
