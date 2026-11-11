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

    const event = new KeyboardEvent('keydown', {
      code: 'KeyM',
      ctrlKey: true,
      shiftKey: true,
      key: 'Ь',
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith('CommandOrControl+Shift+M');
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

  it('modifier-only key keeps recording without emitting stop', () => {
    createComponent('CommandOrControl+D');
    const onStop = vi.fn();
    component.recordingStop.subscribe(onStop);

    component.startRecording();
    fixture.detectChanges();

    const ctrlEvent = new KeyboardEvent('keydown', {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    component['handleKeyDown'](ctrlEvent);
    fixture.detectChanges();

    expect(ctrlEvent.defaultPrevented).toBe(true);
    expect(component.recording()).toBe(true);
    expect(onStop).not.toHaveBeenCalled();
  });
});
