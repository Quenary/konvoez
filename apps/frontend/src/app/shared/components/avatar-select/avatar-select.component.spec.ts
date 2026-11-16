import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiFileLike } from '@taiga-ui/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarSelectComponent } from './avatar-select.component';

describe('AvatarSelectComponent', () => {
  let fixture: ComponentFixture<AvatarSelectComponent>;
  let component: AvatarSelectComponent;
  let control: FormControl<TuiFileLike | null>;

  beforeEach(async () => {
    control = new FormControl<TuiFileLike | null>(null);

    await TestBed.configureTestingModule({
      imports: [AvatarSelectComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarSelectComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('control', control);
    fixture.detectChanges();
  });

  it('renders file input with default and customized attributes', () => {
    const input = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.id).toBe('avatar-file');

    fixture.componentRef.setInput('inputId', 'custom-avatar-id');
    fixture.detectChanges();
    expect(input.id).toBe('custom-avatar-id');
  });

  it('does not display remove button when avatarUrl is null', () => {
    const removeBtn = fixture.nativeElement.querySelector(
      '.avatar-select-remove',
    );
    expect(removeBtn).toBeNull();
  });

  it('displays remove button and preview image when avatarUrl is set', () => {
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/avatar.png',
    );
    fixture.detectChanges();

    const removeBtn = fixture.nativeElement.querySelector(
      '.avatar-select-remove',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    expect(removeBtn.getAttribute('aria-label')).toBe('GENERAL.DELETE');

    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://example.com/avatar.png');
  });

  it('resets control, clears native file input value and emits remove output when remove button is clicked', () => {
    const removeSpy = vi.fn();
    component.remove.subscribe(removeSpy);

    const dummyFile = { name: 'avatar.png', size: 1024 } as TuiFileLike;
    control.setValue(dummyFile);
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/avatar.png',
    );
    fixture.detectChanges();

    const fileInput = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, 'value', {
      writable: true,
      value: 'C:\\fakepath\\avatar.png',
    });

    const removeBtn = fixture.nativeElement.querySelector(
      '.avatar-select-remove',
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();

    removeBtn.click();
    fixture.detectChanges();

    expect(control.value).toBeNull();
    expect(fileInput.value).toBe('');
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('disables file input and remove button, and ignores remove click when control is disabled', () => {
    const removeSpy = vi.fn();
    component.remove.subscribe(removeSpy);

    control.disable();
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/avatar.png',
    );
    fixture.detectChanges();

    const fileInput = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const removeBtn = fixture.nativeElement.querySelector(
      '.avatar-select-remove',
    ) as HTMLButtonElement;

    expect(fileInput.disabled).toBe(true);
    expect(removeBtn.disabled).toBe(true);

    removeBtn.click();
    fixture.detectChanges();

    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('updates disabled state when control is dynamically toggled', () => {
    fixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/avatar.png',
    );
    fixture.detectChanges();

    const fileInput = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const removeBtn = fixture.nativeElement.querySelector(
      '.avatar-select-remove',
    ) as HTMLButtonElement;

    expect(fileInput.disabled).toBe(false);
    expect(removeBtn.disabled).toBe(false);

    control.disable();
    fixture.detectChanges();

    expect(fileInput.disabled).toBe(true);
    expect(removeBtn.disabled).toBe(true);

    control.enable();
    fixture.detectChanges();

    expect(fileInput.disabled).toBe(false);
    expect(removeBtn.disabled).toBe(false);
  });

  it('respects initially disabled control', () => {
    const disabledControl = new FormControl<TuiFileLike | null>({
      value: null,
      disabled: true,
    });
    const disabledFixture = TestBed.createComponent(AvatarSelectComponent);
    disabledFixture.componentRef.setInput('control', disabledControl);
    disabledFixture.componentRef.setInput(
      'avatarUrl',
      'https://example.com/avatar.png',
    );
    disabledFixture.detectChanges();

    const fileInput = disabledFixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const removeBtn = disabledFixture.nativeElement.querySelector(
      '.avatar-select-remove',
    ) as HTMLButtonElement;

    expect(fileInput.disabled).toBe(true);
    expect(removeBtn.disabled).toBe(true);
  });

  it('respects initially disabled control synchronously before detectChanges', () => {
    const disabledControl = new FormControl<TuiFileLike | null>({
      value: null,
      disabled: true,
    });
    const disabledFixture = TestBed.createComponent(AvatarSelectComponent);
    disabledFixture.componentRef.setInput('control', disabledControl);
    expect(disabledFixture.componentInstance['isDisabled']()).toBe(true);
  });
});
