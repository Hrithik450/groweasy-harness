/**
 * Render test for the sidebar's dependency-free avatar surface.
 *
 * The full occupant needs the ui-session stores and the RPC singleton; the
 * avatar is the one renderable unit that proves the moved SVG markup and
 * class contract without mounting the application.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionView } from "@openai-harness/session";
import { getRoleAvatar, SidebarBotAvatar } from "../src/client/avatar";

/** The avatar only reads `id` and `title`; the rest of the view is unused. */
function session(id: string, title: string): SessionView {
  return { id, title } as SessionView;
}

test("sidebar avatar renders the original SVG shell and motion classes", () => {
  const markup = renderToStaticMarkup(
    createElement(SidebarBotAvatar, {
      session: session("session-1", "Strategy agent"),
      index: 0,
    }),
  );

  assert.match(markup, /viewBox="-15 -15 259 259"/);
  assert.match(markup, /animate-sidebar-inquisitive/);
  assert.match(markup, /animate-sidebar-blink/);
  assert.match(markup, /drop-shadow\(0 3px 6px/);
});

test("role avatar maps agent titles to the same bot files", () => {
  assert.equal(
    getRoleAvatar(session("a", "Strategy")),
    "/bot/sales-outbound-animated.svg",
  );
  assert.equal(
    getRoleAvatar(session("b", "Account Manager")),
    "/bot/account-manager-animated.svg",
  );
  assert.equal(
    getRoleAvatar(session("c", "Creative Creator")),
    "/bot/chief-animated.svg",
  );
});
