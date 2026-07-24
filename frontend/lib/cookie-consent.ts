/**
 * Cookie consent preferences, stored in localStorage. "Strictly necessary"
 * cookies are always on and cannot be disabled.
 */
export interface CookieConsent {
  necessary: true;
  marketingAnalytics: boolean;
  preferences: boolean;
  updatedAt: string;
}

const STORAGE_KEY = "cookie-consent";

export const defaultConsent: CookieConsent = {
  necessary: true,
  marketingAnalytics: false,
  preferences: false,
  updatedAt: "",
};

export function getConsent(): CookieConsent {
  if (typeof window === "undefined") return defaultConsent;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConsent;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return {
      necessary: true,
      marketingAnalytics: Boolean(parsed.marketingAnalytics),
      preferences: Boolean(parsed.preferences),
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return defaultConsent;
  }
}

export function setConsent(
  consent: Omit<CookieConsent, "necessary" | "updatedAt">
): CookieConsent {
  const value: CookieConsent = {
    necessary: true,
    marketingAnalytics: consent.marketingAnalytics,
    preferences: consent.preferences,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    // Let any listeners (e.g. a consent banner, analytics loader) react.
    window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: value }));
  }
  return value;
}
