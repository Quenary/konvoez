import { AbstractControl } from '@angular/forms';

export type TInterfaceToForm<T extends Record<string, any>> = {
  [P in keyof T]: AbstractControl<T[P] | null>;
};
