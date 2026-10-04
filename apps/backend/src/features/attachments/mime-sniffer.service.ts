import { Injectable } from '@nestjs/common';
import fs from 'fs';
import { loadEsm } from 'load-esm';

@Injectable()
export class MimeSnifferService {
  public async sniff(filePath: string): Promise<string | null> {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(4100);
      const { bytesRead } = await handle.read(buffer, 0, 4100, 0);
      const fileType = await loadEsm<typeof import('file-type')>('file-type');
      const detected = await fileType.fileTypeFromBuffer(
        buffer.subarray(0, bytesRead),
      );
      return detected?.mime ?? null;
    } finally {
      await handle.close();
    }
  }
}
