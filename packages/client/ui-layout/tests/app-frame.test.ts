/**
 * Render smoke test for the slotted app frame. Uses static server rendering:
 * the frame is hook-free, so no DOM harness is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppFrame } from "../src/client/app-frame";

const Frame = AppFrame as unknown as (
  props: Record<string, unknown>,
) => ReactNode;

function renderSlot(
  key: string,
  _owner: object,
  opts?: { entryKey?: string },
): ReactNode {
  return createElement("span", {
    "data-test": key,
    "data-entry-key": opts?.entryKey,
  });
}

test("renders the app shell markup with every declared seat", () => {
  const html = renderToStaticMarkup(
    createElement(Frame, {
      renderSlot,
      initialSessions: [],
      initialUser: null,
      mainKey: "conversation",
    }),
  );

  assert.match(
    html,
    /^<main class="h-screen w-screen flex overflow-hidden bg-background">/,
  );
  assert.match(
    html,
    /<div class="flex-1 flex h-full min-w-0 bg-background overflow-hidden">/,
  );
  assert.equal((html.match(/data-test=/g) ?? []).length, 4);
  for (const seat of ["sidebar", "main", "rightbar", "shell.overlay"]) {
    assert.match(html, new RegExp(`data-test="${seat.replace(".", "\\.")}"`));
  }
  assert.match(html, /data-entry-key="conversation"/);
});

test("renders the selected keyed main entry", () => {
  const html = renderToStaticMarkup(
    createElement(Frame, {
      renderSlot,
      initialSessions: [],
      initialUser: null,
      mainKey: "settings",
    }),
  );

  assert.match(html, /data-entry-key="settings"/);
});
