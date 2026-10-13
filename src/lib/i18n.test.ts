import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { en } from '../locales/en';
import {
  DEFAULT_LOCALE,
  localizeClientName,
  resolveLocale,
  textDirection,
  translator,
} from './i18n';

const localeTags = fs
  .readdirSync(path.join(process.cwd(), 'src/locales'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, ''));

describe('resolveLocale', () => {
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['*', 'en'],
    ['en-GB', 'en'],
    ['EN-us,fr;q=0.8', 'en'],
    ['fr', 'fr'],
    ['fr-CA,en;q=0.8', 'fr-CA'],
    ['fr-BE', 'fr'],
    ['es-MX', 'es-MX'],
    ['es-AR', 'es'],
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt-PT'],
    ['zh-CN', 'zh-Hans'],
    ['zh-Hans-CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh', 'zh-Hans'],
    ['no', 'nb'],
    ['nn-NO', 'nb'],
    ['iw', 'he'],
    ['de_DE', 'de'],
    ['sw,xx', 'en'],
  ])('resolves %p to %p', (header, expected) => {
    expect(resolveLocale(header)).toBe(expected);
  });

  it('prefers the highest q-value that is supported', () => {
    expect(resolveLocale('xx;q=0.9,de;q=0.5,fr;q=0.8')).toBe('fr');
  });

  it('honours header order for equal q-values', () => {
    expect(resolveLocale('ja,de')).toBe('ja');
  });

  it('ignores q=0 and malformed entries', () => {
    expect(resolveLocale('de;q=0')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('de;q=abc')).toBe(DEFAULT_LOCALE);
  });

  it('accepts an array of header values', () => {
    expect(resolveLocale(['xx', 'it'])).toBe('it');
  });
});

describe('textDirection', () => {
  it.each(['ar', 'he', 'ur'])('%s is rtl', (locale) => {
    expect(textDirection(locale)).toBe('rtl');
  });

  it.each(['en', 'de', 'zh-Hans'])('%s is ltr', (locale) => {
    expect(textDirection(locale)).toBe('ltr');
  });
});

describe('translator', () => {
  it('returns the english message', () => {
    expect(translator('en')('common.continue')).toBe('Continue');
  });

  it('returns the translated message', () => {
    expect(translator('de')('common.continue')).toBe('Weiter');
  });

  it('falls back to english for an unknown locale', () => {
    expect(translator('xx')('common.cancel')).toBe('Cancel');
  });
});

describe('catalogs', () => {
  it('ships the same 46 translated locales as the apps plus English', () => {
    expect(localeTags).toHaveLength(47);
    expect(localeTags).toEqual(
      expect.arrayContaining(['en', 'ar', 'es-MX', 'zh-Hans', 'zh-Hant'])
    );
  });

  it.each(localeTags.filter((tag) => tag !== 'en'))(
    '%s defines every key, with no leftover tokens or empty values',
    async (tag) => {
      const { messages } = await import(`../locales/${tag}`);
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(messages)) {
        expect(typeof value).toBe('string');
        expect((value as string).trim()).not.toBe('');
        expect(value as string).not.toMatch(/[{}]/);
        expect(key).toBeTruthy();
      }
    }
  );

  it.each(localeTags)('%s is registered and resolvable', (tag) => {
    expect(resolveLocale(tag)).toBe(tag);
  });

  it('keeps the brand name untranslated in the email subject', () => {
    for (const tag of localeTags.filter((t) => t !== 'en')) {
      const t = translator(tag);
      expect(t('email.subject')).toContain('Bubbly Clouds');
      expect(t('email.thanks')).toContain('Bubbly Clouds');
    }
  });
});

describe('localizeClientName', () => {
  it('translates the known app names', () => {
    expect(localizeClientName('de', 'Sudoku Race')).toBe('Sudoku-Rennen');
    expect(localizeClientName('ja', 'Unblock Race')).toBe('ブロック解除レース');
  });

  it('matches regardless of case and surrounding whitespace', () => {
    expect(localizeClientName('de', ' sudoku race ')).toBe('Sudoku-Rennen');
  });

  it('returns the english name for english', () => {
    expect(localizeClientName('en', 'Sudoku Race')).toBe('Sudoku Race');
  });

  it('leaves unknown client names untouched', () => {
    expect(localizeClientName('de', 'Test App')).toBe('Test App');
    expect(localizeClientName('de', undefined)).toBeUndefined();
  });
});
