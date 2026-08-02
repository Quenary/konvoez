import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LogoComponent } from '@shared/components/logo/logo.component';

@Component({
  selector: 'app-main',
  imports: [LogoComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainComponent {}
