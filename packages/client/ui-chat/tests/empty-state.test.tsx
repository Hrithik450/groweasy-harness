/**
 * Render smoke test for the empty-conversation seat. Uses static server
 * rendering: the seat is props-only (no stores, no DOM), so no browser
 * download or DOM harness is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatEmptyState } from "../src/client/ChatEmptyState";

test("renders the suggestion grid and bound avatar seat", () => {
  const html = renderToStaticMarkup(
    createElement(ChatEmptyState, {
      sessionId: "session-1",
      title: "Ad Strategist",
      onSelectPrompt: () => {},
      renderAvatar: ({ size }) =>
        createElement("span", { "data-avatar": String(size) }),
    }),
  );

  assert.match(html, /How can Ad Strategist help you today\?/);
  assert.match(html, /data-avatar="56"/);
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  assert.match(
    html,
    /grid grid-cols-1 sm:grid-cols-2 gap-3 w-full/,
  );
  assert.match(html, /Competitor research &amp; strategy/);
});
