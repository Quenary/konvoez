import { inject, Pipe, PipeTransform } from '@angular/core';
import { DesktopI18nService } from './desktop-i18n.service';

@Pipe({
  name: 'i18n',
  pure: false,
})
export class I18nPipe implements PipeTransform {
  private readonly desktopI18nService = inject(DesktopI18nService);

  public transform(key: string, params?: Record<string, string>): string {
    return this.desktopI18nService.translate(key, params);
  }
}
