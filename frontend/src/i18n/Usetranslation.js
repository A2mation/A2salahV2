import { useEffect, useState } from 'react';
import { getLocale, subscribeLocale, DEFAULT_LOCALE } from './localeStore';
import dictionaries from './translations';

// Looks up 'namespace.key' in the given language's dictionary, falling
// back to English (then to the key itself) if a translation is missing —
// so a partially-translated language never renders blank text.
function lookup(locale, path) {
  const segments = path.split('.');
  let node = dictionaries[locale];
  for (const segment of segments) {
    node = node?.[segment];
    if (node === undefined) break;
  }
  if (node === undefined && locale !== DEFAULT_LOCALE) {
    return lookup(DEFAULT_LOCALE, path);
  }
  return node === undefined ? path : node;
}

// Fills {placeholders} in a translated string with values from `vars`,
// e.g. t('drawer.currentVersion', { version: '1.0.0' }).
function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined ? String(vars[key]) : match,
  );
}

// Every screen that renders user-facing text should call this instead of
// hardcoding strings. Re-renders automatically the moment the language
// changes anywhere in the app (e.g. from the drawer's Language picker),
// since it subscribes to localeStore the same way other screens subscribe
// to locationStore / drawerStore.
export default function useTranslation() {
  const [locale, setLocaleState] = useState(getLocale());

  useEffect(() => subscribeLocale(setLocaleState), []);

  const t = (path, vars) => interpolate(lookup(locale, path), vars);

  return { t, locale };
}