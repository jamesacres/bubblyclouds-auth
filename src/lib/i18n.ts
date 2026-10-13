import { Catalog, en, TranslationKey } from '../locales/en';
import { messages as ar } from '../locales/ar';
import { messages as bn } from '../locales/bn';
import { messages as ca } from '../locales/ca';
import { messages as cs } from '../locales/cs';
import { messages as da } from '../locales/da';
import { messages as de } from '../locales/de';
import { messages as el } from '../locales/el';
import { messages as es } from '../locales/es';
import { messages as esMX } from '../locales/es-MX';
import { messages as fi } from '../locales/fi';
import { messages as fr } from '../locales/fr';
import { messages as frCA } from '../locales/fr-CA';
import { messages as gu } from '../locales/gu';
import { messages as he } from '../locales/he';
import { messages as hi } from '../locales/hi';
import { messages as hr } from '../locales/hr';
import { messages as hu } from '../locales/hu';
import { messages as id } from '../locales/id';
import { messages as it } from '../locales/it';
import { messages as ja } from '../locales/ja';
import { messages as kn } from '../locales/kn';
import { messages as ko } from '../locales/ko';
import { messages as ml } from '../locales/ml';
import { messages as mr } from '../locales/mr';
import { messages as ms } from '../locales/ms';
import { messages as nb } from '../locales/nb';
import { messages as nl } from '../locales/nl';
import { messages as or } from '../locales/or';
import { messages as pa } from '../locales/pa';
import { messages as pl } from '../locales/pl';
import { messages as pt } from '../locales/pt';
import { messages as ptPT } from '../locales/pt-PT';
import { messages as ro } from '../locales/ro';
import { messages as ru } from '../locales/ru';
import { messages as sk } from '../locales/sk';
import { messages as sl } from '../locales/sl';
import { messages as sv } from '../locales/sv';
import { messages as ta } from '../locales/ta';
import { messages as te } from '../locales/te';
import { messages as th } from '../locales/th';
import { messages as tr } from '../locales/tr';
import { messages as uk } from '../locales/uk';
import { messages as ur } from '../locales/ur';
import { messages as vi } from '../locales/vi';
import { messages as zhHans } from '../locales/zh-Hans';
import { messages as zhHant } from '../locales/zh-Hant';

// Same locale set as the Bubbly Clouds apps (bubblyclouds-app, LOCALE_TAGS).
// Add a locale by creating src/locales/<tag>.ts and registering it here.
const catalogs: Record<string, Catalog> = {
  en,
  ar,
  bn,
  ca,
  cs,
  da,
  de,
  el,
  es,
  'es-MX': esMX,
  fi,
  fr,
  'fr-CA': frCA,
  gu,
  he,
  hi,
  hr,
  hu,
  id,
  it,
  ja,
  kn,
  ko,
  ml,
  mr,
  ms,
  nb,
  nl,
  or,
  pa,
  pl,
  pt,
  'pt-PT': ptPT,
  ro,
  ru,
  sk,
  sl,
  sv,
  ta,
  te,
  th,
  tr,
  uk,
  ur,
  vi,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
};

export const DEFAULT_LOCALE = 'en';

export type Locale = string;

const RTL_LANGUAGES = ['ar', 'he', 'ur'];

export const textDirection = (locale: Locale): 'ltr' | 'rtl' =>
  RTL_LANGUAGES.includes(locale.split('-')[0]) ? 'rtl' : 'ltr';

// Mirrors the apps' resolveLocale so the same browser gets the same language.
const LANGUAGE_ALIASES: Record<string, string> = {
  no: 'nb',
  nn: 'nb',
  iw: 'he',
  in: 'id',
};

const TRADITIONAL_REGIONS = ['tw', 'hk', 'mo'];

const normalize = (tag: string): string[] =>
  tag.trim().replace(/_/g, '-').toLowerCase().split('-').filter(Boolean);

const canonicalize = (parts: string[]): string[] => {
  const [language, ...rest] = parts;
  return [LANGUAGE_ALIASES[language] ?? language, ...rest];
};

const chineseScript = (parts: string[]): string => {
  if (parts.includes('hant')) {
    return 'hant';
  }
  if (parts.includes('hans')) {
    return 'hans';
  }
  return parts.some((part) => TRADITIONAL_REGIONS.includes(part))
    ? 'hant'
    : 'hans';
};

const fallbackTags = (tag: string): string[] => {
  const original = normalize(tag);
  if (original.length === 0) {
    return [];
  }
  const parts = canonicalize(original);
  const chain = [original.join('-'), parts.join('-')];
  if (parts[0] === 'zh') {
    chain.push(`zh-${chineseScript(parts)}`);
  } else {
    for (let length = parts.length - 1; length >= 1; length -= 1) {
      chain.push(parts.slice(0, length).join('-'));
    }
  }
  chain.push(parts[0]);
  return Array.from(new Set(chain));
};

const supported = Object.keys(catalogs).map((tag) => ({
  tag,
  key: normalize(tag).join('-'),
  language: canonicalize(normalize(tag))[0],
}));

const matchCandidate = (candidate: string): Locale | undefined => {
  for (const tag of fallbackTags(candidate)) {
    const hit = supported.find((entry) => entry.key === tag);
    if (hit) {
      return hit.tag;
    }
  }
  // Same language, different region (e.g. pt-BR -> pt): prefer the bare language
  const language = canonicalize(normalize(candidate))[0];
  const sameLanguage = supported
    .filter((entry) => entry.language === language)
    .sort((a, b) => a.key.length - b.key.length);
  return sameLanguage[0]?.tag;
};

/**
 * Picks the best supported locale from an Accept-Language header, which is
 * the server-side view of the browser's navigator.languages.
 */
export const resolveLocale = (
  acceptLanguage?: string | string[] | null
): Locale => {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage.join(',')
    : acceptLanguage;
  if (!header) {
    return DEFAULT_LOCALE;
  }

  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const quality = q ? Number(q.slice(2)) : 1;
      return {
        tag: tag.trim(),
        quality: Number.isNaN(quality) ? 0 : quality,
        index,
      };
    })
    .filter(({ tag, quality }) => tag && tag !== '*' && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { tag } of candidates) {
    const locale = matchCandidate(tag);
    if (locale) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
};

export type Translate = (key: TranslationKey) => string;

export const translator =
  (locale: Locale = DEFAULT_LOCALE): Translate =>
  (key) =>
    catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE][key];

// Client names come from AppConfig (English). Known app names are shown in the
// user's language; anything else, including a renamed client, is left as is.
const CLIENT_NAME_KEYS: Record<string, TranslationKey> = {
  'sudoku race': 'client.sudokuRace',
  'unblock race': 'client.unblockRace',
};

export const localizeClientName = (
  locale: Locale,
  clientName?: string
): string | undefined => {
  const key = clientName && CLIENT_NAME_KEYS[clientName.trim().toLowerCase()];
  return key ? translator(locale)(key) : clientName;
};
