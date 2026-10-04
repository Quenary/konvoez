import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { EAttachmentKind } from '@konvoez/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileThumbnailComponent } from './file-thumbnail.component';

describe('FileThumbnailComponent', () => {
  let fixture: ComponentFixture<FileThumbnailComponent>;
  let component: FileThumbnailComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileThumbnailComponent],
      providers: [provideTranslateService()],
    }).compileComponents();
    fixture = TestBed.createComponent(FileThumbnailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('name', 'photo.png');
    fixture.componentRef.setInput('kind', EAttachmentKind.IMAGE);
  });

  it('shows a queued loader, an uploading progress value, and an error icon', () => {
    fixture.componentRef.setInput('status', 'queued');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tui-loader')).toBeTruthy();

    fixture.componentRef.setInput('status', 'uploading');
    fixture.componentRef.setInput('progress', 0.4);
    fixture.detectChanges();
    const circle = fixture.debugElement.query(By.css('tui-progress-circle'));
    expect(circle.componentInstance.value()).toBe(40);

    fixture.componentRef.setInput('status', 'error');
    fixture.componentRef.setInput('errorText', 'too big');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.error-icon')).toBeTruthy();
  });

  it('emits remove from the X control and does not activate', () => {
    const removed = vi.fn();
    const activated = vi.fn();
    component.remove.subscribe(removed);
    component.activate.subscribe(activated);
    fixture.componentRef.setInput('interactive', true);
    fixture.componentRef.setInput('removable', true);
    fixture.detectChanges();

    const remove = fixture.nativeElement.querySelector(
      '.remove',
    ) as HTMLButtonElement;
    remove.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    remove.click();

    expect(removed).toHaveBeenCalledTimes(1);
    expect(activated).not.toHaveBeenCalled();
  });

  it('activates from the keyboard only when interactive', () => {
    const activated = vi.fn();
    component.activate.subscribe(activated);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.activate')).toBeNull();

    fixture.componentRef.setInput('interactive', true);
    fixture.detectChanges();
    const activate = fixture.nativeElement.querySelector(
      '.activate',
    ) as HTMLButtonElement;
    activate.click();
    expect(activated).toHaveBeenCalledTimes(1);
  });

  it('shows a duration badge and hides it when duration is missing', () => {
    fixture.componentRef.setInput('name', 'clip.mp4');
    fixture.componentRef.setInput('kind', EAttachmentKind.VIDEO);
    fixture.componentRef.setInput('serverVideo', true);
    fixture.componentRef.setInput('src', '/poster.webp');
    fixture.componentRef.setInput('durationMs', 83_000);
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ROOMS: { VIDEO_DURATION: 'Duration {{duration}}' },
    });
    translate.use('en');
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.duration');
    expect(badge?.textContent?.trim()).toBe('1:23');
    expect(badge?.getAttribute('aria-label')).toBe('Duration 1:23');

    fixture.componentRef.setInput('durationMs', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.duration')).toBeNull();
  });

  it('shows a server video poster with a play badge', () => {
    fixture.componentRef.setInput('name', 'clip.mp4');
    fixture.componentRef.setInput('kind', EAttachmentKind.VIDEO);
    fixture.componentRef.setInput('serverVideo', true);
    fixture.componentRef.setInput('src', '/poster.webp');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('img')?.getAttribute('src'),
    ).toBe('/poster.webp');
    expect(fixture.nativeElement.querySelector('.play')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });

  it('swaps a broken image for the fallback icon', () => {
    fixture.componentRef.setInput('src', 'blob:broken');
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector(
      'img',
    ) as HTMLImageElement;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('tui-icon')).toBeTruthy();
  });
});
