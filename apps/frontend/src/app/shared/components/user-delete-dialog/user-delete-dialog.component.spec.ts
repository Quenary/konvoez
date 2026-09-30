import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { UserDeleteDialogComponent } from './user-delete-dialog.component';

describe('UserDeleteDialogComponent', () => {
  let fixture: ComponentFixture<UserDeleteDialogComponent>;
  let component: UserDeleteDialogComponent;

  const mockContext = {
    completeWith: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [UserDeleteDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDeleteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should confirm logical deletion when the checkbox is off', () => {
    component['confirm']();

    expect(mockContext.completeWith).toHaveBeenCalledWith({
      fullDeletion: false,
    });
  });

  it('should confirm full deletion when the checkbox is on', () => {
    component['fullDeletion'].setValue(true);
    component['confirm']();

    expect(mockContext.completeWith).toHaveBeenCalledWith({
      fullDeletion: true,
    });
  });

  it('should cancel without a result', () => {
    component['cancel']();

    expect(mockContext.completeWith).toHaveBeenCalledWith(null);
  });
});
