import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsProfileComponent } from './settings-profile.component';

describe('SettingsProfileComponent', () => {
  let component: SettingsProfileComponent;
  let fixture: ComponentFixture<SettingsProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsProfileComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
