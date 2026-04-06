import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsAdminComponent } from './settings-admin.component';

describe('SettingsAdminComponent', () => {
  let component: SettingsAdminComponent;
  let fixture: ComponentFixture<SettingsAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsAdminComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
