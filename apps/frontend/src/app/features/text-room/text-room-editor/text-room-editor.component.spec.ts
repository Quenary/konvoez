import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { TextRoomEditorComponent } from './text-room-editor.component';

describe('TextRoomEditorComponent', () => {
  let component: TextRoomEditorComponent;
  let fixture: ComponentFixture<TextRoomEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextRoomEditorComponent],
      providers: [provideMockStore()],
    }).compileComponents();

    fixture = TestBed.createComponent(TextRoomEditorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
