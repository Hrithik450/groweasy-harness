import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalizeBlockTypes,
  validateAndNormalizeUI,
} from "../src/validator";

test("lowercase component types are canonicalized to the catalog spelling", () => {
  const spec = validateAndNormalizeUI({
    type: "card",
    props: { title: "Your advertising workspace" },
    children: [{ type: "text", props: { text: "What first?" } }],
  });

  assert.ok(spec);
  const types = Object.values(spec.elements).map((element) => element.type);
  assert.deepEqual(types.sort(), ["Card", "Text"]);
  assert.equal(spec.elements[spec.root]!.type, "Card");
});

test("an unknown component type is rejected instead of rendering blank", () => {
  assert.throws(
    () => validateAndNormalizeUI({ type: "notAComponent", props: {} }),
    /Unknown component type "notAComponent"/,
  );
});

test("a flat spec is canonicalized in place", () => {
  const spec = validateAndNormalizeUI({
    root: "el-0",
    elements: {
      "el-0": { type: "card", props: { title: "Title" }, children: [] },
    },
  });

  assert.ok(spec);
  assert.equal(spec.elements["el-0"]!.type, "Card");
});

test("optional props may be omitted, including className and layout props", () => {
  const spec = validateAndNormalizeUI({
    type: "Stack",
    props: { direction: "column" },
    children: [
      { type: "Text", props: { text: "Hello" } },
      {
        type: "Slider",
        props: { label: "Budget", min: 0, max: 100, step: 5 },
      },
    ],
  });

  assert.ok(spec);
  const types = Object.values(spec.elements).map((element) => element.type);
  assert.deepEqual(types.sort(), ["Slider", "Stack", "Text"]);
  const stack = Object.values(spec.elements).find(
    (element) => element.type === "Stack",
  );
  assert.equal(stack?.props.className, undefined);
});

test("persisted specs canonicalize at render time without throwing", () => {
  const persisted = {
    root: "el-0",
    elements: {
      "el-0": { type: "card", props: { title: "T" }, children: ["el-1"] },
      "el-1": { type: "mystery", props: {}, children: [] },
    },
  };

  const rendered = canonicalizeBlockTypes(persisted);

  assert.equal(rendered.elements["el-0"]!.type, "Card");
  assert.equal(rendered.elements["el-1"]!.type, "mystery");
  assert.equal(persisted.elements["el-0"]!.type, "card", "input untouched");
});
