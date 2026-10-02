export enum EAttachmentStatus {
  PENDING = 'PENDING',
  ATTACHED = 'ATTACHED',
}

export function isEnospc(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOSPC'
  );
}
