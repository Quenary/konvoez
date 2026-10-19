import {
  inject,
  Pipe,
  PipeTransform,
  Sanitizer,
  SecurityContext,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { MENTION_EVERYONE, splitMentionSegments } from '@konvoez/shared';

@Pipe({
  name: 'textContent',
})
export class TextContentPipe implements PipeTransform {
  private readonly sanitizer = inject(Sanitizer);
  private readonly usersStore = inject(UsersStore, { optional: true });
  private readonly rolesStore = inject(RolesStore, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });

  transform(html: string | null | undefined, renderMentions = false): string {
    if (!html) {
      return '';
    }

    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    if (!sanitized) {
      return '';
    }

    let plainText: string;
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(sanitized, 'text/html');
      plainText = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    } else {
      plainText = sanitized
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!renderMentions || !plainText) {
      return plainText;
    }

    const segments = splitMentionSegments(plainText);
    const usersMap = this.usersStore?.entityMap() ?? {};
    const rolesMap = this.rolesStore?.rolesById() ?? {};
    const raw = this.translate?.instant('CHAT.MENTION_UNKNOWN');
    const unknown = !raw || raw === 'CHAT.MENTION_UNKNOWN' ? 'unknown' : raw;

    return segments
      .map((seg) => {
        if (seg.type === 'text') {
          return seg.value;
        }
        if (seg.type === 'everyone') {
          return MENTION_EVERYONE;
        }
        if (seg.type === 'role') {
          const role = rolesMap[seg.id];
          return role ? `@${role.name}` : `@${unknown}`;
        }
        if (seg.type === 'user') {
          const user = usersMap[seg.id];
          return user ? `@${user.username}` : `@${unknown}`;
        }
        return `@${unknown}`;
      })
      .join('');
  }
}
