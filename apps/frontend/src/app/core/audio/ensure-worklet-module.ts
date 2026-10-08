const workletModules = new WeakMap<
  BaseAudioContext,
  Map<string, Promise<void>>
>();

/**
 * Loads and caches an audio worklet module URL per AudioContext.
 * Evicts the cached promise if loading fails, allowing subsequent retries.
 */
export function ensureWorkletModule(
  context: BaseAudioContext,
  url: string,
): Promise<void> {
  let contextMap = workletModules.get(context);
  if (!contextMap) {
    contextMap = new Map<string, Promise<void>>();
    workletModules.set(context, contextMap);
  }

  const existing = contextMap.get(url);
  if (existing) {
    return existing;
  }

  const loading = context.audioWorklet
    .addModule(url)
    .catch((error: unknown) => {
      contextMap.delete(url);
      throw error;
    });

  contextMap.set(url, loading);
  return loading;
}
