import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SourceGridComponent } from './source-grid.component';

describe('SourceGridComponent', () => {
  let fixture: ComponentFixture<SourceGridComponent>;
  let component: SourceGridComponent;

  const mockSources = [
    {
      id: 'screen:0',
      name: 'Screen 1',
      thumbnailUrl: 'data:image/png;base64,aaa',
      appIconUrl: null,
    },
    {
      id: 'window:1',
      name: 'Terminal',
      thumbnailUrl: 'data:image/png;base64,bbb',
      appIconUrl: null,
    },
  ];

  it('renders cards and emits select on card selection', () => {
    fixture = TestBed.createComponent(SourceGridComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', mockSources);
    fixture.detectChanges();

    const onSelect = vi.fn();
    component.sourceSelect.subscribe(onSelect);

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'app-source-card',
    );
    expect(cards).toHaveLength(2);

    (cards[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith('window:1');
  });

  it('navigates with arrow keys and updates selection', () => {
    fixture = TestBed.createComponent(SourceGridComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', mockSources);
    fixture.componentRef.setInput('value', 'screen:0');
    fixture.detectChanges();

    const onSelect = vi.fn();
    component.sourceSelect.subscribe(onSelect);

    const host = fixture.nativeElement as HTMLElement;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(onSelect).toHaveBeenCalledWith('window:1');
  });

  it('moves vertically by the rendered column count', () => {
    const sources = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      name: id,
      thumbnailUrl: '',
      appIconUrl: null,
    }));
    fixture = TestBed.createComponent(SourceGridComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sources', sources);
    fixture.componentRef.setInput('value', 'a');
    fixture.detectChanges();

    const grid = (fixture.nativeElement as HTMLElement).querySelector(
      '.grid',
    ) as HTMLElement;
    grid.style.gridTemplateColumns = '80px 80px';

    const onSelect = vi.fn();
    component.sourceSelect.subscribe(onSelect);

    const host = fixture.nativeElement as HTMLElement;
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(onSelect).toHaveBeenCalledWith('c');
  });
});
