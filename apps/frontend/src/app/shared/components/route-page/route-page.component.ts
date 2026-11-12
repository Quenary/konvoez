import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TuiScrollbar } from '@taiga-ui/core';

@Component({
  selector: 'app-route-page',
  imports: [TuiScrollbar],
  templateUrl: './route-page.component.html',
  styleUrl: './route-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutePageComponent {}
