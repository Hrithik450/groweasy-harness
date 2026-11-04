# @openai-harness/guardrails

Deterministic guardrails for a private, operator-run agent harness. Pure
functions over strings and parsed arguments — no model calls, no network, no
extra latency on the hot path.

## Why these surfaces

OWASP Top 10 for LLM Applications (2025), Azure Prompt Shields, and NeMo
Guardrails agree that model safety is enforced at fixed *intervention points*,
not by one content filter. This package implements the same four points:

| Surface | Bound risks (OWASP) | Entry point |
|---|---|---|
| prompt | LLM01 injection, LLM10 unbounded consumption | `inspectPromptBlocks` |
| tool call | LLM06 excessive agency, SSRF, denial of wallet | `inspectToolCall` |
| tool result | LLM01 indirect injection, LLM02 disclosure | `inspectToolResult` |
| answer | LLM02 disclosure, LLM07 prompt leakage, LLM05 output handling | `inspectAnswer` |

A deployment binds exactly one `Guardrails` instance (`apps/gateway/src/guardrails.ts`).
New controls go into the policy, never into individual tools or components.

## Checks

| Check | Catches | Replaces with |
|---|---|---|
| `prompt-injection` | instruction overrides, role/persona resets, "reveal your prompt", exfiltration verbs, `<tool_call>` / `[INST]` / `<<SYS>>` markers | `[removed: embedded instruction]` |
| `system-prompt-leak` | the per-process canary embedded in the system prompt | whole answer withheld |
| `secret-keys` | PEM blocks, `sk-…`, AWS key ids, bearer tokens, `api_key = …`, `*_KEY=…` | `[redacted …]` |
| `pii` | SSN, Luhn-valid cards, mod-97-valid IBANs (optional: email, phone) | `[redacted pii]` |
| `identity` | "I'm ChatGPT", "as an AI language model", "powered by OpenAI" | `[identity withheld]` |
| `markup` | `<script>`/`<iframe>`/handlers, `javascript:` / `data:text/html`, ANSI escapes | `[removed markup]` |
| `internal-paths` (opt-in) | `/Users/…/openai-harness/…` | `[redacted path]` |
| `egress` | loopback, private, link-local, CGNAT, IPv6-local URLs; `file:` / `gopher:` / `data:text/html` | call denied |
| `argument-size` | serialized tool arguments above the cap | call denied |
| `rate-limit` | per-session tool and generation quotas (fixed window) | call denied |
| `tool-policy` | tools named in `denyTools` | call denied |

Spotlighting wraps untrusted tool output in
`<untrusted_tool_output source="…">` with a safety line, and the system prompt
(`packages/core/system-prompt/src/prompt.ts`) tells the model to treat that
content as data.

## What each surface does

- **prompt** — applies one shared character budget across all text blocks,
  truncates the overflow, and *detects* injection without rewriting it: the
  operator typed those words, and silently changing them would make the agent
  lie about what it was asked.
- **tool call** — deny list, argument size, URL egress policy, then per-session
  quotas. A denial returns a model-readable reason instead of throwing.
- **tool result** — redacts secrets and the canary, removes embedded
  instructions, and spotlights results from external tools (web search,
  scraping, ad library, Meta Graph, Shopify) or any result that carried an
  injection attempt. Trusted workspace paths and skill text pass untouched.
- **answer** — a canary hit withholds the whole answer (once the instructions
  are dumped, redacting one token is cosmetic); everything else is redacted in
  place.

## Configuration

Defaults live in `DEFAULT_GUARDRAIL_OPTIONS` (`src/policy.ts`) and are safe for
a private agent. `apps/gateway/src/guardrails.ts` maps these env vars:

| Variable | Default |
|---|---|
| `GUARDRAILS_MAX_INPUT_CHARS` | `32000` |
| `GUARDRAILS_TOOL_CALLS_PER_MINUTE` | `120` |
| `GUARDRAILS_GENERATION_CALLS_PER_MINUTE` | `12` |
| `GUARDRAILS_DENY_TOOLS` | empty (comma-separated names) |
| `GUARDRAILS_PII` | `high` (`high` \| `all` \| `off`) |
| `GUARDRAILS_ALLOW_PRIVATE_HOSTS` | `0` |
| `GUARDRAILS_CANARY` | random `HARNESS-<uuid>` per process |

A random canary is deliberate: attacker-chosen text cannot guess it, so a
false block is impossible and a real prompt dump is unambiguous.

## What it deliberately does not do

Provider-layer controls are not duplicated here — they need a model call and
belong in the deployment, not the hot path:

- **Moderation / jailbreak classifiers** (Azure Prompt Shields, OpenAI
  moderation, NeMo dialog rails). Deterministic rules cannot judge intent;
  layer a hosted classifier in front of the gateway if the deployment needs it.
- **Hallucination and groundedness scoring** (LLM09). Mitigated instead by
  prompt rules: cite source URLs, label estimates as estimates.
- **Human approval for high-impact tool calls.** The `pre-execute` hook already
  supports `{ kind: "ask" }`; it becomes usable when the product has an
  approval surface. Use `GUARDRAILS_DENY_TOOLS` until then.

Known limits:

- The URL check runs before the request, so it cannot see an open redirect.
  Tools must use an HTTP client that re-validates each redirect hop.
- PII detection covers structured identifiers only. Free-text personal data is
  not reliably detectable without a model or an entity recognizer.
- Prompt-injection rules are heuristics. They catch the common override and
  exfiltration shapes, not every paraphrase; spotlighting is the structural
  defense underneath them.

## Usage

```ts
import { Guardrails } from "@openai-harness/guardrails";

const guardrails = new Guardrails({ maxInputChars: 16_000 });

const prompt = guardrails.inspectPromptBlocks(blocks);   // { blocks, findings, truncated }
const call = guardrails.inspectToolCall(name, args, sessionId); // allow | deny
const result = guardrails.inspectToolResult(name, blocks);      // { blocks, findings }
const answer = guardrails.inspectAnswer(text);                  // { text, findings, blocked }
```

Checks implement one interface and can be composed directly:

```ts
import { runGuardrails, secretKeys, identity } from "@openai-harness/guardrails";

const { text, findings } = runGuardrails(answer, [secretKeys, identity]);
```

Overlaps are resolved globally: when two checks claim intersecting spans, the
earliest one wins, so a broad rule (an env assignment) masks the narrow rule
nested inside it (the key itself).

## Design notes

- Patterns are module-level and stateless; `scan` resets `lastIndex` so callers
  can share a check safely.
- Identity rules are first-person only. "ChatGPT is a competitor" and
  "Google Ads" are ordinary marketing work and must pass untouched.
- `(?![\w-])` is used instead of `\b` so hyphenated compounds (`AI-powered`,
  `OpenAI-compatible`) are not read as claims about the system.
- `internal-paths` stays out of the default sets: a local path is not a secret
  from the operator, and rewriting one corrupts a skill's "Base directory"
  line or a file path the user asked to see.
