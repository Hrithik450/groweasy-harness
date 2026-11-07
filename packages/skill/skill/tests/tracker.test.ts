import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSessionSkills,
  evaluatePrerequisite,
  hasSkillBeenFetched,
  recordSkillFetched,
  resolveSessionKey,
  sessionSkillsMap,
} from "../src/index";

test("resolveSessionKey composes user and session identity", () => {
  assert.equal(resolveSessionKey(undefined), "");
  assert.equal(resolveSessionKey("  raw-key  "), "raw-key");
  assert.equal(
    resolveSessionKey({ userId: "user-1", sessionId: "session-1" }),
    "user-1:session-1",
  );
  assert.equal(resolveSessionKey({ sessionId: "session-1" }), "session-1");
  assert.equal(resolveSessionKey({ userId: "user-1" }), "user-1");
  assert.equal(resolveSessionKey({ userId: "  ", sessionId: " " }), "");
});

test("fetch tracking normalizes names and isolates user/session scopes", () => {
  const context = { userId: "tracker-user", sessionId: "tracker-session" };
  recordSkillFetched(context, " Some_Skill ");
  assert.equal(hasSkillBeenFetched(context, "some-skill"), true);
  assert.equal(hasSkillBeenFetched(context, "Some_Skill"), true);
  assert.equal(
    hasSkillBeenFetched({ userId: "tracker-user", sessionId: "other" }, "some-skill"),
    false,
  );

  clearSessionSkills(context);
  assert.equal(hasSkillBeenFetched(context, "some-skill"), false);
  assert.equal(sessionSkillsMap.has("tracker-user:tracker-session"), false);
});

test("evaluatePrerequisite resolves single, AND, and OR requirements", () => {
  const context = { userId: "prereq-user", sessionId: "prereq-session" };
  assert.deepEqual(evaluatePrerequisite(context, "", "tool"), { satisfied: true });

  const single = evaluatePrerequisite(context, "alpha-skill", "tool");
  assert.equal(single.satisfied, false);
  assert.match(single.error ?? "", /alpha-skill/);
  assert.match(single.instruction ?? "", /fetchSkill/);

  recordSkillFetched(context, "alpha-skill");
  assert.equal(
    evaluatePrerequisite(context, "alpha-skill", "tool").satisfied,
    true,
  );

  const and = evaluatePrerequisite(context, "alpha-skill and beta-skill", "tool");
  assert.equal(and.satisfied, false);
  assert.match(and.error ?? "", /beta-skill/);

  recordSkillFetched(context, "beta-skill");
  assert.equal(
    evaluatePrerequisite(context, "alpha-skill and beta-skill", "tool").satisfied,
    true,
  );

  const or = evaluatePrerequisite(context, "missing-a or alpha-skill", "tool");
  assert.equal(or.satisfied, true);

  const array = evaluatePrerequisite(context, ["missing-a", "missing-b"], "tool");
  assert.equal(array.satisfied, false);
  assert.match(array.error ?? "", /missing-a/);
  assert.match(array.error ?? "", /missing-b/);

  const either = evaluatePrerequisite(
    { userId: "prereq-user", sessionId: "prereq-either" },
    "either alpha-skill or beta-skill",
    "tool",
  );
  assert.equal(either.satisfied, false);
  assert.match(either.error ?? "", /alpha-skill.*or.*beta-skill/);

  clearSessionSkills(context);
});
