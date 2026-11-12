import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { HotkeyInputComponent } from './hotkey-input.component';

describe('HotkeyInputComponent', () => {
  let fixture: ComponentFixture<HotkeyInputComponent>;
  let component: HotkeyInputComponent;

  const createComponent = (value: string | null = 'CommandOrControl+D') => {
    fixture = TestBed.createComponent(HotkeyInputComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return { fixture, component };
  };

  it('focus triggers recording and emits recordingStart', () => {
    createComponent();
    const onStart = vi.fn();
    component.recordingStart.subscribe(onStart);

    component.startRecording();
    fixture.detectChanges();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(component.recording()).toBe(true);
  });

  it('keydown with shortcut sets value, emits valueChange and recordingStop {cancelled: false}', () => {
    createComponent('CommandOrControl+D');
    const onChange = vi.fn();
    const onStop = vi.fn();
    component.valueChange.subscribe(onChange);
    component.recordingStop.subscribe(onStop);

    component.startRecording();
    fixture.detectChanges();

    const ctrl = new KeyboardEvent('keydown', {
      code: 'ControlLeft',
      key: 'Control',
      bubbles: true,
      cancelable: true,
    });
    const shift = new KeyboardEvent('keydown', {
      code: 'ShiftLeft',
      key: 'Shift',
      bubbles: true,
      cancelable: true,
    });
    const event = new KeyboardEvent('keydown', {
      code: 'KeyM',
      key: 'Ь',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](ctrl);
    component['handleKeyDown'](shift);
    component['handleKeyDown'](event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith('ControlLeft+ShiftLeft+M');
    expect(onStop).toHaveBeenCalledWith({ cancelled: false });
    expect(component.recording()).toBe(false);
  });

  it('Escape cancels recording, emits recordingStop {cancelled: true} without valueChange', () => {
    createComponent('CommandOrControl+D');
    const onChange = vi.fn();
    const onStop = vi.fn();
    component.valueChange.subscribe(onChange);
    component.recordingStop.subscribe(onStop);

    component.startRecording();
    fixture.detectChanges();

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](escEvent);
    fixture.detectChanges();

    expect(escEvent.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledWith({ cancelled: true });
    expect(component.recording()).toBe(false);
  });

  it('Backspace sets value to null, emits valueChange(null) and recordingStop {cancelled: false}', () => {
    createComponent('CommandOrControl+D');
    const onChange = vi.fn();
    const onStop = vi.fn();
    component.valueChange.subscribe(onChange);
    component.recordingStop.subscribe(onStop);

    component.startRecording();
    fixture.detectChanges();

    const bsEvent = new KeyboardEvent('keydown', {
      key: 'Backspace',
      code: 'Backspace',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](bsEvent);
    fixture.detectChanges();

    expect(bsEvent.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(onStop).toHaveBeenCalledWith({ cancelled: false });
    expect(component.recording()).toBe(false);
  });

  it('modifier keydown keeps recording and keyup stores that side', () => {
    createComponent('CommandOrControl+D');
    const onChange = vi.fn();
    const onStop = vi.fn();
    component.valueChange.subscribe(onChange);
    component.recordingStop.subscribe(onStop);

    component.startRecording();
    fixture.detectChanges();

    const ctrlEvent = new KeyboardEvent('keydown', {
      key: 'Control',
      code: 'ControlLeft',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](ctrlEvent);
    fixture.detectChanges();

    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(component.recording()).toBe(true);
    expect(onStop).not.toHaveBeenCalled();

    const repeat = new KeyboardEvent('keydown', {
      key: 'Control',
      code: 'ControlLeft',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](repeat);

    const ctrlUp = new KeyboardEvent('keyup', {
      key: 'Control',
      code: 'ControlLeft',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyUp'](ctrlUp);
    fixture.detectChanges();

    expect(onChange).toHaveBeenCalledWith('ControlLeft');
    expect(onStop).toHaveBeenCalledWith({ cancelled: false });
    expect(component.recording()).toBe(false);
  });

  it('records the held side when a non-modifier follows', () => {
    createComponent(null);
    const onChange = vi.fn();
    component.valueChange.subscribe(onChange);

    component.startRecording();
    component['handleKeyDown'](
      new KeyboardEvent('keydown', {
        code: 'ControlRight',
        key: 'Control',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(onChange).not.toHaveBeenCalled();

    component['handleKeyDown'](
      new KeyboardEvent('keydown', {
        code: 'KeyM',
        key: 'M',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onChange).toHaveBeenCalledWith('ControlRight+M');
    expect(component.recording()).toBe(false);
  });

  it('records two modifiers when the last one is released', () => {
    createComponent(null);
    const onChange = vi.fn();
    component.valueChange.subscribe(onChange);
    component.startRecording();

    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control' }),
    );
    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'AltLeft', key: 'Alt' }),
    );
    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'ControlLeft', key: 'Control' }),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(component.recording()).toBe(true);

    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'AltLeft', key: 'Alt' }),
    );
    expect(onChange).toHaveBeenCalledWith('AltLeft+ControlLeft');
  });

  it('drops the Left Ctrl that Windows sends with Right Alt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    createComponent(null);
    const onChange = vi.fn();
    component.valueChange.subscribe(onChange);
    component.startRecording();

    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control' }),
    );
    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'AltRight', key: 'Alt' }),
    );
    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'ControlLeft', key: 'Control' }),
    );
    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'AltRight', key: 'Alt' }),
    );

    expect(onChange).toHaveBeenCalledWith('AltRight');
    vi.useRealTimers();
  });

  it('keeps Left Ctrl when it is held before Right Alt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    createComponent(null);
    const onChange = vi.fn();
    component.valueChange.subscribe(onChange);
    component.startRecording();

    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control' }),
    );
    vi.setSystemTime(new Date('2026-01-01T00:00:00.200Z'));
    component['handleKeyDown'](
      new KeyboardEvent('keydown', { code: 'AltRight', key: 'Alt' }),
    );
    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'ControlLeft', key: 'Control' }),
    );
    component['handleKeyUp'](
      new KeyboardEvent('keyup', { code: 'AltRight', key: 'Alt' }),
    );

    expect(onChange).toHaveBeenCalledWith('AltRight+ControlLeft');
    vi.useRealTimers();
  });
});
