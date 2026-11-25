/**
 * Meta Ad Library via the page's own GraphQL payload.
 *
 * The public Ad Library is a Relay app. A single page load gives two things:
 *
 *   1. ~27 ads already embedded as server-rendered JSON in the HTML, and
 *   2. a fully-tokened `AdLibraryFilterContextProviderQuery` POST body that
 *      can be cloned into `AdLibrarySearchPaginationQuery` requests.
 *
 * Replaying that body with `variables.cursor` paginates without scrolling. A
 * measured run for "physiotherapy centre" (IN, ~970 results) returned 104
 * unique ads in 8 requests / ~10 s / ~506 KB, against ~23 s for the equivalent
 * scroll loop at 2.5 s per step. The JSON is also richer than the rendered
 * cards: ad id, page, active flag, start/end timestamps, platforms, active
 * time, collation metadata and the full creative snapshot.
 *
 * Operational requirements and known fragility:
 *
 *   - A real browser is required for cookies and the page's `lsd` token. A
 *     bare fetch cannot paginate.
 *   - Google Chrome must be installed, or set META_BROWSER_EXECUTABLE_PATH.
 *     META_BROWSER_CHANNEL overrides the default `chrome` channel.
 *   - `doc_id` and `v` are deploy-versioned by Meta. Override them with
 *     META_AD_LIBRARY_DOC_ID / META_AD_LIBRARY_GRAPHQL_VERSION when Meta
 *     rotates them, or re-capture from a fresh page load.
 *   - Cursors are short-lived and tied to the page's session. Use them
 *     immediately and never persist them.
 *
 * Callers should treat any failure here as "fall back to Crawl4AI", not as a
 * reason to fail the whole search.
 */

import { randomUUID } from "node:crypto";
import type { Browser, LaunchOptions, Page } from "playwright-core";
import { buildMetaAdLibraryUrl } from "./scraper.service";

const GRAPHQL_URL = "https://www.facebook.com/api/graphql/";
const FRIENDLY_NAME = "AdLibrarySearchPaginationQuery";
const FILTER_REQUEST_MARKER = "AdLibraryFilterContextProviderQuery";

const DEFAULT_DOC_ID = "29218106027816007";
const DEFAULT_GRAPHQL_VERSION = "6c680d";

const DEFAULT_PAGE_TIMEOUT_MS = 60_000;
const DEFAULT_SETTLE_MS = 6_000;
const PAGINATION_DELAY_MS = 250;
const MAX_TARGET_ADS = 500;
const SEARCH_RESULTS_PATH = "data.ad_library_main.search_results_connection";

/**
 * A string expression, not a function: transpiled functions can carry helper
 * references (such as esbuild's `__name`) that do not exist in the page.
 * Keeping only matching scripts also avoids transferring every script.
 */
const SSR_SCRIPTS_EXPRESSION =
  'Array.from(document.querySelectorAll("script"))' +
  '.map((script) => script.textContent ?? "")' +
  '.filter((text) => text.includes("search_results_connection"))';

export type MetaAdStatus = "active" | "inactive";

export interface MetaAdMedia {
  videos: string[];
  images: string[];
}

export interface MetaAdRecord {
  libraryId: string;
  adUrl: string;
  pageId: string | null;
  pageName: string | null;
  content: string;
  title: string | null;
  ctaText: string | null;
  linkUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  status: MetaAdStatus;
  activeTimeDays: number | null;
  collationCount: number | null;
  displayFormat: string | null;
  publisherPlatforms: string[];
  media: MetaAdMedia;
}

export interface MetaFetchTelemetry {
  navigationMs: number;
  paginationMs: number;
  totalMs: number;
  ssrAds: number;
  requests: number;
  bytes: number;
  reportedResults: string | null;
  source: "ssr+graphql";
}

export interface MetaSearchResult {
  query: string;
  country: string;
  startDate: string;
  endDate: string;
  url: string;
  ads: MetaAdRecord[];
  telemetry: MetaFetchTelemetry;
}

export interface FetchMetaAdsParams {
  query: string;
  country?: string;
  startDate: string;
  endDate: string;
  mediaType?: "all" | "image" | "video";
  targetCount: number;
  pageTimeoutMs?: number;
  /** Time allowed for the filter request to appear after DOMContentLoaded. */
  settleMs?: number;
  maxPaginationRequests?: number;
  signal?: AbortSignal;
  onTelemetry?: (telemetry: MetaFetchTelemetry) => void;
}

/** A failure that means "the GraphQL path did not work"; callers may fall back. */
export class MetaGraphQLUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetaGraphQLUnavailableError";
  }
}

interface RawImage {
  original_image_url?: string | null;
  resized_image_url?: string | null;
  watermarked_resized_image_url?: string | null;
}

interface RawVideo extends RawImage {
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  video_preview_image_url?: string | null;
}

interface RawCard extends RawImage, RawVideo {
  title?: string | null;
  body?: string | null;
  link_url?: string | null;
  cta_text?: string | null;
}

interface RawSnapshot {
  page_id?: string | number | null;
  page_name?: string | null;
  body?: { text?: string | null } | null;
  title?: string | null;
  cta_text?: string | null;
  link_url?: string | null;
  display_format?: string | null;
  images?: RawImage[] | null;
  extra_images?: RawImage[] | null;
  videos?: RawVideo[] | null;
  extra_videos?: RawVideo[] | null;
  cards?: RawCard[] | null;
}

interface RawAd {
  ad_archive_id?: string | number | null;
  ad_id?: string | number | null;
  page_id?: string | number | null;
  page_name?: string | null;
  is_active?: boolean | null;
  start_date?: number | null;
  end_date?: number | null;
  total_active_time?: number | null;
  collation_count?: number | null;
  publisher_platform?: string[] | null;
  snapshot?: RawSnapshot | null;
}

interface SsrPayload {
  ads: unknown[];
  cursor: string | null;
  hasNext: boolean | null;
  path: string | null;
}

function envString(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new MetaGraphQLUnavailableError("Meta Ad Library fetch was aborted.");
  }
}

function launchOptions(): LaunchOptions {
  const executablePath = process.env.META_BROWSER_EXECUTABLE_PATH?.trim();
  const base: LaunchOptions = {
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  };
  if (executablePath) return { ...base, executablePath };
  return { ...base, channel: envString("META_BROWSER_CHANNEL", "chrome") };
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  try {
    return await chromium.launch(launchOptions());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MetaGraphQLUnavailableError(
      `Could not launch a browser for the Ad Library (${message}). ` +
        "Install Google Chrome or set META_BROWSER_EXECUTABLE_PATH.",
      { cause: err },
    );
  }
}

interface SsrConnection {
  edges?: unknown[];
  page_info?: {
    end_cursor?: string | null;
    has_next_page?: boolean | null;
  };
}

/**
 * Find the first search connection inside a parsed Relay payload.
 *
 * Runs in Node, not in the page: transpilers inject helpers (for example
 * esbuild's `__name`) into functions passed to `page.evaluate`, and those
 * helpers do not exist in the browser context. Reading the script text and
 * parsing it here avoids that class of failure entirely.
 */
function findSsrConnection(root: unknown): SsrPayload | null {
  const seen = new Set<unknown>();
  const stack: Array<{ value: unknown; path: string }> = [
    { value: root, path: "script" },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const { value, path } = entry;
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    const record = value as Record<string, unknown>;
    const connection = record.search_results_connection as
      | SsrConnection
      | undefined;
    if (connection && Array.isArray(connection.edges)) {
      const ads: unknown[] = [];
      for (const edge of connection.edges) {
        const node = (edge as { node?: { collated_results?: unknown[] } }).node;
        for (const ad of node?.collated_results ?? []) ads.push(ad);
      }
      if (ads.length > 0) {
        return {
          ads,
          cursor: connection.page_info?.end_cursor ?? null,
          hasNext: connection.page_info?.has_next_page ?? null,
          path,
        };
      }
    }

    for (const [key, child] of Object.entries(record)) {
      stack.push({ value: child, path: `${path}.${key}` });
    }
  }

  return null;
}

/**
 * Read the inline scripts and extract the server-rendered search connection.
 * Uses `allTextContents()` so no function crosses the page boundary.
 */
async function extractSsrPayload(page: Page): Promise<SsrPayload | null> {
  const texts = (await page.evaluate(SSR_SCRIPTS_EXPRESSION)) as unknown;
  if (!Array.isArray(texts)) return null;

  for (const entry of texts) {
    if (typeof entry !== "string") continue;
    const text = entry;
    if (!text.includes("search_results_connection")) continue;

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Some payloads are wrapped; try the known wrappers below.
    }

    if (!parsed) {
      const requireMatch = text.match(/\{"require"[\s\S]*\}/);
      if (requireMatch) {
        try {
          parsed = JSON.parse(requireMatch[0]);
        } catch {
          // Not parseable; try the next script.
        }
      }
    }
    if (!parsed) {
      const dataMatch = text.match(/(\{"data":[\s\S]*\})\s*$/);
      if (dataMatch) {
        try {
          parsed = JSON.parse(dataMatch[1]);
        } catch {
          // Not parseable; try the next script.
        }
      }
    }

    if (!parsed) continue;
    const found = findSsrConnection(parsed);
    if (found) return found;
  }

  return null;
}

function pageVars(input: {
  query: string;
  country: string;
  startDate: string;
  mediaType: string;
  cursor: string | null;
}): Record<string, unknown> {
  return {
    activeStatus: "active",
    adType: "ALL",
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: [input.country],
    cursor: input.cursor,
    excludedIDs: null,
    first: 10,
    isTargetedCountry: false,
    location: null,
    mediaType: input.mediaType,
    multiCountryFilterMode: null,
    pageIDs: [],
    potentialReachInput: null,
    publisherPlatforms: [],
    queryString: input.query,
    regions: null,
    searchType: "keyword_unordered",
    sessionID: randomUUID(),
    sortData: {
      direction: "DESCENDING",
      mode: "SORT_BY_RELEVANCY_MONTHLY_GROUPED",
    },
    source: null,
    startDate: { max: null, min: input.startDate },
    v: envString("META_AD_LIBRARY_GRAPHQL_VERSION", DEFAULT_GRAPHQL_VERSION),
    viewAllPageID: "0",
  };
}

function buildPaginationBody(
  template: string,
  variables: Record<string, unknown>,
): string {
  const body = new URLSearchParams(template);
  body.set("fb_api_req_friendly_name", FRIENDLY_NAME);
  body.set(
    "doc_id",
    envString("META_AD_LIBRARY_DOC_ID", DEFAULT_DOC_ID),
  );
  body.set("variables", JSON.stringify(variables));
  body.set("__req", String(Math.floor(Math.random() * 9) + 2));
  return body.toString();
}

async function postPagination(
  page: Page,
  body: string,
): Promise<{ status: number; text: string }> {
  return page.evaluate(
    async (input) => {
      const response = await fetch(input.endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-friendly-name": input.friendlyName,
        },
        body: input.body,
      });
      return { status: response.status, text: await response.text() };
    },
    { endpoint: GRAPHQL_URL, friendlyName: FRIENDLY_NAME, body },
  );
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return cleanText(value);
}

function cleanUrl(value: unknown): string | null {
  return cleanText(value);
}

function addUnique(target: string[], value: string | null): void {
  if (value && !target.includes(value)) target.push(value);
}

function collectMedia(snapshot: RawSnapshot | null | undefined): MetaAdMedia {
  const videos: string[] = [];
  const images: string[] = [];
  if (!snapshot) return { videos, images };

  const pushImage = (image: RawImage | null | undefined): void => {
    if (!image) return;
    addUnique(images, cleanUrl(image.original_image_url));
    addUnique(images, cleanUrl(image.resized_image_url));
    addUnique(images, cleanUrl(image.watermarked_resized_image_url));
  };

  const pushVideo = (video: RawVideo | null | undefined): void => {
    if (!video) return;
    addUnique(videos, cleanUrl(video.video_hd_url));
    addUnique(videos, cleanUrl(video.video_sd_url));
    addUnique(images, cleanUrl(video.video_preview_image_url));
  };

  for (const image of snapshot.images ?? []) pushImage(image);
  for (const image of snapshot.extra_images ?? []) pushImage(image);
  for (const video of snapshot.videos ?? []) pushVideo(video);
  for (const video of snapshot.extra_videos ?? []) pushVideo(video);
  for (const card of snapshot.cards ?? []) {
    pushImage(card);
    pushVideo(card);
  }

  return { videos, images };
}

function readContent(snapshot: RawSnapshot | null | undefined): {
  content: string;
  title: string | null;
} {
  const title = cleanText(snapshot?.title);
  const body = cleanText(snapshot?.body?.text);
  if (title || body) {
    return {
      title,
      content: [title, body].filter(Boolean).join("\n\n"),
    };
  }

  const cardText = (snapshot?.cards ?? [])
    .map((card) =>
      [cleanText(card.title), cleanText(card.body)].filter(Boolean).join(" — "),
    )
    .filter((text) => text.length > 0)
    .slice(0, 3)
    .join("\n");
  return { title, content: cardText };
}

function unixToIsoDate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function rawAdId(ad: RawAd): string | null {
  const value = ad.ad_archive_id ?? ad.ad_id;
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

function toMetaAdRecord(ad: RawAd, id: string): MetaAdRecord {
  const snapshot = ad.snapshot;
  const { content, title } = readContent(snapshot);
  const activeSeconds =
    typeof ad.total_active_time === "number" && ad.total_active_time > 0
      ? ad.total_active_time
      : null;

  return {
    libraryId: id,
    adUrl: `https://www.facebook.com/ads/library/?id=${id}`,
    pageId: cleanId(snapshot?.page_id ?? ad.page_id),
    pageName: cleanText(snapshot?.page_name ?? ad.page_name),
    content: content || title || "(no ad copy)",
    title,
    ctaText: cleanText(snapshot?.cta_text),
    linkUrl: cleanText(snapshot?.link_url),
    startDate: unixToIsoDate(ad.start_date),
    endDate: unixToIsoDate(ad.end_date),
    status: ad.is_active === false ? "inactive" : "active",
    activeTimeDays:
      activeSeconds === null
        ? null
        : Math.round((activeSeconds / 86_400) * 100) / 100,
    collationCount:
      typeof ad.collation_count === "number" ? ad.collation_count : null,
    displayFormat: cleanText(snapshot?.display_format),
    publisherPlatforms: (ad.publisher_platform ?? []).filter(
      (platform): platform is string => typeof platform === "string",
    ),
    media: collectMedia(snapshot),
  };
}

function addRawAd(target: Map<string, RawAd>, value: unknown): void {
  if (!value || typeof value !== "object") return;
  const ad = value as RawAd;
  const id = rawAdId(ad);
  if (!id || target.has(id)) return;
  target.set(id, ad);
}

function defaultMaxRequests(targetCount: number): number {
  return Math.min(60, Math.max(3, Math.ceil(targetCount / 8) + 2));
}

/**
 * Fetch ads for one Ad Library search through the page's GraphQL endpoint.
 *
 * Throws MetaGraphQLUnavailableError on any structural failure so the caller
 * can fall back to the markdown crawler.
 */
export async function fetchMetaAdsViaGraphQL(
  params: FetchMetaAdsParams,
): Promise<MetaSearchResult> {
  const query = params.query.trim();
  if (!query) {
    throw new MetaGraphQLUnavailableError("A search query is required.");
  }

  const country = (params.country?.trim() || "IN").toUpperCase();
  const mediaType = params.mediaType ?? "all";
  const targetCount = Math.max(1, Math.min(params.targetCount, MAX_TARGET_ADS));
  const pageTimeoutMs = params.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS;
  const settleMs = params.settleMs ?? DEFAULT_SETTLE_MS;
  const startedAt = Date.now();

  const url = buildMetaAdLibraryUrl({
    query,
    country,
    startDate: params.startDate,
    endDate: params.endDate,
    mediaType,
  });

  let browser: Browser | null = null;
  try {
    throwIfAborted(params.signal);
    browser = await launchBrowser();
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1400, height: 1000 },
    });
    const page = await context.newPage();

    let filterBody: string | null = null;
    let fallbackBody: string | null = null;

    page.on("request", (request) => {
      if (filterBody) return;
      if (!request.url().includes("/api/graphql/")) return;
      let body: string | null = null;
      try {
        body = request.postData();
      } catch {
        return;
      }
      if (!body || !body.includes("lsd=")) return;
      if (body.includes(FILTER_REQUEST_MARKER)) {
        filterBody = body;
      } else if (!fallbackBody) {
        fallbackBody = body;
      }
    });

    const navigationStarted = Date.now();
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: pageTimeoutMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MetaGraphQLUnavailableError(
        `Meta Ad Library did not load (${message}).`,
        { cause: err },
      );
    }
    const navigationMs = Date.now() - navigationStarted;
    throwIfAborted(params.signal);

    const settleDeadline = Date.now() + settleMs;
    while (!filterBody && Date.now() < settleDeadline) {
      await page.waitForTimeout(250);
    }
    filterBody ??= fallbackBody;

    const ssr = await extractSsrPayload(page).catch(() => null);
    const rawAds = new Map<string, RawAd>();
    for (const ad of ssr?.ads ?? []) addRawAd(rawAds, ad);
    const ssrAds = rawAds.size;

    const pageText = await page.innerText("body").catch(() => "");
    let reportedResults =
      pageText.match(/~?[\d,.]+\s*results?/i)?.[0] ?? null;
    if (!reportedResults) {
      const reportDeadline = Date.now() + 1500;
      while (!reportedResults && Date.now() < reportDeadline) {
        await page.waitForTimeout(200);
        const text = await page.innerText("body").catch(() => "");
        reportedResults = text.match(/~?[\d,.]+\s*results?/i)?.[0] ?? null;
      }
    }

    let requests = 0;
    let bytes = 0;
    let paginationMs = 0;

    if (filterBody && rawAds.size < targetCount) {
      const maxRequests =
        params.maxPaginationRequests ?? defaultMaxRequests(targetCount);
      let cursor: string | null = ssr?.cursor ?? null;
      const variablesBase = pageVars({
        query,
        country,
        startDate: params.startDate,
        mediaType,
        cursor,
      });

      for (let i = 0; i < maxRequests && rawAds.size < targetCount; i++) {
        throwIfAborted(params.signal);
        const variables = { ...variablesBase, cursor };
        const body = buildPaginationBody(filterBody, variables);
        const requestStarted = Date.now();

        let response: { status: number; text: string };
        try {
          response = await postPagination(page, body);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new MetaGraphQLUnavailableError(
            `Ad Library pagination request failed (${message}).`,
            { cause: err },
          );
        }
        paginationMs += Date.now() - requestStarted;
        requests += 1;
        bytes += response.text.length;

        if (response.status !== 200) {
          throw new MetaGraphQLUnavailableError(
            `Ad Library pagination returned HTTP ${response.status}.`,
          );
        }

        let payload: unknown;
        try {
          payload = JSON.parse(response.text);
        } catch {
          throw new MetaGraphQLUnavailableError(
            "Ad Library pagination returned non-JSON.",
          );
        }

        const connection = (
          payload as {
            data?: {
              ad_library_main?: {
                search_results_connection?: {
                  edges?: Array<{
                    node?: { collated_results?: unknown[] };
                  }>;
                  page_info?: {
                    end_cursor?: string | null;
                    has_next_page?: boolean | null;
                  };
                };
              };
            };
          }
        ).data?.ad_library_main?.search_results_connection;

        if (!connection) {
          throw new MetaGraphQLUnavailableError(
            `Ad Library pagination returned no ${SEARCH_RESULTS_PATH}.`,
          );
        }

        for (const edge of connection.edges ?? []) {
          for (const ad of edge.node?.collated_results ?? []) {
            addRawAd(rawAds, ad);
          }
        }

        const nextCursor = connection.page_info?.end_cursor ?? null;
        if (!connection.page_info?.has_next_page || !nextCursor) break;
        if (nextCursor === cursor) break;
        cursor = nextCursor;

        if (rawAds.size < targetCount) {
          await page.waitForTimeout(PAGINATION_DELAY_MS);
        }
      }
    }

    if (rawAds.size === 0) {
      throw new MetaGraphQLUnavailableError(
        "The Ad Library page loaded but exposed no ads.",
      );
    }

    const ads = Array.from(rawAds, ([id, raw]) => toMetaAdRecord(raw, id))
      .slice(0, targetCount);

    const telemetry: MetaFetchTelemetry = {
      navigationMs,
      paginationMs,
      totalMs: Date.now() - startedAt,
      ssrAds,
      requests,
      bytes,
      reportedResults,
      source: "ssr+graphql",
    };
    params.onTelemetry?.(telemetry);

    return {
      query,
      country,
      startDate: params.startDate,
      endDate: params.endDate,
      url,
      ads,
      telemetry,
    };
  } finally {
    await browser?.close().catch(() => {
      // Closing a crashed browser must not mask the original error.
    });
  }
}
