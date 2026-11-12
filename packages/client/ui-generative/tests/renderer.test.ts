import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerativeUIRenderer } from "../src/client/renderer";

const formSpec = {
  root: "stack",
  elements: {
    stack: { type: "Stack", props: {}, children: ["brand", "submit"] },
    brand: {
      type: "Radio",
      props: { name: "research_brand", options: ["GrowEasy", "Section Store"] },
      children: [],
    },
    submit: { type: "SubmitBar", props: { label: "Start" }, children: [] },
  },
};

test("an unanswered form in the newest turn keeps its submit bar", () => {
  const html = renderToStaticMarkup(
    createElement(GenerativeUIRenderer, { spec: formSpec, scopeId: "scope" }),
  );
  assert.match(html, /Start/);
});

test("a past turn hides the submit bar even when never answered", () => {
  const html = renderToStaticMarkup(
    createElement(GenerativeUIRenderer, {
      spec: formSpec,
      scopeId: "scope",
      isLocked: true,
    }),
  );
  assert.doesNotMatch(html, /Start/);
});

test("a past turn disables its controls", () => {
  const html = renderToStaticMarkup(
    createElement(GenerativeUIRenderer, {
      spec: formSpec,
      scopeId: "scope",
      isLocked: true,
    }),
  );
  assert.match(html, /cursor-not-allowed/);
});

test("an absent spec renders nothing", () => {
  const html = renderToStaticMarkup(
    createElement(GenerativeUIRenderer, { spec: null, scopeId: "scope" }),
  );
  assert.equal(html, "");
});

test("an empty spec renders nothing", () => {
  const html = renderToStaticMarkup(
    createElement(GenerativeUIRenderer, {
      spec: { root: "", elements: {} },
      scopeId: "scope",
    }),
  );
  assert.equal(html, "");
});
