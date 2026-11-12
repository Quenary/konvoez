import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TuiInput, TuiLabel, TuiTextfield } from '@taiga-ui/core';
import {
  formatKeyboardEventToAccelerator,
  isModifierCode,
} from '@konvoez/client-shell';

// Windows sends Left Ctrl immediately before Right Alt. A physical Left Ctrl
// held longer than this stays part of the chord.
const ALT_GR_CTRL_MS = 50;

@Component({
  selector: 'app-hotkey-input',
  imports: [TuiInput, TuiLabel, TuiTextfield],
  template: `
    <label
      tuiLabel
      class="hotkey-label">
      {{ label() }}
      <tui-textfield
        tuiTextfieldSize="m"
        [tuiTextfieldCleaner]="false"
        class="hotkey-textfield"
        [class.recording]="recording()"
        [class.has-error]="error().length > 0">
        <input
          tuiInput
          type="text"
          [readonly]="true"
          [disabled]="disabled()"
          [value]="displayValue()"
          [placeholder]="recording() ? recordingPlaceholder() : ''"
          (focus)="startRecording()"
          (click)="startRecording()"
          (keydown)="handleKeyDown($event)"
          (keyup)="handleKeyUp($event)" />
      </tui-textfield>
    </label>

    @if (error(); as err) {
      <div
        class="message error-message"
        role="alert"
        >{{ err }}</div
      >
    } @else if (activeHint(); as hintText) {
      <div class="message hint-message">{{ hintText }}</div>
    }

    <div
      class="sr-only"
      aria-live="polite"
      role="status">
      {{ recording() ? recordingPlaceholder() : '' }}
    </div>
  `,
  styleUrl: './hotkey-input.component.scss',
  host: {
    tabindex: '-1',
    '(focusout)': 'handleFocusOut($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotkeyInputComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  public readonly label = input<string>('');
  public readonly value = input<string | null>(null);
  public readonly recordingPlaceholder = input<string>('');
  public readonly clearHint = input<string>('');
  public readonly hint = input<string>('');
  public readonly error = input<string>('');
  public readonly disabled = input<boolean>(false);

  public readonly valueChange = output<string | null>();
  public readonly recordingStart = output<void>();
  public readonly recordingStop = output<{ cancelled: boolean }>();

  public readonly recording = signal<boolean>(false);

  public readonly displayValue = computed(() => {
    return this.recording() ? '' : (this.value() ?? '');
  });

  public readonly activeHint = computed(() => {
    return this.recording() && this.clearHint()
      ? this.clearHint()
      : this.hint();
  });

  private readonly heldCodes = new Set<string>();
  private readonly gestureCodes = new Set<string>();
  private readonly pressedAt = new Map<string, number>();

  public startRecording(): void {
    if (this.disabled() || this.recording()) return;
    this.resetGesture();
    this.recording.set(true);
    this.recordingStart.emit();
  }

  protected handleFocusOut(e: FocusEvent): void {
    if (
      e.relatedTarget &&
      this.elementRef.nativeElement.contains(e.relatedTarget as Node)
    ) {
      return;
    }
    if (!this.recording()) return;
    this.recording.set(false);
    this.resetGesture();
    this.recordingStop.emit({ cancelled: true });
  }

  protected handleKeyDown(e: KeyboardEvent): void {
    if (!this.recording()) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape' || e.code === 'Escape') {
      this.recording.set(false);
      this.resetGesture();
      this.recordingStop.emit({ cancelled: true });
      return;
    }

    if (e.key === 'Backspace' || e.code === 'Backspace') {
      this.recording.set(false);
      this.resetGesture();
      this.valueChange.emit(null);
      this.recordingStop.emit({ cancelled: false });
      return;
    }

    if (e.repeat || this.heldCodes.has(e.code)) {
      return;
    }

    const now = Date.now();
    if (e.code === 'AltRight') {
      this.dropAltGrControl(now);
    } else if (
      e.code === 'ControlLeft' &&
      this.wasJustPressed('AltRight', now)
    ) {
      return;
    }

    this.heldCodes.add(e.code);
    this.gestureCodes.add(e.code);
    this.pressedAt.set(e.code, now);

    if (isModifierCode(e.code)) {
      return;
    }

    const accelerator = formatKeyboardEventToAccelerator([
      ...this.gestureCodes,
    ]);
    if (accelerator === null) {
      this.gestureCodes.delete(e.code);
      this.heldCodes.delete(e.code);
      return;
    }
    this.commit(accelerator);
  }

  protected handleKeyUp(e: KeyboardEvent): void {
    if (!this.recording()) return;

    e.preventDefault();
    e.stopPropagation();
    this.heldCodes.delete(e.code);
    if (this.heldCodes.size > 0 || this.gestureCodes.size === 0) {
      return;
    }
    if (![...this.gestureCodes].every((code) => isModifierCode(code))) {
      return;
    }

    const accelerator = formatKeyboardEventToAccelerator([
      ...this.gestureCodes,
    ]);
    if (accelerator === null) {
      this.resetGesture();
      return;
    }
    this.commit(accelerator);
  }

  private commit(accelerator: string): void {
    this.recording.set(false);
    this.resetGesture();
    this.valueChange.emit(accelerator);
    this.recordingStop.emit({ cancelled: false });
  }

  private dropAltGrControl(now: number): void {
    if (!this.wasJustPressed('ControlLeft', now)) {
      return;
    }
    this.heldCodes.delete('ControlLeft');
    this.gestureCodes.delete('ControlLeft');
    this.pressedAt.delete('ControlLeft');
  }

  private wasJustPressed(code: string, now: number): boolean {
    const pressedAt = this.pressedAt.get(code);
    return pressedAt !== undefined && now - pressedAt <= ALT_GR_CTRL_MS;
  }

  private resetGesture(): void {
    this.heldCodes.clear();
    this.gestureCodes.clear();
    this.pressedAt.clear();
  }
}
