/**
 * Headers for multipart uploads.
 *
 * `ngsw-bypass` keeps the Angular service worker from re-issuing the request:
 * WebKit can drop the body of a POST that a service worker fetches again
 * (https://bugs.webkit.org/show_bug.cgi?id=319985).
 */
export const uploadRequestHeaders = { 'ngsw-bypass': 'true' } as const;
