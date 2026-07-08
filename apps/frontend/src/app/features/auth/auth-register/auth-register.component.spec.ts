import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthRegisterComponent } from './auth-register.component';

describe('AuthRegisterComponent', () => {
  let component: AuthRegisterComponent;
  let fixture: ComponentFixture<AuthRegisterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthRegisterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthRegisterComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
