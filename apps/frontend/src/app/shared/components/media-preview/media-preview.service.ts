import { inject, Injectable, Injector } from '@angular/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TuiPreviewDialogService } from '@taiga-ui/kit';
import { Observable } from 'rxjs';
import { MediaPreviewComponent } from './media-preview.component';
import { IMediaPreviewItem, MEDIA_PREVIEW_DATA } from './media-preview';

@Injectable({ providedIn: 'root' })
export class MediaPreviewService {
  private readonly previewDialogs = inject(TuiPreviewDialogService);
  private readonly injector = inject(Injector);

  public open(
    items: readonly IMediaPreviewItem[],
    startIndex: number,
  ): Observable<void> {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MEDIA_PREVIEW_DATA,
          useValue: { items, startIndex },
        },
      ],
    });
    return this.previewDialogs.open(
      new PolymorpheusComponent(MediaPreviewComponent, injector),
    );
  }
}
