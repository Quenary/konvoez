/**
 * Body part for a user-picked file.
 *
 * WebKit 26.5+ can send a disk-backed picker `File` as an empty request body
 * (https://bugs.webkit.org/show_bug.cgi?id=319985). A slice has no file path,
 * so WebKit serializes its bytes from the page. Nothing is copied.
 */
export function toUploadBlob(file: Blob): Blob {
  return file.slice(0, file.size, file.type);
}
