/** Brand identity shared by prompts and session metadata. */

export interface BrandConfig {
  name: string;
  founder?: string;
  tone?: string;
  colors?: Record<string, string>;
}

/**
 * Default identity. The colours are literal because this value is prompt and
 * session data — it is printed to the model and copied to the clipboard, where
 * a CSS variable would be meaningless. They mirror the theme's own tokens.
 */
export const DEFAULT_BRAND: BrandConfig = {
  name: "GrowEasy",
  tone: "confident, practical, local-first",
  colors: { ink: "#0e0e0e", accent: "#ff4d1c", paper: "#f3efe4" },
};

/** Merge a stored brand over the defaults. */
export function resolveBrand(partial?: Partial<BrandConfig> | null): BrandConfig {
  return { ...DEFAULT_BRAND, ...(partial ?? {}) };
}

declare const BRAND: unique symbol;

/**
 * A string carrying a compile-time-only brand `B`.
 */
export type Branded<B extends string> = string & { readonly [BRAND]: B };

/**
 * A number carrying a compile-time-only brand `B`.
 */
export type BrandedNumber<B extends string> = number & { readonly [BRAND]: B };

/**
 * Apply a compile-time string brand without mutating the underlying value.
 * @param value - The raw string to brand.
 * @returns The same string branded at compile time.
 */
export function brandString<T extends Branded<string>>(value: string | T): T {
  return value as T;
}

/**
 * Apply a compile-time number brand without mutating the underlying value.
 * @param value - The raw number to brand.
 * @returns The same number branded at compile time.
 */
export function brandNumber<T extends BrandedNumber<string>>(
  value: number | T,
): T {
  return value as T;
}
