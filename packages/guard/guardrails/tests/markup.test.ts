import test from "node:test";
import assert from "node:assert/strict";
import { unsafeMarkup } from "../src/checks/markup";
import { runGuardrails } from "../src/pipeline";

test("unsafeMarkup removes a multi-line script block whole", () => {
  const input = [
    "before",
    '<script type="text/javascript">',
    'alert("x");',
    "document.body.innerHTML = 'gone';",
    "</script>",
    "after",
  ].join("\n");
  assert.equal(
    runGuardrails(input, [unsafeMarkup]).text,
    "before\n[removed markup]\nafter",
  );
});

test("unsafeMarkup removes executable and loading tags", () => {
  assert.equal(
    runGuardrails('<iframe src="https://evil.example/x"></iframe>', [
      unsafeMarkup,
    ]).text,
    "[removed markup][removed markup]",
  );
  assert.equal(
    runGuardrails('<form action="https://evil.example">', [unsafeMarkup]).text,
    "[removed markup]",
  );
  assert.equal(
    runGuardrails("<style>body { color: red }</style>", [unsafeMarkup]).text,
    "[removed markup]",
  );
});

test("unsafeMarkup neutralizes dangerous URL schemes", () => {
  assert.equal(
    runGuardrails("[click](javascript:alert(1))", [unsafeMarkup]).text,
    "[click]([removed]alert(1))",
  );
  assert.equal(
    runGuardrails("[x](data:text/html;base64,AAAA)", [unsafeMarkup]).text,
    "[x]([removed];base64,AAAA)",
  );
  assert.equal(
    runGuardrails("[x](vbscript:msgbox(1))", [unsafeMarkup]).text,
    "[x]([removed]msgbox(1))",
  );
});

test("unsafeMarkup tolerates whitespace inside a scheme", () => {
  assert.equal(
    runGuardrails("[x](java\nscript:alert(1))", [unsafeMarkup]).text,
    "[x]([removed]alert(1))",
  );
  assert.equal(
    runGuardrails("[x](d a t a : t e x t / h t m l,foo)", [unsafeMarkup]).text,
    "[x]([removed],foo)",
  );
});

test("unsafeMarkup leaves https links and ordinary prose alone", () => {
  const copy = [
    "See [docs](https://example.com/a?b=c) for details.",
    "Write a script for the iframe campaign and review the <div> draft.",
    "const script = 'iframe';",
  ].join("\n");
  assert.equal(runGuardrails(copy, [unsafeMarkup]).text, copy);
});

test("unsafeMarkup strips ANSI escapes", () => {
  assert.equal(
    runGuardrails("\x1b[31mred\x1b[0m and \x1b[1;32mgreen\x1b[0m", [
      unsafeMarkup,
    ]).text,
    "red and green",
  );
});
