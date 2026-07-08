declare global {
  interface Storage {
    /**
     * Получить значение из хранилища с десериализацией
     * @param key ключ
     */
    getItemJson<T extends unknown = unknown>(key: string): T | null;
    /**
     * Сохранить значение в хранилище с сериализацией
     * @param key ключ
     * @param value значение
     */
    setItemJson<T extends unknown = unknown>(key: string, value: T): void;
  }
}

/**
 * Добавить в прототип Storage функции работы с json.
 * Вызывать один раз в main.ts проекта.
 */
export const storageJson = () => {
  Storage.prototype.getItemJson = (key) => storageGetItemJson(key, this);
  Storage.prototype.setItemJson = (key, value) => storageSetItemJson(key, value, this);
};

/**
 * Получить значение из хранилища с десериализацией
 * @param key ключ
 * @param storage хранилище
 * @default localStorage
 * @returns
 */
export const storageGetItemJson = <T extends unknown = unknown>(
  key: string,
  storage: Storage = localStorage,
): T | null => {
  const value = storage.getItem(key);
  if (value) {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error(e);
      console.warn(`Invalid key '${key}' removed from storage`);
      localStorage.removeItem(key);
      return null;
    }
  }
  return null;
};

/**
 * Сохранить значение в хранилище с сериализацией
 * @param key ключ
 * @param value значение
 * @param storage хранилище
 * @default localStorage
 */
export const storageSetItemJson = <T extends unknown = unknown>(
  key: string,
  value: T,
  storage: Storage = localStorage,
): void => {
  storage.setItem(key, JSON.stringify(value));
};
