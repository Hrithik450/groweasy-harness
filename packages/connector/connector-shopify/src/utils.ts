export function getShopifyPrimaryUrl(
  connector?: { metadata?: unknown } | null,
): string | null {
  const meta = (connector?.metadata as Record<string, unknown>) || {};
  if (
    typeof meta.primaryDomainUrl === "string" &&
    meta.primaryDomainUrl.trim()
  ) {
    const url = meta.primaryDomainUrl.trim();
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
  if (typeof meta.domain === "string" && meta.domain.trim()) {
    const host = meta.domain
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
    return host ? `https://${host}` : null;
  }
  if (typeof meta.shop === "string" && meta.shop.trim()) {
    const host = meta.shop
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");
    return host ? `https://${host}` : null;
  }
  return null;
}
