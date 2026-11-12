import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SourceCardComponent } from './source-card.component';

describe('SourceCardComponent', () => {
  let fixture: ComponentFixture<SourceCardComponent>;
  let component: SourceCardComponent;

  const createComponent = (selected = false) => {
    fixture = TestBed.createComponent(SourceCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sourceId', 'screen:0');
    fixture.componentRef.setInput('name', 'Entire Screen');
    fixture.componentRef.setInput('thumbnailUrl', 'data:image/png;base64,abc');
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return { fixture, component };
  };

  it('renders with option role and reflects selected class/attr', () => {
    createComponent(true);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('option');
    expect(host.getAttribute('aria-selected')).toBe('true');
    expect(host.classList.contains('selected')).toBe(true);
  });

  it('click and Space emit select', () => {
    createComponent();
    const onSelect = vi.fn();
    component.sourceSelect.subscribe(onSelect);

    const host = fixture.nativeElement as HTMLElement;
    host.click();
    expect(onSelect).toHaveBeenCalledWith('screen:0');

    host.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space' }),
    );
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('dblclick and Enter emit activate', () => {
    createComponent();
    const onActivate = vi.fn();
    component.sourceActivate.subscribe(onActivate);

    const host = fixture.nativeElement as HTMLElement;
    host.dispatchEvent(new MouseEvent('dblclick'));
    expect(onActivate).toHaveBeenCalledWith('screen:0');

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onActivate).toHaveBeenCalledTimes(2);
  });
});
