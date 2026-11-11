/**
 * Render smoke test for the avatar seat. The avatar's gaze, blink, and dance
 * motion live in effects and window listeners, which server rendering skips, so
 * this asserts the static SVG shell, sizing, and ground shadow instead.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BotDollAvatar } from "../src/client/bot/bot.doll.avatar";

test("renders the bot head and ground shadow at the requested size", () => {
  const html = renderToStaticMarkup(
    createElement(BotDollAvatar, {
      size: 56,
      withShadow: true,
      interactive: false,
    }),
  );

  assert.match(html, /<svg[^>]*viewBox="-15 -15 259 259"/);
  assert.match(html, /width:56px;height:56px/);
  assert.equal((html.match(/<linearGradient/g) ?? []).length, 2);
  assert.match(html, /drop-shadow\(0 3px 6px/);
  assert.match(html, /width:29px;height:6px/);
});
