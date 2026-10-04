import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaGridComponent } from './media-grid.component';

@Component({
  imports: [MediaGridComponent],
  template: `
    <app-media-grid
      [aspect]="aspect"
      [items]="items"
      [template]="tile" />
    <ng-template
      #tile
      let-item>
      <span class="cell">{{ item }}</span>
    </ng-template>
  `,
})
class HostComponent {
  items = ['a', 'b', 'c'];
  aspect: { width: number; height: number } | null = null;
}

describe('MediaGridComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('renders a cell per item with the computed grid column and aspect ratio', () => {
    const cells = [
      ...fixture.nativeElement.querySelectorAll('.media-grid-cell'),
    ] as HTMLElement[];
    expect(cells).toHaveLength(3);
    expect(cells.map((cell) => cell.style.gridColumn)).toEqual([
      'span 6',
      'span 3',
      'span 3',
    ]);
    expect(cells[0]?.style.aspectRatio).toBe('1 / 1');
  });
});
