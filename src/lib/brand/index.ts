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
