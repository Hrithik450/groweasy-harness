/** Convert a camel-case provider slug into its display title. */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/** Display name of the provider that owns a connector. */
export function getProviderFromSlug(providerSlug: string): string {
  return slugToTitle(providerSlug);
}

/** Parameters the Gateway appends when an OAuth callback returns to the app. */
export const OAUTH_RETURN_PARAMS = [
  "open_connector",
  "meta_connected",
  "shopify_connected",
] as const;

/** Empty fragment Facebook appends to its OAuth return URL. */
export const FACEBOOK_RETURN_FRAGMENT = "#_=_";

/**
 * Remove every occurrence of the named parameters from a query string.
 *
 * `URLSearchParams.delete` drops all values for a key, so a callback whose
 * parameters were duplicated by a stale return URL is fully cleared rather
 * than leaving a second pair behind.
 *
 * @param search - a query string with or without its leading `?`.
 * @param names - parameter names to remove.
 * @returns the remaining query (without `?`) and whether anything changed.
 */
export function stripQueryParams(
  search: string,
  names: readonly string[],
): { search: string; removed: boolean } {
  const params = new URLSearchParams(search);
  let removed = false;
  for (const name of names) {
    if (params.has(name)) {
      params.delete(name);
      removed = true;
    }
  }
  return { search: params.toString(), removed };
}

/**
 * Drop a fragment only when it is Facebook's empty OAuth marker; real hash
 * routes are preserved.
 * @param hash - `window.location.hash`, including the leading `#`.
 */
export function stripFacebookReturnFragment(hash: string): string {
  return hash === FACEBOOK_RETURN_FRAGMENT ? "" : hash;
}

/** Remove the named parameters from the address bar, keeping everything else. */
export function removeQueryParams(names: readonly string[]): void {
  if (typeof window === "undefined") return;
  const { search, removed } = stripQueryParams(window.location.search, names);
  const hash = stripFacebookReturnFragment(window.location.hash);
  if (!removed && hash === window.location.hash) return;
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${search ? `?${search}` : ""}${hash}`,
  );
}

/**
 * The current app path to return to after an OAuth hop.
 *
 * Strips callback parameters so a stale `open_connector`/`meta_connected` pair
 * cannot ride into the next login and come back duplicated.
 */
export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/c";
  const params = new URLSearchParams(window.location.search);
  for (const name of OAUTH_RETURN_PARAMS) params.delete(name);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}
