/**
 * Default Agent driver over queued turns and step-boundary input.
 *
 * Cancellation clears or preserves the durable inbox, aborts the active turn,
 * and closes that turn with the copied cancel cause. Work kept with
 * `keepInbox` parks until a later wake latches behind the aborting activity and
 * is replayed once the driver reaches quiescence.
 *
 * @module @openai-harness/agent-loop
 */

import type { UserMessage } from "@openai-harness/llm";
import type { SessionId, TurnEndReason } from "@openai-harness/session";
import type {
  Agent,
  AgentCancelCause,
  AgentOptions,
  AgentSession,
  AgentStatus,
  AssistantStreamFrame,
  CancelOptions,
  InboxTarget,
} from "./agent-types";
import { debugLog } from "./debug";
import { ReactLoopInbox } from "./inbox";
import { runStep } from "./driver";

export interface PreStepInput<S extends AgentSession = AgentSession> {
  claimed: readonly UserMessage[];
  turn: number;
  step: number;
  /** Durable event log the pre-step may inspect before injecting context. */
  session: S;
  signal?: AbortSignal;
}

export interface PreStepResult {
  messages: UserMessage[];
}

export type PreStepHook<S extends AgentSession = AgentSession> = (
  input: PreStepInput<S>,
) => Promise<PreStepResult> | PreStepResult;

export interface ReactLoopAgentConfig<S extends AgentSession = AgentSession> {
  instructions?: string;
  tools?: Array<Record<string, unknown> | any>;
  onStreamFrame?: (frame: AssistantStreamFrame) => void;
  preStep?: PreStepHook<S>;
}

/**
 * Copy only the fields `turn/end` records from the caller-owned abort reason.
 * The live reason stays the caller's object, and transports may assign
 * properties the durable log must not retain.
 */
function describeCancelCause(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "kind" in cause) {
    const { kind, reason } = cause as { kind: unknown; reason?: unknown };
    if (kind === "hook") {
      return reason === undefined ? "hook" : `hook: ${String(reason)}`;
    }
    if (typeof kind === "string") return kind;
  }
  return cause === undefined ? "Aborted" : String(cause);
}

/** The turn ending a loop-owned abort records. */
function abortedTurnEnd(signal: AbortSignal | undefined): TurnEndReason {
  return { kind: "aborted", reason: describeCancelCause(signal?.reason) };
}

/** Whether an aborted activity is being torn down and must not latch a wake. */
function isDisposed(signal: AbortSignal | undefined): boolean {
  const reason = signal?.reason as { kind?: unknown } | undefined;
  return reason?.kind === "disposed";
}

export class ReactLoopAgent<
  S extends AgentSession = AgentSession,
> implements Agent<S> {
  readonly id: SessionId;
  readonly session: S;
  readonly inbox: ReactLoopInbox;
  readonly options: AgentOptions;

  private _status: AgentStatus = "idle";
  private _lastTurn = 0;
  private _abortController: AbortController | null = null;
  private _activityPromise: Promise<void> = Promise.resolve();
  private _activityResolve: (() => void) | null = null;
  private _wakeRequested = false;
  private readonly _config: ReactLoopAgentConfig<S>;

  constructor(
    session: S,
    options: AgentOptions = {},
    config: ReactLoopAgentConfig<S> = {},
  ) {
    this.session = session;
    this.id = session.id;
    this.options = options;
    this._config = config;
    this.inbox = new ReactLoopInbox(session);

    for (const event of session.events) {
      if (event.type === "turn/start") {
        this._lastTurn = Math.max(this._lastTurn, event.data.turn);
      }
    }
  }

  get status(): AgentStatus {
    return this._status;
  }

  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
    // Captured before insertion so a reentrant cancel cannot reclassify it.
    const wakingAfterAbort =
      wakeup &&
      this._status === "running" &&
      (this._abortController?.signal.aborted ?? false);

    this.inbox.splice(target, Infinity, 0, [message]);
    if (wakeup) {
      this.wakeDriver(wakingAfterAbort);
    }
  }

  followup(message: UserMessage): void {
    this.send(message, "next-turn", true);
  }

  steer(message: UserMessage): void {
    this.send(message, "next-step", true);
  }

  inject(message: UserMessage): void {
    this.send(message, "next-step", false);
  }

  cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
    debugLog(`cancel requested for session ${this.id}`, {
      cause,
      running: this._status === "running",
      keepInbox: options.keepInbox === true,
    });
    if (!options.keepInbox) {
      this.inbox.clear();
      if (this._status === "running") {
        this._wakeRequested = false;
      }
    }
    // An idle agent has no active turn to abort; a later prompt runs normally.
    if (this._status === "running" && this._abortController) {
      this._abortController.abort(cause);
    }
  }

  async whenIdle(): Promise<void> {
    let activity: Promise<void>;
    do {
      await (activity = this._activityPromise);
    } while (activity !== this._activityPromise);
  }

  private setStatus(status: AgentStatus): void {
    this._status = status;
  }

  private wakeDriver(wakeAfterAbort = false): void {
    if (this._status === "running") {
      // Maintenance and aborted drivers cannot deliver the wake: latch it for
      // replay at convergence. Disposal never latches.
      if (wakeAfterAbort && !isDisposed(this._abortController?.signal)) {
        this._wakeRequested = true;
      }
      return;
    }

    this.setStatus("running");
    this._abortController = new AbortController();
    this._wakeRequested = false;

    this._activityPromise = new Promise<void>((resolve) => {
      this._activityResolve = resolve;
    });

    void this.kick();
  }

  private async kick(): Promise<void> {
    try {
      while (await this.turn()) {}
    } catch (err) {
      // Cancellation is a contained outcome, not a driver failure.
      if (!(this._abortController?.signal.aborted ?? false)) {
        console.error(
          `[ReactLoopAgent ${this.id}] Turn execution failed:`,
          err,
        );
      }
    } finally {
      this.setStatus("idle");
      this._abortController = null;

      const wake = this._wakeRequested;
      this._wakeRequested = false;
      const resolveActivity = this._activityResolve;
      this._activityResolve = null;

      // Start replay before resolving the old activity so `whenIdle()` follows
      // the fresh driver instead of returning early.
      if (wake && this.inbox.hasPending) {
        this.wakeDriver();
      }

      resolveActivity?.();
    }
  }

  private async turn(): Promise<boolean> {
    const signal = this._abortController?.signal;
    if (!signal || signal.aborted) return false;

    const turn = this._lastTurn + 1;
    this._lastTurn = turn;

    this.session.append("turn/start", { turn });

    let step = 0;
    let target: InboxTarget = "next-turn";
    let turnEndReason: TurnEndReason | null = null;

    try {
      while (true) {
        if (signal.aborted) {
          turnEndReason = abortedTurnEnd(signal);
          break;
        }

        const claimed = this.inbox.claim(target, turn);

        if (turnEndReason && claimed.length === 0) {
          break;
        }

        if (step === 0 && claimed.length === 0) {
          turnEndReason = { kind: "completed" };
          break;
        }

        if (step > 0 && claimed.length === 0 && !turnEndReason) {
          turnEndReason = { kind: "completed" };
          break;
        }

        step++;

        this.session.append("step/start", { turn, step });

        for (const msg of claimed) {
          this.session.append("user/message", msg);
        }

        const preStepDecision = this._config.preStep
          ? await this._config.preStep({
              claimed,
              turn,
              step,
              session: this.session,
              signal,
            })
          : { messages: [...claimed] };

        const stepMessages = preStepDecision.messages;

        const claimedIds = new Set(claimed.map((message) => message.id));
        for (const message of stepMessages) {
          if (claimedIds.has(message.id)) continue;
          this.session.append("user/message", message);
        }

        try {
          const outcome = await runStep({
            turn,
            step,
            instructions: this._config.instructions,
            tools: this._config.tools,
            signal,
            agent: this,
            onStreamFrame: this._config.onStreamFrame,
            queueNextStep: (context: UserMessage) => {
              this.inbox.splice("next-step", this.inbox.nextStep.length, 0, [
                context,
              ]);
            },
          });

          if (outcome.kind === "completed" && !signal.aborted) {
            turnEndReason = { kind: "completed" };
          } else if (
            outcome.kind === "requires_action" &&
            outcome.concludesTurn &&
            !signal.aborted
          ) {
            turnEndReason = { kind: "completed" };
          }
        } finally {
          this.session.append("step/end", { turn, step });
        }

        // A concluded turn stops after the step that concluded it, even when
        // its tool results queued next-step messages.
        if (turnEndReason) {
          break;
        }

        target = "next-step";
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        turnEndReason = abortedTurnEnd(signal);
        throw err;
      }
      turnEndReason = {
        kind: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      throw err;
    } finally {
      // Every exit assigns an ending; an abort always wins over a completion
      // that raced the cancel and still closes the turn.
      this.session.append("turn/end", {
        turn,
        reason: signal.aborted
          ? abortedTurnEnd(signal)
          : (turnEndReason ?? { kind: "completed" }),
      });
    }

    // A cancelled turn parks its kept inbox until a later wake latches.
    if (signal.aborted) return false;

    if (!this.inbox.hasPending) return false;

    // A fresh controller lets the next turn claim pending work normally.
    this._abortController = new AbortController();
    this._wakeRequested = false;
    return true;
  }
}
