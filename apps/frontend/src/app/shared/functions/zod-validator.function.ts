import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { assertInInjectionContext, computed, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { merge, startWith } from 'rxjs';
import { z } from 'zod';
import { SCHEMA_ERROR } from '@konvoez/shared';

const ZOD_ERROR_KEY = 'zod';
const ZOD_FORM_ERROR_KEY = 'zodForm';

type ZodSchemaInput = z.ZodType | ((control: AbstractControl) => z.ZodType);

type ZodFieldErrors<T extends { [K in keyof T]: AbstractControl }> = {
  [K in keyof T]: string | null;
};

const firstIssueMessage = (error: z.ZodError): string =>
  error.issues[0]?.message ?? SCHEMA_ERROR.REQUIRED;

const resolveSchema = (
  schema: ZodSchemaInput,
  control: AbstractControl,
): z.ZodType => (typeof schema === 'function' ? schema(control) : schema);

const controlValue = (control: AbstractControl): unknown =>
  control instanceof FormGroup ? control.getRawValue() : control.value;

const groupValue = (group: FormGroup): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(group.controls).map(([key, child]) => [key, child.value]),
  );

const setControlError = (
  control: AbstractControl,
  key: string,
  message: string | null,
): void => {
  const current = control.errors;
  if (message) {
    if (current?.[key] === message) {
      return;
    }
    control.setErrors(
      { ...(current ?? {}), [key]: message },
      { emitEvent: false },
    );
    return;
  }

  if (!current?.[key]) {
    return;
  }

  const rest = { ...current };
  delete rest[key];
  control.setErrors(Object.keys(rest).length ? rest : null, {
    emitEvent: false,
  });
};

const clearFormMappedErrors = (group: FormGroup): void => {
  for (const child of Object.values(group.controls)) {
    setControlError(child, ZOD_FORM_ERROR_KEY, null);
  }
};

const collectGroupErrors = (
  group: FormGroup,
  schema: z.ZodType,
): Record<string, string | null> => {
  const errors: Record<string, string | null> = {};
  for (const key of Object.keys(group.controls)) {
    errors[key] = null;
  }

  const result = schema.safeParse(groupValue(group));
  if (result.success) {
    return errors;
  }

  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string' || !group.controls[key]) {
      continue;
    }
    if (!group.controls[key].touched || errors[key]) {
      continue;
    }
    errors[key] = issue.message;
  }

  return errors;
};

const trackControl = (control: AbstractControl): Signal<unknown> => {
  const sources = [control.events];
  if (control instanceof FormGroup) {
    for (const child of Object.values(control.controls)) {
      sources.push(child.events);
    }
  }

  return toSignal(merge(...sources).pipe(startWith(null)), {
    requireSync: true,
  });
};

export function createZodFieldValidator(schema: z.ZodType): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    if (result.success) {
      return null;
    }
    return { [ZOD_ERROR_KEY]: firstIssueMessage(result.error) };
  };
}

export function createZodFormValidator(schema: ZodSchemaInput): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const resolved = resolveSchema(schema, control);
    const result = resolved.safeParse(controlValue(control));

    if (control instanceof FormGroup) {
      clearFormMappedErrors(control);
    }

    if (result.success) {
      return null;
    }

    if (!(control instanceof FormGroup)) {
      return { [ZOD_ERROR_KEY]: firstIssueMessage(result.error) };
    }

    let formMessage: string | undefined;
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && control.controls[key]) {
        setControlError(
          control.controls[key],
          ZOD_FORM_ERROR_KEY,
          issue.message,
        );
        continue;
      }
      formMessage ??= issue.message;
    }

    return formMessage ? { [ZOD_ERROR_KEY]: formMessage } : null;
  };
}

export function createZodError<T extends { [K in keyof T]: AbstractControl }>(
  control: FormGroup<T>,
  schema: ZodSchemaInput,
): Signal<ZodFieldErrors<T>>;
export function createZodError(
  control: FormControl,
  schema: ZodSchemaInput,
): Signal<string | null>;
export function createZodError(
  control: AbstractControl,
  schema: ZodSchemaInput,
): Signal<string | null | Record<string, string | null>> {
  assertInInjectionContext(createZodError);

  const events = trackControl(control);

  return computed(() => {
    events();
    const resolved = resolveSchema(schema, control);

    if (control instanceof FormGroup) {
      return collectGroupErrors(control, resolved);
    }

    if (!control.touched) {
      return null;
    }

    const result = resolved.safeParse(control.value);
    return result.success ? null : firstIssueMessage(result.error);
  });
}
