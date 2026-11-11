import assert from "node:assert/strict";
import test from "node:test";

import { parseReportPath } from "../src/client/report-page";

test("parses a report path", () => {
  assert.deepEqual(
    parseReportPath("/c/session-1/reports/report-2026-11-20-1700000000000"),
    {
      sessionId: "session-1",
      reportId: "report-2026-11-20-1700000000000",
    },
  );
});

test("decodes percent-encoded segments", () => {
  assert.deepEqual(
    parseReportPath("/c/session%2Fone/reports/report%20one"),
    {
      sessionId: "session/one",
      reportId: "report one",
    },
  );
});

test("ignores one or more trailing slashes", () => {
  assert.deepEqual(
    parseReportPath("/c/session-1/reports/report-1/"),
    { sessionId: "session-1", reportId: "report-1" },
  );
  assert.deepEqual(
    parseReportPath("/c/session-1/reports/report-1///"),
    { sessionId: "session-1", reportId: "report-1" },
  );
});

test("rejects a conversation path without a report segment", () => {
  assert.equal(parseReportPath("/c/session-1"), null);
  assert.equal(parseReportPath("/c/session-1/reports"), null);
  assert.equal(parseReportPath("/c/session-1/reports/"), null);
  assert.equal(parseReportPath("/"), null);
});

test("rejects junk paths and keeps malformed escapes verbatim", () => {
  assert.equal(parseReportPath("/profile"), null);
  assert.equal(parseReportPath("/c//reports/report-1"), null);
  assert.equal(parseReportPath("/c/s1/reports/r1/extra"), null);
  assert.deepEqual(
    parseReportPath("/c/sess%ZZion/reports/report-1"),
    { sessionId: "sess%ZZion", reportId: "report-1" },
  );
});
