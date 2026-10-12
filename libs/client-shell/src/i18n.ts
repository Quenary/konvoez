export type TLanguage = 'en' | 'ru';

export function resolveLanguage(locale?: string): TLanguage {
  const raw = (locale ?? '').toLowerCase();
  return raw.startsWith('ru') ? 'ru' : 'en';
}

export type TDictionary = Record<string, string>;
export type TTranslations = Record<TLanguage, TDictionary>;

export interface TTranslator {
  readonly language: TLanguage;
  setLanguage(lang: TLanguage): void;
  subscribe(fn: (lang: TLanguage) => void): () => void;
  t(key: string, vars?: Record<string, string>): string;
}

export function createTranslator<TDict extends TTranslations>(
  dicts: TDict,
  initial: TLanguage = 'en',
): TTranslator {
  let currentLanguage: TLanguage = initial;
  const subscribers = new Set<(lang: TLanguage) => void>();

  return {
    get language(): TLanguage {
      return currentLanguage;
    },
    setLanguage(lang: TLanguage): void {
      if (currentLanguage === lang) {
        return;
      }
      currentLanguage = lang;
      for (const fn of subscribers) {
        fn(currentLanguage);
      }
    },
    subscribe(fn: (lang: TLanguage) => void): () => void {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    t(key: string, vars?: Record<string, string>): string {
      const dict = dicts[currentLanguage] as Record<string, string> | undefined;
      const enDict = dicts.en as Record<string, string> | undefined;
      let text = dict?.[key] ?? enDict?.[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
      }
      return text;
    },
  };
}
