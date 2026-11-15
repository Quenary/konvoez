import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { CLIENT_LANGUAGE_HEADER } from '@konvoez/shared';
import { UsersService } from '../../features/users/users.service';
import { GetUserFullDto } from '../../features/users/users.dto';

interface RequestWithAuthor extends Request {
  author?: GetUserFullDto;
}

@Injectable()
export class ClientLanguageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ClientLanguageInterceptor.name);

  constructor(private readonly usersService: UsersService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<RequestWithAuthor>();
      const detectedLocale = this.extractDetectedLocale(req);

      const author = req.author;
      if (
        author &&
        detectedLocale &&
        author.lastDetectedLocale !== detectedLocale
      ) {
        author.lastDetectedLocale = detectedLocale;
        void this.usersService
          .updateLastDetectedLocale(author.id, detectedLocale)
          .catch((err: unknown) => {
            this.logger.warn(
              `Failed to update lastDetectedLocale for user ${author.id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
      }
    }

    return next.handle();
  }

  private extractDetectedLocale(req: Request): string | undefined {
    const customHeader = req.headers[CLIENT_LANGUAGE_HEADER];
    if (customHeader) {
      const raw = Array.isArray(customHeader) ? customHeader[0] : customHeader;
      const first = raw?.split(',')[0]?.split(';')[0]?.trim();
      if (first) {
        return this.trimHeaderValue(first);
      }
    }

    const acceptLang = req.headers['accept-language'];
    if (acceptLang) {
      const raw = Array.isArray(acceptLang) ? acceptLang[0] : acceptLang;
      const first = raw?.split(',')[0]?.split(';')[0]?.trim();
      if (first) {
        return this.trimHeaderValue(first);
      }
    }

    return undefined;
  }

  private trimHeaderValue(value: string): string {
    return value.length > 64 ? value.slice(0, 64) : value;
  }
}
