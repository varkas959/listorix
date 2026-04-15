import { useSyncExternalStore } from 'react';
import { getCurrency } from '../services/storage';

export interface CurrencySettings {
  locale: string;
  currencyCode: string;
  currencySymbol: string;
  source: 'stored' | 'device' | 'fallback';
}

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';

const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  US: 'USD', CA: 'CAD', MX: 'MXN',
  DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR',
  BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', IE: 'EUR',
  GR: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR',
  GB: 'GBP', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
  CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', KR: 'KRW',
  SG: 'SGD', HK: 'HKD', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP',
  AE: 'AED', SA: 'SAR', NG: 'NGN', ZA: 'ZAR', KE: 'KES', EG: 'EGP',
  BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
};

const SYMBOLS: Record<string, string> = {
  INR: '\u20B9', USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5', CNY: '\u00A5',
  CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', CHF: 'CHF', SGD: 'S$',
  HKD: 'HK$', KRW: '\u20A9', BRL: 'R$', MXN: 'MX$', TRY: '\u20BA',
  PKR: '\u20A8', BDT: '\u09F3', AED: '\u062F.\u0625', SAR: '\uFDFC', ZAR: 'R',
};

function decodeSymbol(value: string): string {
  return value.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function detectDeviceLocale(): string {
  try {
    return Intl.NumberFormat().resolvedOptions().locale || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function resolveCurrencyFromLocale(locale: string): string | null {
  const region = locale.split('-')[1]?.toUpperCase();
  return region ? REGION_CURRENCY[region] ?? null : null;
}

function parseStoredCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(/\b[A-Z]{3}\b/);
  return match?.[0] ?? null;
}

function extractSymbol(code: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find(part => part.type === 'currency')?.value ?? decodeSymbol(SYMBOLS[code] ?? code);
  } catch {
    return decodeSymbol(SYMBOLS[code] ?? code);
  }
}

function buildSettings(preferredCurrency: string | null): CurrencySettings {
  const locale = detectDeviceLocale();
  const storedCurrency = parseStoredCurrency(preferredCurrency);

  if (storedCurrency) {
    return {
      locale,
      currencyCode: storedCurrency,
      currencySymbol: extractSymbol(storedCurrency, locale),
      source: 'stored',
    };
  }

  const localeCurrency = resolveCurrencyFromLocale(locale);
  if (localeCurrency) {
    return {
      locale,
      currencyCode: localeCurrency,
      currencySymbol: extractSymbol(localeCurrency, locale),
      source: 'device',
    };
  }

  return {
    locale,
    currencyCode: DEFAULT_CURRENCY,
    currencySymbol: extractSymbol(DEFAULT_CURRENCY, locale),
    source: 'fallback',
  };
}

const initialSettings = buildSettings(null);
let currentSettings: CurrencySettings = initialSettings;
const listeners = new Set<() => void>();

function emitCurrencyChange() {
  listeners.forEach(listener => listener());
}

export const LOCALE: string = initialSettings.locale;
export const CURRENCY_CODE: string = initialSettings.currencyCode;
export const CURRENCY_SYMBOL: string = initialSettings.currencySymbol;

export async function initializeCurrencySettings(): Promise<CurrencySettings> {
  const storedCurrency = await getCurrency();
  currentSettings = buildSettings(storedCurrency || null);
  emitCurrencyChange();
  return currentSettings;
}

export async function refreshCurrencySettings(): Promise<CurrencySettings> {
  return initializeCurrencySettings();
}

export function getCurrencySettings(): CurrencySettings {
  return currentSettings;
}

export function subscribeCurrencySettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrencySettings(): CurrencySettings {
  return useSyncExternalStore(subscribeCurrencySettings, getCurrencySettings, getCurrencySettings);
}

export function formatAmount(n: number): string {
  const { locale } = currentSettings;
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

export function formatCurrency(n: number): string {
  const { locale, currencyCode, currencySymbol } = currentSettings;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      currencyDisplay: 'narrowSymbol',
    }).format(n);
  } catch {
    return `${currencySymbol}${formatAmount(n)}`;
  }
}

export function formatDate(
  ts: number,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  try {
    return new Date(ts).toLocaleDateString(currentSettings.locale, opts);
  } catch {
    return new Date(ts).toDateString();
  }
}

export function formatMonth(ts: number): string {
  return formatDate(ts, { month: 'short' });
}
