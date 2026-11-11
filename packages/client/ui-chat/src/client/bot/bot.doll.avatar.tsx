"use client";

/**
 * Animated bot head used by the empty state, transcript loader, and thinking
 * row.
 *
 * The application's markup and styling, unchanged. The Next `useParams` read is
 * gone: the conversation owner passes the active `sessionId` as a prop, and the
 * role avatar resolves from `@openai-harness/client-ui-session`.
 *
 * @module @openai-harness/client-ui-chat/client/bot/bot.doll.avatar
 */

import { useEffect, useId, useRef, useState } from "react";
import { useSessionStore } from "@openai-harness/client-ui-session";
import type { AvatarOwnerProps } from "../types";
import { getRoleAvatar } from "./role-avatar";

/** Default character shown before a session's role avatar resolves. */
const FALLBACK_AVATAR = "/bot/chief-animated.svg";

/** Props accepted by the avatar seat. */
export type BotDollAvatarProps = AvatarOwnerProps;

/**
 * Resolves brand / agent role colors for the Grok-style animated bot head.
 */
function resolveRoleColors(avatarUrl?: string): {
  headColor: string;
  headStroke: string;
  eyeColor: string;
} {
  if (!avatarUrl) {
    return { headColor: "var(--agent-green)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  const lower = avatarUrl.toLowerCase();
  if (lower.includes("sales") || lower.includes("strategist")) {
    return { headColor: "var(--agent-amber)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  if (lower.includes("account") || lower.includes("manager")) {
    return { headColor: "var(--agent-violet)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  if (lower.includes("chief") || lower.includes("creator")) {
    return { headColor: "var(--agent-green)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  if (lower.includes("talent")) {
    return { headColor: "var(--agent-blue)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  if (lower.includes("expense")) {
    return { headColor: "var(--agent-coral)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  if (lower.includes("inbox")) {
    return { headColor: "var(--agent-indigo)", headStroke: "none", eyeColor: "var(--foreground)" };
  }
  return {
    headColor: "var(--card)",
    headStroke:
      "color-mix(in srgb, var(--foreground) 8%, transparent)",
    eyeColor: "var(--foreground)",
  };
}

const BOT_HEAD_PATH =
  "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";

/**
 * Grok Bot with 3D eye gaze tracking, cursor angle alignment,
 * subtle spherical depth (no extreme zoom out), perfectly round capsule eyes,
 * idle U-shaped eyebrow dance routine, and solid non-bouncing stance.
 */
export function BotDollAvatar({
  size = 48,
  avatarUrl,
  className = "",
  withShadow = true,
  interactive = true,
  sessionId,
}: BotDollAvatarProps) {
  const { sessions } = useSessionStore();
  const currentSession =
    sessionId === undefined
      ? undefined
      : sessions.find((candidate) => candidate.id === sessionId);
  const resolvedAvatar =
    avatarUrl ||
    (currentSession !== undefined
      ? getRoleAvatar(currentSession)
      : FALLBACK_AVATAR);

  const colors = resolveRoleColors(resolvedAvatar);
  const gradientKey = useId().replace(/:/g, "");
  const shellFillId = `bot-shell-${gradientKey}`;
  const shellRimId = `bot-rim-${gradientKey}`;
  const shellTop = `color-mix(in srgb, white 16%, ${colors.headColor})`;
  const shellBottom = `color-mix(in srgb, black 18%, ${colors.headColor})`;
  const rimTop = `color-mix(in srgb, white 22%, ${colors.headColor})`;
  const rimBottom = `color-mix(in srgb, black 22%, ${colors.headColor})`;
  const containerRef = useRef<HTMLDivElement>(null);
  const eyeClusterRef = useRef<SVGGElement>(null);
  const leftEyeRef = useRef<SVGGElement>(null);
  const rightEyeRef = useRef<SVGGElement>(null);

  const [showUArch, setShowUArch] = useState(false);
  const showUArchRef = useRef(false);

  const stateRef = useRef({
    targetEyeX: 0,
    targetEyeY: 0,
    targetRotation: 0,
    targetLeftScaleX: 1,
    targetLeftScaleY: 1,
    targetRightScaleX: 1,
    targetRightScaleY: 1,
    currentEyeX: 0,
    currentEyeY: 0,
    currentRotation: 0,
    currentLeftScaleX: 1,
    currentLeftScaleY: 1,
    currentRightScaleX: 1,
    currentRightScaleY: 1,
    blinkScaleY: 1,
    isHovered: false,
    isDancing: false,
    danceStartTime: 0,
    lastMouseX: 0,
    lastMouseY: 0,
    lastTime: 0,
    lastActivityTime: 0,
    idleDanceTimer: 0,
  });

  useEffect(() => {
    stateRef.current.lastActivityTime = Date.now();
    stateRef.current.idleDanceTimer = Date.now() + 7500;

    if (!interactive) return;

    const handlePointerMove = (e: MouseEvent) => {
      const state = stateRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - (state.lastTime || now));
      const dxMove = e.clientX - (state.lastMouseX || e.clientX);
      const dyMove = e.clientY - (state.lastMouseY || e.clientY);
      const moveSpeed = Math.hypot(dxMove, dyMove) / dt;

      state.lastMouseX = e.clientX;
      state.lastMouseY = e.clientY;
      state.lastTime = now;
      state.lastActivityTime = Date.now();

      if (state.isDancing) {
        state.isDancing = false;
        state.idleDanceTimer = Date.now() + 8000;
      }

      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const botCenterX = rect.left + rect.width / 2;
      const botCenterY = rect.top + rect.height / 2;

      const deltaX = e.clientX - botCenterX;
      const deltaY = e.clientY - botCenterY;
      const dist = Math.hypot(deltaX, deltaY);
      const angle = Math.atan2(deltaY, deltaX);

      const maxTravel = 28;
      const normalizedDist = Math.min(dist / 320, 1);
      const easedTravel = Math.sin((normalizedDist * Math.PI) / 2) * maxTravel;

      state.targetEyeX = Math.cos(angle) * easedTravel;
      state.targetEyeY = Math.sin(angle) * easedTravel;

      const horizRatio =
        Math.sign(deltaX) *
        Math.pow(
          Math.abs(deltaX) / (Math.abs(deltaX) + Math.abs(deltaY) + 1e-4),
          0.85,
        );
      state.targetRotation = horizRatio * normalizedDist * 36;

      const dirX = state.targetEyeX / maxTravel;
      const speedBoost = Math.min(0.06, moveSpeed * 0.03);

      let lScaleX = 1;
      let lScaleY = 1;
      let rScaleX = 1;
      let rScaleY = 1;

      if (dirX > 0.05) {
        rScaleX = Math.min(1.12, 1 + dirX * 0.09 + speedBoost);
        rScaleY = Math.min(1.06, 1 + dirX * 0.05);
        lScaleX = Math.max(0.88, 1 - dirX * 0.12 - speedBoost);
        lScaleY = Math.max(0.92, 1 - dirX * 0.08);
      } else if (dirX < -0.05) {
        const absDir = Math.abs(dirX);
        lScaleX = Math.min(1.12, 1 + absDir * 0.09 + speedBoost);
        lScaleY = Math.min(1.06, 1 + absDir * 0.05);
        rScaleX = Math.max(0.88, 1 - absDir * 0.12 - speedBoost);
        rScaleY = Math.max(0.92, 1 - absDir * 0.08);
      }

      state.targetLeftScaleX = lScaleX;
      state.targetLeftScaleY = lScaleY;
      state.targetRightScaleX = rScaleX;
      state.targetRightScaleY = rScaleY;
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    let blinkTimeout: ReturnType<typeof setTimeout>;
    const triggerBlink = () => {
      const state = stateRef.current;
      if (!state.isDancing && !state.isHovered) {
        state.blinkScaleY = 0.05;

        setTimeout(() => {
          state.blinkScaleY = 1;
          if (Math.random() < 0.2) {
            setTimeout(() => {
              state.blinkScaleY = 0.05;
              setTimeout(() => {
                state.blinkScaleY = 1;
              }, 90);
            }, 130);
          }
        }, 110);
      }

      const nextDelay = 3600 + Math.random() * 2600;
      blinkTimeout = setTimeout(triggerBlink, nextDelay);
    };
    blinkTimeout = setTimeout(triggerBlink, 3200);

    let rafId: number;
    const loop = () => {
      const state = stateRef.current;
      const now = Date.now();

      if (now - state.lastActivityTime > 7000 && now > state.idleDanceTimer) {
        if (!state.isDancing) {
          state.isDancing = true;
          state.danceStartTime = now;
        }

        const elapsed = now - state.danceStartTime;
        const DANCE_DURATION = 2600;

        if (elapsed < DANCE_DURATION) {
          const progress = elapsed / DANCE_DURATION;
          const jingleWave =
            Math.sin(progress * Math.PI * 6) * Math.sin(progress * Math.PI);
          state.targetEyeX = jingleWave * 18;
          state.targetEyeY = -3 + Math.sin(progress * Math.PI * 8) * 3;
          state.targetRotation = jingleWave * 16;
          state.targetLeftScaleX = 1;
          state.targetLeftScaleY = 1;
          state.targetRightScaleX = 1;
          state.targetRightScaleY = 1;
        } else {
          state.isDancing = false;
          state.idleDanceTimer = now + 11000 + Math.random() * 4000;
          state.targetEyeX = 0;
          state.targetEyeY = 0;
          state.targetRotation = 0;
        }
      }

      state.currentEyeX += (state.targetEyeX - state.currentEyeX) * 0.15;
      state.currentEyeY += (state.targetEyeY - state.currentEyeY) * 0.15;
      state.currentRotation +=
        (state.targetRotation - state.currentRotation) * 0.12;

      state.currentLeftScaleX +=
        (state.targetLeftScaleX - state.currentLeftScaleX) * 0.15;
      state.currentLeftScaleY +=
        (state.targetLeftScaleY - state.currentLeftScaleY) * 0.15;
      state.currentRightScaleX +=
        (state.targetRightScaleX - state.currentRightScaleX) * 0.15;
      state.currentRightScaleY +=
        (state.targetRightScaleY - state.currentRightScaleY) * 0.15;

      const shouldShowUArch = state.isHovered || state.isDancing;
      if (shouldShowUArch !== showUArchRef.current) {
        showUArchRef.current = shouldShowUArch;
        setShowUArch(shouldShowUArch);
      }

      if (eyeClusterRef.current) {
        eyeClusterRef.current.setAttribute(
          "transform",
          `translate(${state.currentEyeX.toFixed(2)}, ${state.currentEyeY.toFixed(2)}) rotate(${state.currentRotation.toFixed(2)}, 114.27, 114.27)`,
        );
      }

      if (!shouldShowUArch) {
        if (leftEyeRef.current) {
          leftEyeRef.current.setAttribute(
            "transform",
            `translate(85, 114.27) scale(${state.currentLeftScaleX.toFixed(3)}, ${(state.currentLeftScaleY * state.blinkScaleY).toFixed(3)}) translate(-85, -114.27)`,
          );
        }
        if (rightEyeRef.current) {
          rightEyeRef.current.setAttribute(
            "transform",
            `translate(143.5, 114.27) scale(${state.currentRightScaleX.toFixed(3)}, ${(state.currentRightScaleY * state.blinkScaleY).toFixed(3)}) translate(-143.5, -114.27)`,
          );
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      clearTimeout(blinkTimeout);
      cancelAnimationFrame(rafId);
    };
  }, [interactive]);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex flex-col items-center justify-center shrink-0 cursor-pointer ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => {
        stateRef.current.isHovered = true;
      }}
      onMouseLeave={() => {
        stateRef.current.isHovered = false;
      }}
      onClick={() => {
        stateRef.current.blinkScaleY = 0.05;
        setTimeout(() => {
          stateRef.current.blinkScaleY = 1;
        }, 120);
      }}
    >
      {/* Bot SVG: Clean, solid, non-bouncing stance */}
      <svg
        viewBox="-15 -15 259 259"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full select-none transform-gpu transition-[transform,filter] duration-150 ease-out ${
          interactive ? "hover:scale-105 hover:brightness-[1.06]" : ""
        }`}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={shellFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: shellTop }} />
            <stop offset="100%" style={{ stopColor: shellBottom }} />
          </linearGradient>
          <linearGradient id={shellRimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: rimTop }} />
            <stop offset="100%" style={{ stopColor: rimBottom }} />
          </linearGradient>
        </defs>

        {/* Head Shell */}
        <g
          transform="translate(114.2705 114.2705) scale(1.040524017467249) translate(-114.2705 -114.2705)"
          style={{
            filter:
              "drop-shadow(0 3px 6px color-mix(in srgb, black 35%, transparent))",
          }}
        >
          <path
            d={BOT_HEAD_PATH}
            fill={`url(#${shellFillId})`}
            stroke={colors.headStroke}
            strokeWidth={colors.headStroke !== "none" ? 2.5 : 0}
          />
          <path
            d={BOT_HEAD_PATH}
            fill="none"
            stroke={`url(#${shellRimId})`}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          <ellipse
            cx="78"
            cy="52"
            rx="44"
            ry="26"
            fill="white"
            opacity={0.12}
            style={{ filter: "blur(8px)" }}
          />

          {/* Interactive Eye Cluster */}
          <g
            ref={eyeClusterRef}
            transform="translate(0, 0) rotate(0, 114.27, 114.27)"
          >
            {showUArch ? (
              /* U-Shaped Eyebrow / Happy Dancing Arches with bold prominent thickness */
              <g>
                <path
                  d="M 72 123 C 74 98 96 98 98 123"
                  fill="none"
                  stroke={colors.eyeColor}
                  strokeWidth={16}
                  strokeLinecap="round"
                />
                <path
                  d="M 130.5 123 C 132.5 98 154.5 98 156.5 123"
                  fill="none"
                  stroke={colors.eyeColor}
                  strokeWidth={16}
                  strokeLinecap="round"
                />
              </g>
            ) : (
              /* Always-Round Capsule Eyes with widened center gap */
              <g>
                {/* Left Eye (Centered at X = 85, Y = 114.27) */}
                <g
                  ref={leftEyeRef}
                  transform="translate(85, 114.27) scale(1, 1) translate(-85, -114.27)"
                >
                  <line
                    x1={85}
                    y1={98}
                    x2={85}
                    y2={130}
                    stroke={colors.eyeColor}
                    strokeWidth={20}
                    strokeLinecap="round"
                  />
                  {size >= 40 && (
                    <line
                      x1={80}
                      y1={104}
                      x2={80}
                      y2={111}
                      stroke="white"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  )}
                </g>

                {/* Right Eye (Centered at X = 143.5, Y = 114.27 - widened center gap!) */}
                <g
                  ref={rightEyeRef}
                  transform="translate(143.5, 114.27) scale(1, 1) translate(-143.5, -114.27)"
                >
                  <line
                    x1={143.5}
                    y1={98}
                    x2={143.5}
                    y2={130}
                    stroke={colors.eyeColor}
                    strokeWidth={20}
                    strokeLinecap="round"
                  />
                  {size >= 40 && (
                    <line
                      x1={138.5}
                      y1={104}
                      x2={138.5}
                      y2={111}
                      stroke="white"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  )}
                </g>
              </g>
            )}
          </g>
        </g>
      </svg>

      {/* Clean Static Ground Shadow (No bounce) */}
      {withShadow && (
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-none bg-foreground/10 filter blur-[1.5px] pointer-events-none"
          style={{
            width: Math.max(12, Math.round(size * 0.52)),
            height: Math.max(3, Math.round(size * 0.1)),
          }}
        />
      )}
    </div>
  );
}
