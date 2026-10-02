import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import {
  attachmentsMaxImagePixels,
  attachmentsThumbnailMaxSide,
} from '@konvoez/shared';

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

  public async readImageMetadata(filePath: string): Promise<{
    width: number | null;
    height: number | null;
    pages: number;
    format: string | undefined;
  } | null> {
    try {
      const metadata = await sharp(filePath, {
        limitInputPixels: attachmentsMaxImagePixels,
      }).metadata();
      let width = metadata.width ?? null;
      let height = metadata.height ?? null;
      const orientation = metadata.orientation ?? 1;
      if (
        width !== null &&
        height !== null &&
        orientation >= 5 &&
        orientation <= 8
      ) {
        const swapped = width;
        width = height;
        height = swapped;
      }
      return {
        width,
        height,
        pages: metadata.pages ?? 1,
        format: metadata.format,
      };
    } catch {
      return null;
    }
  }

  public async stripMetadata(filePath: string): Promise<number> {
    const cleaned = `${filePath}.clean`;
    await sharp(filePath).rotate().toFile(cleaned);
    await fs.promises.rename(cleaned, filePath);
    const stat = await fs.promises.stat(filePath);
    return stat.size;
  }

  public async writeThumbnail(
    filePath: string,
    destPath: string,
    pages: number,
  ): Promise<void> {
    let pipeline = sharp(filePath, {
      limitInputPixels: attachmentsMaxImagePixels,
      pages: pages > 1 ? 1 : undefined,
    }).rotate();
    pipeline = pipeline.resize({
      width: attachmentsThumbnailMaxSide,
      height: attachmentsThumbnailMaxSide,
      fit: 'inside',
      withoutEnlargement: true,
    });
    await pipeline.webp({ quality: 80 }).toFile(destPath);
  }
}
