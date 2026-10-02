import { Directive, output, signal } from '@angular/core';

@Directive({
  selector: '[appFileDrop]',
  host: {
    '[class._drag-over]': 'dragOver()',
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class FileDropDirective {
  public readonly filesDropped = output<File[]>();

  private readonly dragOver = signal(false);
  private depth = 0;

  protected onDragEnter(event: DragEvent): void {
    if (!this.hasFiles(event)) {
      return;
    }
    event.preventDefault();
    this.depth += 1;
    this.dragOver.set(true);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.hasFiles(event)) {
      return;
    }
    event.preventDefault();
  }

  protected onDragLeave(event: DragEvent): void {
    if (!this.hasFiles(event)) {
      return;
    }
    event.preventDefault();
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.dragOver.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (!this.hasFiles(event)) {
      return;
    }
    event.preventDefault();
    this.depth = 0;
    this.dragOver.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.filesDropped.emit(files);
    }
  }

  private hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
}
