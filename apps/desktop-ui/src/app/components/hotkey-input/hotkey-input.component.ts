import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TuiInput, TuiLabel, TuiTextfield } from '@taiga-ui/core';
import { formatKeyboardEventToAccelerator } from '@konvoez/client-shell';

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
          #inputEl
          tuiInput
          type="text"
          [readonly]="true"
          [disabled]="disabled()"
          [value]="displayValue()"
          [placeholder]="recording() ? recordingPlaceholder() : ''"
          (focus)="startRecording()"
          (click)="startRecording()"
          (keydown)="handleKeyDown($event)" />
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
      {{ recording() ? recordingPlaceholder() || 'Recording shortcut' : '' }}
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

  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  public focus(): void {
    this.inputEl()?.nativeElement.focus();
  }

  public startRecording(): void {
    if (this.disabled() || this.recording()) return;
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
    this.recordingStop.emit({ cancelled: true });
  }

  protected handleKeyDown(e: KeyboardEvent): void {
    if (!this.recording()) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape' || e.code === 'Escape') {
      this.recording.set(false);
      this.recordingStop.emit({ cancelled: true });
      return;
    }

    if (e.key === 'Backspace' || e.code === 'Backspace') {
      this.recording.set(false);
      this.valueChange.emit(null);
      this.recordingStop.emit({ cancelled: false });
      return;
    }

    const accelerator = formatKeyboardEventToAccelerator(e);
    if (accelerator !== null) {
      this.recording.set(false);
      this.valueChange.emit(accelerator);
      this.recordingStop.emit({ cancelled: false });
    }
  }
}
