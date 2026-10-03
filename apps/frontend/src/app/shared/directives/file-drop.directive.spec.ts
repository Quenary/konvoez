import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FileDropDirective } from './file-drop.directive';

@Component({
  imports: [FileDropDirective],
  template: `<div
    appFileDrop
    (filesDropped)="files = $event"></div>`,
})
class HostComponent {
  files: File[] = [];
}

describe('FileDropDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('emits dropped files and ignores drags without files', () => {
    const element = fixture.nativeElement.querySelector('div') as HTMLElement;
    const textDrag = new Event('drop', { bubbles: true });
    Object.defineProperty(textDrag, 'dataTransfer', {
      value: { types: ['text/plain'], files: [] },
    });
    element.dispatchEvent(textDrag);
    expect(fixture.componentInstance.files).toEqual([]);

    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { types: ['Files'], files: [file] },
    });
    element.dispatchEvent(drop);
    expect(fixture.componentInstance.files).toEqual([file]);
    expect(element.classList.contains('_drag-over')).toBe(false);
  });
});
