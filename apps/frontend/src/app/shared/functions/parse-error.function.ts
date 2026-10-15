import { HttpErrorResponse } from '@angular/common/http';
import { parseApiError } from '@core/services/api-error.service';

export const parseError = (
  error: HttpErrorResponse | Error | string | unknown,
): string | undefined => {
  let text: string | undefined = undefined;
  const apiError = parseApiError(error);

  if (error instanceof HttpErrorResponse) {
    text = `${error.status}`;
    if (apiError) {
      text += `<br>${apiError.message || apiError.code}`;
      if (Array.isArray(apiError.fields) && apiError.fields.length > 0) {
        text += '<br><ul>';
        for (const d of apiError.fields) {
          text += `<li>${d.path}: ${d.code}</li>`;
        }
        text += '</ul>';
      }
    } else {
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
    }
  } else if (apiError) {
    text = apiError.message || apiError.code;
    if (Array.isArray(apiError.fields) && apiError.fields.length > 0) {
      text += '<br><ul>';
      for (const d of apiError.fields) {
        text += `<li>${d.path}: ${d.code}</li>`;
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
