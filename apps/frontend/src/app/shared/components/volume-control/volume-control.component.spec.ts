import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { VolumeControlComponent } from './volume-control.component';

@Component({
  selector: 'app-volume-control-host',
  imports: [VolumeControlComponent],
  template: `
    <app-volume-control
      [value]="value()"
      [id]="id"
      [min]="min"
      [max]="max"
      [label]="label"
      (valueChange)="value.set($event)" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class VolumeControlHostComponent {
  public readonly value = signal(125);
  public readonly id = 'test-volume-control';
  public min = 10;
  public max = 150;
  public label = 'Peer volume';
}

describe('VolumeControlComponent', () => {
  let fixture: ComponentFixture<VolumeControlHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VolumeControlHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VolumeControlHostComponent);
    fixture.detectChanges();
  });

  it('renders its label, value, and configured range', () => {
    const input = fixture.nativeElement.querySelector(
      'input[tuiInputSlider]',
    ) as HTMLInputElement;

    expect(fixture.nativeElement.textContent).toContain('Peer volume');
    expect(input.id).toBe('test-volume-control');
    expect(input.value).toBe('125');
    const component = fixture.debugElement
      .query(By.directive(VolumeControlComponent))
      .injector.get(VolumeControlComponent);
    expect(component.min()).toBe(10);
    expect(component.max()).toBe(150);
    expect(
      fixture.nativeElement.querySelector('label')?.getAttribute('for'),
    ).toBe('test-volume-control');
  });

  it('emits changes from the slider', () => {
    const input = fixture.nativeElement.querySelector(
      'input[tuiInputSlider]',
    ) as HTMLInputElement;
    input.value = '80';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe(80);
  });
});
