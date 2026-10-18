import { EntityManager, RequestContext } from '@mikro-orm/core';

/**
 * Executes a function within the active MikroORM RequestContext if available,
 * or creates a dedicated RequestContext (e.g. when invoked from WebSockets,
 * cron tasks, or event listeners) to ensure each operation has an isolated
 * identity map and avoids `cannotUseGlobalContext` validation errors.
 */
export async function ensureRequestContext<T>(
  em: EntityManager,
  fn: () => Promise<T>,
): Promise<T> {
  if (
    typeof RequestContext?.currentRequestContext !== 'function' ||
    RequestContext.currentRequestContext() ||
    typeof em?.fork !== 'function'
  ) {
    return fn();
  }
  return RequestContext.create(em, fn);
}
