import { HttpErrorResponse } from '@angular/common/http';

export const parseError = (
  error: HttpErrorResponse | Error | string | unknown,
): string | undefined => {
  let text: string | undefined = undefined;
  if (error instanceof HttpErrorResponse) {
    text = `${error.status}`;
    if (typeof error.error?.message === 'string') {
      text += `<br>${error.error.message}`;
    }

    if (Array.isArray(error.error?.details)) {
      text += '<br><ul>';
      for (const d of error.error.details) {
        text += `<li>${d}</li>`;
      }
      text += '</ul>';
    }
  } else if (error instanceof Error) {
    text = error.message;
  } else if (typeof error === 'string') {
    text = error;
  } else if (error) {
    try {
      text = JSON.stringify(error);
    } catch (e) {
      console.error(e);
    }
  }
  return text;
};
