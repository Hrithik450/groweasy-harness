import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MessageId,
  ToolCallId,
  ProviderRequestId,
  LlmAttemptId,
  ReasoningEffortId,
} from "../src/brand";

test("LLM identity brands wrap values correctly", () => {
  assert.equal(MessageId("msg-123"), "msg-123");
  assert.equal(ToolCallId("call-456"), "call-456");
  assert.equal(ProviderRequestId("req-789"), "req-789");
  assert.equal(LlmAttemptId("att-001"), "att-001");
  assert.equal(ReasoningEffortId("high"), "high");
});
