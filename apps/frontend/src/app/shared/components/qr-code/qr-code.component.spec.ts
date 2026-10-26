import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { QrCodeComponent } from './qr-code.component';

describe('QrCodeComponent', () => {
  let fixture: ComponentFixture<QrCodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QrCodeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(QrCodeComponent);
  });

  it('renders SVG element with specified dimensions and crisp QR path', () => {
    fixture.componentRef.setInput(
      'value',
      'otpauth://totp/KonvoEZ:test?secret=JBSWY3DPEHPK3PXP',
    );
    fixture.componentRef.setInput('size', 180);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector(
      'svg',
    ) as SVGSVGElement | null;
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('180');
    expect(svg?.getAttribute('height')).toBe('180');

    const path = svg?.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toContain('M');
    expect(path?.getAttribute('fill')).toBe('#000000');
  });
});
