/**
 * Web boot kernel. It owns the root Cordis context, route selection, the
 * browser package composition, and the renderer handoff.
 *
 * `apps/web` is a static Vite shell: there is no server-side route tree and no
 * app-side store hydrator. The shell therefore reads the route once from
 * `window.location.pathname`, fetches the signed-in user from the Gateway's
 * `/api/auth/session`, and composes exactly the packages that route needs.
 * @module @openai-harness/client-web
 */
import { Context } from "@deepseek-ai/cordis";
import { RpcClient } from "@openai-harness/client-rpc";
// Packages are plugged in as their full module export, so each package's
// `inject` declaration travels with its `apply` (cordis object plugin).
import * as chatPlugin from "@openai-harness/client-ui-chat/client";
import * as connectorsPlugin from "@openai-harness/client-ui-connectors/client";
import * as detailBarPlugin from "@openai-harness/client-ui-detail-bar/client";
import * as landingPlugin from "@openai-harness/client-ui-landing/client";
import * as layoutPlugin from "@openai-harness/client-ui-layout/client";
import * as modalsPlugin from "@openai-harness/client-ui-modals/client";
import * as profilePlugin from "@openai-harness/client-ui-profile/client";
import * as reportPlugin from "@openai-harness/client-ui-report/client";
import * as uiRendererPlugin from "@openai-harness/client-ui-renderer/client";
import {
  configureClientSession,
  useModalStore,
} from "@openai-harness/client-ui-session";
import * as sidebarPlugin from "@openai-harness/client-ui-sidebar/client";
import {
  bootThemeInjections,
  DEFAULT_PREFERENCE,
} from "@openai-harness/client-ui-theme";
import { createSessionJournalHook } from "@openai-harness/session-controller/client";
import { mountClient } from "./mount";

export { mountClient } from "./mount";

/** Gateway development default (HTTP and WS spellings are equivalent). */
const DEFAULT_GATEWAY_URL = "http://localhost:4000";

/** Bootstrap user shape shared with the layout package. */
type InitialUser = NonNullable<
  layoutPlugin.LayoutConfig["initialUser"]
>;

/** One route the shell can compose. */
type AppRoute =
  | { kind: "landing" }
  | { kind: "profile" }
  | { kind: "report"; sessionId: string; reportId: string }
  | { kind: "conversation"; sessionId?: string };

/**
 * Read the route once at boot. Unknown paths (including `/c` without an id)
 * fall back to the marketing landing screen, matching the shell's "landing
 * owns `/`" contract.
 * @param pathname - `window.location.pathname`.
 * @returns the route descriptor.
 */
function resolveRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/" || normalized === "/uno") return { kind: "landing" };
  if (normalized === "/profile") return { kind: "profile" };
  // `/c` is the landing CTAs' target: open the caller's default session.
  if (normalized === "/c") return { kind: "conversation" };

  // Report documents own their own route entry: match the longer path before
  // the plain conversation route so `reports/<id>` is never read as a slug.
  const reportMatch = normalized.match(/^\/c\/([^/]+)\/reports\/([^/]+)$/);
  if (reportMatch) {
    let sessionId = reportMatch[1]!;
    let reportId = reportMatch[2]!;
    try {
      sessionId = decodeURIComponent(sessionId);
      reportId = decodeURIComponent(reportId);
    } catch {
      // Keep the raw path segments when they are not valid percent-encoding.
    }
    return { kind: "report", sessionId, reportId };
  }

  const match = normalized.match(/^\/c\/([^/]+)$/);
  if (match) {
    let sessionId = match[1]!;
    try {
      sessionId = decodeURIComponent(sessionId);
    } catch {
      // Keep the raw path segment when it is not valid percent-encoding.
    }
    return { kind: "conversation", sessionId };
  }

  return { kind: "landing" };
}

/**
 * Resolve an in-app session link to the session id it selects.
 * @param href - link target, relative or absolute.
 * @returns the id for same-origin `/c/<id>` links, else `undefined`.
 */
function sessionIdFromHref(href: string): string | undefined {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    const match = url.pathname.replace(/\/+$/, "").match(/^\/c\/([^/]+)$/);
    if (match === null) return undefined;
    return decodeURIComponent(match[1]!);
  } catch {
    return undefined;
  }
}

/** Read the Gateway base from the Vite build environment. */
function resolveGatewayUrl(): string {
  // Direct `import.meta.env` access so Vite substitutes the value at build
  // time; the gateway origin is the only shell-level environment input.
  return import.meta.env.VITE_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
}

/** Fetch the session user at the Gateway boundary; absent is not an error. */
async function fetchInitialUser(): Promise<InitialUser | null> {
  try {
    const response = await fetch("/api/auth/session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { user?: InitialUser | null };
    return body.user ?? null;
  } catch (error) {
    console.warn("[web boot] failed to read /api/auth/session", error);
    return null;
  }
}

/** Slug opened by a bare `/c`, matching the previous app's redirect. */
const DEFAULT_SESSION_SLUG = "adStrategist";

/**
 * Pick the session a bare `/c` should open: the default seeded role, else the
 * first visible session, else the first session.
 * @param rpc - gateway client bound by {@link AppWebEntry.configureGateway}.
 * @returns the session id the chat package boots with.
 */
async function resolveDefaultSessionId(rpc: RpcClient): Promise<string> {
  const sessions = await rpc.call("session.list", undefined);
  const chosen =
    sessions.find((session) => session.slug === DEFAULT_SESSION_SLUG) ??
    sessions.find((session) => !session.hidden) ??
    sessions[0];
  if (chosen === undefined) {
    throw new Error("web boot: /c has no session to open");
  }
  return chosen.id;
}

/** Minimal failure presentation used until a boot page package exists. */
function renderFailure(container: HTMLElement, reason: unknown): void {
  const message = reason instanceof Error ? reason.message : String(reason);
  const node = container.ownerDocument.createElement("pre");
  node.dataset.bootError = "";
  node.setAttribute("role", "alert");
  node.style.margin = "0";
  node.style.padding = "1rem";
  node.style.whiteSpace = "pre-wrap";
  node.style.font = "12px/1.5 ui-monospace, monospace";
  node.textContent = `web boot failed\n\n${message}`;
  container.replaceChildren(node);
}

/** Browser boot entry consumed by `apps/web`. */
export class AppWebEntry {
  private readonly container: HTMLElement;
  private ctx: Context | undefined;
  private rpc: RpcClient | undefined;
  private chatFiber: ReturnType<Context["plugin"]> | undefined;
  private activeSessionId: string | undefined;
  /** Route kind the composed plugin tree was built for. */
  private routeKind: AppRoute["kind"] | undefined;
  private readonly themeNodes: HTMLElement[] = [];
  /** Browser history moved: reopen the chat package on the addressed session. */
  private readonly onPopState = (): void => {
    void this.applyRoute();
  };

  /**
   * @param container - Application mount point (`#root`).
   */
  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Install the pre-paint theme rows. The token sheet itself is imported by
   * the host stylesheet; these rows only set the palette attributes so the
   * first React paint already sees the resolved theme.
   */
  private installThemeBoot(): void {
    const doc = this.container.ownerDocument;
    for (const row of bootThemeInjections(DEFAULT_PREFERENCE)) {
      if (row.kind === "style") {
        const style = doc.createElement("style");
        style.dataset.themeBoot = "";
        style.textContent = row.text;
        doc.head.append(style);
        this.themeNodes.push(style);
        continue;
      }
      const script = doc.createElement("script");
      script.dataset.themeBoot = "";
      script.textContent = row.text;
      (doc.body ?? doc.head).append(script);
      this.themeNodes.push(script);
    }
  }

  /** Bind every package-owned Gateway seam to one resolved base URL. */
  private configureGateway(): RpcClient {
    const url = resolveGatewayUrl();
    const rpc = new RpcClient({ url });
    this.rpc = rpc;

    const useSessionJournal = createSessionJournalHook({ rpc: () => rpc });
    configureClientSession({ rpc: () => rpc, useSessionJournal });
    sidebarPlugin.configureGatewayBaseUrl(url);
    modalsPlugin.configureModalsGateway({ url });
    connectorsPlugin.configureConnectorsClient({ baseUrl: url });
    detailBarPlugin.configureDetailBarGateway(url);
    return rpc;
  }

  /**
   * Create the root Context, compose the route's package tree, and hand the
   * mount point to `ctx.uiRenderer`.
   * @param onFailure - Optional carrier-owned fatal presentation; keeps the
   * default failure node out of the page.
   * @returns Resolves after application mount or failure reporting.
   */
  async run(onFailure?: (reason: unknown) => void): Promise<void> {
    try {
      this.installThemeBoot();

      const route = resolveRoute(window.location.pathname);
      this.routeKind = route.kind;
      const ctx = new Context();
      this.ctx = ctx;

      // The renderer provides `ctx.slots` (and `ctx.uiRenderer`) for every
      // package below.
      await ctx.plugin(uiRendererPlugin);

      if (route.kind === "landing") {
        // Landing owns the built-in `root` slot itself; nothing else is
        // composed on this route.
        await ctx.plugin(landingPlugin);
      } else {
        const rpc = this.configureGateway();
        const initialUser = await fetchInitialUser();
        const mainKey =
          route.kind === "profile"
            ? "profile"
            : route.kind === "report"
              ? "report"
              : "conversation";

        // Layout declares `sidebar`, keyed `main`, `rightbar`, and
        // `shell.overlay`; every package below waits for its declaration via
        // `ctx.slots.inject`, so the remaining order is cosmetic.
        await ctx.plugin(layoutPlugin, {
          initialSessions: [],
          initialUser,
          mainKey,
        });

        await ctx.plugin(sidebarPlugin, {
          // Session links switch in place: the shell, sidebar, and right panel
          // stay mounted, and only the chat package is reopened for the new
          // Session. Any other link is a document navigation.
          onNavigate: (href: string) => this.navigate(href),
          onOpenSettings: () => {
            useModalStore.getState().openSettingsModal();
          },
        });

        if (route.kind === "report") {
          // The report page reads its session's `detailBar` projection
          // through the shared session hook; no chat package and no detail
          // bar are composed. History changes are handled by the report
          // package itself, but the shell keeps its listener so a same-document
          // move can rebuild the document (see `applyRoute`).
          window.addEventListener("popstate", this.onPopState);
          await ctx.plugin(reportPlugin);
        } else if (route.kind === "conversation") {
          // A bare `/c` opens the caller's default session; the seeded slugs
          // make the choice stable, and the URL is rewritten so a refresh
          // lands on the same conversation.
          let sessionId = route.sessionId;
          if (sessionId === undefined) {
            sessionId = await resolveDefaultSessionId(rpc);
            window.history.replaceState(
              null,
              "",
              `/c/${encodeURIComponent(sessionId)}`,
            );
          }

          // The chat package renders Generative UI and message media inline
          // through its own dependencies; the sibling slot plugins stay
          // inactive until the chat owner declares their `session-maybe`
          // seats (see the chat README).
          this.activeSessionId = sessionId;
          this.chatFiber = ctx.plugin(chatPlugin, {
            sessionId,
          });
          await this.chatFiber;
          window.addEventListener("popstate", this.onPopState);
        } else {
          await ctx.plugin(profilePlugin);
        }

        // The detail bar, modals, and connectors belong to the chat and
        // profile routes; a report document keeps only the layout, sidebar,
        // renderer, and report page.
        if (route.kind !== "report") {
          await ctx.plugin(detailBarPlugin);
          await ctx.plugin(modalsPlugin);
          await ctx.plugin(connectorsPlugin);
        }
      }

      await mountClient(ctx, this.container);
    } catch (reason) {
      console.error(reason);
      if (onFailure !== undefined) onFailure(reason);
      else renderFailure(this.container, reason);
    }
  }

  /**
   * Follow one sidebar link. Session links update history and let
   * {@link applyRoute} reopen the chat package in place; everything else is a
   * document navigation.
   * @param href - link target.
   */
  private navigate(href: string): void {
    // A report document composes no chat fiber, so an in-place session switch
    // has nothing to reopen. Let the browser load the target document, which
    // then composes its own route tree.
    if (this.routeKind === "report") {
      window.location.assign(href);
      return;
    }
    const sessionId = sessionIdFromHref(href);
    if (sessionId === undefined) {
      window.location.assign(href);
      return;
    }
    if (sessionId === this.activeSessionId) return;
    window.history.pushState(
      null,
      "",
      `/c/${encodeURIComponent(sessionId)}`,
    );
    // `useRoutePath` and the detail bar listen for `popstate`; pushState
    // alone never notifies them.
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  /** Apply the session the current pathname addresses, if any. */
  private async applyRoute(): Promise<void> {
    // A report document cannot swap its `main` owner or boot chat in place;
    // reload the document so the new route composes the packages it needs.
    if (this.routeKind === "report") {
      window.location.assign(window.location.href);
      return;
    }
    const route = resolveRoute(window.location.pathname);
    if (route.kind !== "conversation" || route.sessionId === undefined) return;
    if (route.sessionId === this.activeSessionId) return;
    await this.openSession(route.sessionId);
  }

  /**
   * Reopen the chat package on another Session without reloading the page.
   * @param sessionId - the Session the URL now addresses.
   */
  private async openSession(sessionId: string): Promise<void> {
    const ctx = this.ctx;
    if (ctx === undefined) return;
    // Defensive: `openSession` assumes the chat tree exists. From a report
    // document the target must be a fresh page load instead.
    if (this.routeKind === "report") {
      window.location.assign(`/c/${encodeURIComponent(sessionId)}`);
      return;
    }
    this.activeSessionId = sessionId;
    const previous = this.chatFiber;
    this.chatFiber = undefined;
    await previous?.dispose();
    this.chatFiber = ctx.plugin(chatPlugin, { sessionId });
    await this.chatFiber;
  }

  /** Dispose the client plugin tree, its RPC client, and the theme rows. */
  async dispose(): Promise<void> {
    window.removeEventListener("popstate", this.onPopState);
    this.chatFiber = undefined;
    this.activeSessionId = undefined;
    this.routeKind = undefined;
    const ctx = this.ctx;
    this.ctx = undefined;
    if (ctx !== undefined) await ctx.fiber.dispose();
    this.rpc?.close();
    this.rpc = undefined;
    for (const node of this.themeNodes.splice(0)) node.remove();
  }
}
