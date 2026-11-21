"use client";

import { useEffect, useRef, useState } from "react";

export type BotDollVariant = "red" | "cream" | "amber";

/**
 * Role → face mapping:
 * - strategist / planning → cream
 * - manager / account / performance → red
 * - creator / creative / video → amber
 * - anything else → red
 */
export function botVariantForRole(role?: string | null): BotDollVariant {
  if (!role) return "red";
  const lower = role.toLowerCase();
  if (/strateg|planning|planner/.test(lower)) return "cream";
  if (/manager|account|performance|analytic/.test(lower)) return "red";
  if (/creator|creative|video|design/.test(lower)) return "amber";
  return "red";
}

interface BotDollAvatarProps {
  size?: number;
  avatarUrl?: string;
  /** Square face style. Defaults to the role inferred from avatarUrl, else red. */
  variant?: BotDollVariant;
  className?: string;
  withShadow?: boolean;
  fast?: boolean;
  interactive?: boolean;
}

const PALETTES = {
  red: { face: "#F06A45", plate: "#F4EBDD", ink: "#141210" },
  cream: { face: "#F6F0E2", plate: "#171412", ink: "#141210" },
  amber: { face: "#E8932E", plate: "#F4EBDD", ink: "#141210" },
} as const;

/** Face geometry shared by the React renderer and the public SVGs. */
const FACE_X = 4;
const FACE_Y = 6;
const FACE_W = 76;
const FACE_H = 76;
const FACE_CX = FACE_X + FACE_W / 2;
const FACE_CY = FACE_Y + FACE_H / 2;
const STAR_PATH =
  "M0 -8.5 L2.2 -2.2 L8.5 0 L2.2 2.2 L0 8.5 L-2.2 2.2 L-8.5 0 L-2.2 -2.2 Z";

const IDLE_RENDER = {
  eyeX: 0,
  eyeY: 0,
  rotation: 0,
  leftScaleX: 1,
  leftScaleY: 1,
  rightScaleX: 1,
  rightScaleY: 1,
  blinkScaleY: 1,
  excited: 1,
};

/**
 * Flat square bot face with pointer-tracked eyes, blinking, idle dance, and a
 * hard offset backplate. The backplate stays static so the loader reads as a
 * printed sticker rather than a bouncing ball.
 */
export function BotDollAvatar({
  size = 48,
  avatarUrl,
  variant,
  className = "",
  withShadow = true,
  interactive = true,
}: BotDollAvatarProps) {
  const resolvedVariant = variant ?? botVariantForRole(avatarUrl);
  const palette = PALETTES[resolvedVariant];

  const containerRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [render, setRender] = useState(IDLE_RENDER);

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
    excited: 1,
    targetExcited: 1,
    isHovered: false,
    isDancing: false,
    danceStartTime: 0,
    lastMouseX: 0,
    lastMouseY: 0,
    lastTime: 0,
    lastActivityTime: Date.now(),
    idleDanceTimer: Date.now() + 7500,
  });

  // Read the OS motion preference once and follow live changes.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) setRender(IDLE_RENDER);
  }, [reducedMotion]);

  useEffect(() => {
    if (!interactive || reducedMotion) return;

    const state = stateRef.current;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    };

    const handlePointerMove = (e: MouseEvent) => {
      const now = performance.now();
      const dt = Math.max(1, now - (state.lastTime || now));
      const dxMove = e.clientX - (state.lastMouseX || e.clientX);
      const dyMove = e.clientY - (state.lastMouseY || e.clientY);
      const moveSpeed = Math.hypot(dxMove, dyMove) / dt; // px/ms

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

      // Travel budget inside the face: keeps both eyes on the face.
      const maxTravel = 7.5;
      const normalizedDist = Math.min(dist / 260, 1);
      const easedTravel = Math.sin((normalizedDist * Math.PI) / 2) * maxTravel;

      state.targetEyeX = Math.cos(angle) * easedTravel;
      state.targetEyeY = Math.sin(angle) * easedTravel;

      const horizRatio =
        Math.sign(deltaX) *
        Math.pow(
          Math.abs(deltaX) / (Math.abs(deltaX) + Math.abs(deltaY) + 1e-4),
          0.85,
        );
      state.targetRotation = horizRatio * normalizedDist * 10;

      const dirX = easedTravel / maxTravel; // -1 to +1
      const speedBoost = Math.min(0.04, moveSpeed * 0.02);

      let lScaleX = 1;
      let lScaleY = 1;
      let rScaleX = 1;
      let rScaleY = 1;

      if (dirX > 0.05) {
        rScaleX = Math.min(1.08, 1 + dirX * 0.06 + speedBoost);
        rScaleY = Math.min(1.04, 1 + dirX * 0.035);
        lScaleX = Math.max(0.92, 1 - dirX * 0.08 - speedBoost);
        lScaleY = Math.max(0.95, 1 - dirX * 0.05);
      } else if (dirX < -0.05) {
        const absDir = Math.abs(dirX);
        lScaleX = Math.min(1.08, 1 + absDir * 0.06 + speedBoost);
        lScaleY = Math.min(1.04, 1 + absDir * 0.035);
        rScaleX = Math.max(0.92, 1 - absDir * 0.08 - speedBoost);
        rScaleY = Math.max(0.95, 1 - absDir * 0.05);
      }

      state.targetLeftScaleX = lScaleX;
      state.targetLeftScaleY = lScaleY;
      state.targetRightScaleX = rScaleX;
      state.targetRightScaleY = rScaleY;
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    const blinkOnce = () => {
      if (state.isDancing || state.isHovered) return;
      state.blinkScaleY = 0.06;
      later(() => {
        state.blinkScaleY = 1;
        // Occasional double-blink keeps the face alive.
        if (Math.random() < 0.2) {
          later(() => {
            state.blinkScaleY = 0.06;
            later(() => {
              state.blinkScaleY = 1;
            }, 90);
          }, 130);
        }
      }, 110);
    };

    const scheduleBlink = () => {
      blinkOnce();
      later(scheduleBlink, 3600 + Math.random() * 2600);
    };
    later(scheduleBlink, 3200);

    let rafId = 0;
    const loop = () => {
      const now = Date.now();

      // Happy state widens the eyes a touch.
      const happy = state.isHovered || state.isDancing;
      state.targetExcited = happy ? 1.06 : 1;

      // Idle dance: decaying left-right jingle after inactivity.
      if (
        now - state.lastActivityTime > 7000 &&
        now > state.idleDanceTimer
      ) {
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
          state.targetEyeX = jingleWave * 6.5;
          state.targetEyeY = -1.5 + Math.sin(progress * Math.PI * 8) * 1.5;
          state.targetRotation = jingleWave * 5;
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
      state.excited += (state.targetExcited - state.excited) * 0.18;

      setRender({
        eyeX: state.currentEyeX,
        eyeY: state.currentEyeY,
        rotation: state.currentRotation,
        leftScaleX: state.currentLeftScaleX,
        leftScaleY: state.currentLeftScaleY,
        rightScaleX: state.currentRightScaleX,
        rightScaleY: state.currentRightScaleY,
        blinkScaleY: state.blinkScaleY,
        excited: state.excited,
      });

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(rafId);
      for (const id of timeouts) clearTimeout(id);
    };
  }, [interactive, reducedMotion]);

  const eyeTransform = (cx: number, cy: number, sx: number, sy: number) =>
    `translate(${cx} ${cy}) scale(${(sx * render.excited).toFixed(3)} ${(
      sy *
      render.blinkScaleY *
      render.excited
    ).toFixed(3)}) translate(${-cx} ${-cy})`;

  const isAmber = resolvedVariant === "amber";
  const isCream = resolvedVariant === "cream";

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex flex-col items-center justify-center shrink-0 ${
        interactive ? "cursor-pointer" : ""
      } ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => {
        if (!interactive) return;
        stateRef.current.isHovered = true;
      }}
      onMouseLeave={() => {
        stateRef.current.isHovered = false;
      }}
      onClick={() => {
        if (!interactive || reducedMotion) return;
        stateRef.current.blinkScaleY = 0.06;
        setTimeout(() => {
          stateRef.current.blinkScaleY = 1;
        }, 120);
      }}
    >
      <svg
        viewBox="0 0 94 96"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="w-full h-full select-none transform-gpu"
        style={{ overflow: "visible" }}
      >
        {/* Hard offset backplate: static, never bounces. */}
        <rect
          x={FACE_X + 10}
          y={FACE_Y + 10}
          width={FACE_W}
          height={FACE_H}
          rx={6}
          fill={palette.plate}
        />

        {/* Amber's stem tucks under the face before the face is painted. */}
        {isAmber && (
          <rect x={40.75} y={82} width={2.5} height={13} fill={palette.ink} />
        )}

        <rect
          x={FACE_X}
          y={FACE_Y}
          width={FACE_W}
          height={FACE_H}
          rx={6}
          fill={palette.face}
        />

        {/* Brows: flat bars except cream's slight tilt; they follow the gaze
            at reduced amplitude so they do not read as frozen. */}
        <g
          fill={palette.ink}
          transform={`translate(${(render.eyeX * 0.5).toFixed(2)} ${(
            render.eyeY * 0.5
          ).toFixed(2)}) rotate(${(render.rotation * 0.35).toFixed(2)} ${FACE_CX} ${FACE_CY})`}
        >
          {isCream ? (
            <>
              <rect
                x={21}
                y={27.5}
                width={16}
                height={5.5}
                rx={1}
                transform="rotate(-7 29 30.25)"
              />
              <rect
                x={47}
                y={27.5}
                width={16}
                height={5.5}
                rx={1}
                transform="rotate(7 55 30.25)"
              />
            </>
          ) : (
            <>
              <rect x={21} y={27} width={16} height={6} rx={1} />
              <rect x={47} y={27} width={16} height={6} rx={1} />
            </>
          )}
        </g>

        {/* Eyes share one gaze/rotation cluster. */}
        <g
          transform={`translate(${render.eyeX.toFixed(2)} ${render.eyeY.toFixed(
            2,
          )}) rotate(${render.rotation.toFixed(2)} ${FACE_CX} ${FACE_CY})`}
        >
          {isAmber ? (
            <>
              <g transform={eyeTransform(31, 42, render.leftScaleX, render.leftScaleY)}>
                <circle cx={31} cy={42} r={6.3} fill={palette.ink} />
              </g>
              <g transform={eyeTransform(53, 42, render.rightScaleX, render.rightScaleY)}>
                <circle cx={53} cy={42} r={6.3} fill={palette.ink} />
              </g>
            </>
          ) : (
            <>
              <g transform={eyeTransform(29, 42, render.leftScaleX, render.leftScaleY)}>
                <circle cx={29} cy={42} r={7.2} fill={palette.ink} />
              </g>
              <g transform={eyeTransform(55, 42, render.rightScaleX, render.rightScaleY)}>
                <circle cx={55} cy={42} r={7.2} fill={palette.ink} />
              </g>
            </>
          )}
        </g>

        {/* Mouth: flat bar everywhere except cream's small smile. */}
        {isCream ? (
          <path
            d="M34 63 Q42 69 50 63"
            fill="none"
            stroke={palette.ink}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
        ) : (
          <rect
            x={32}
            y={61}
            width={20}
            height={5.5}
            rx={1.5}
            fill={palette.ink}
          />
        )}

        {/* Cream's four-point star twinkles; reduced motion leaves it still. */}
        {isCream && (
          <g transform="translate(80 10)">
            <g>
              <path d={STAR_PATH} fill="#EF6A4A" />
              {!reducedMotion && (
                <>
                  <animate
                    attributeName="opacity"
                    values="0.55;1;0.55"
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                  <animateTransform
                    attributeName="transform"
                    type="scale"
                    values="0.9;1.08;0.9"
                    dur="3.4s"
                    repeatCount="indefinite"
                  />
                </>
              )}
            </g>
          </g>
        )}
      </svg>

      {withShadow && (
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-foreground/10 filter blur-[1.5px] pointer-events-none"
          style={{
            width: Math.max(12, Math.round(size * 0.52)),
            height: Math.max(3, Math.round(size * 0.1)),
          }}
        />
      )}
    </div>
  );
}

interface BotDollLoaderProps {
  /**
   * "top-banner": Compact pill for earlier messages loading at the top
   * "center": Centered loader for initial conversation loading
   */
  variant?: "top-banner" | "center";
  /** Face style for the loader avatar. Inferred from avatarUrl when omitted. */
  avatarVariant?: BotDollVariant;
  text?: string;
  avatarUrl?: string;
  className?: string;
}

export function BotDollLoader({
  variant = "top-banner",
  avatarVariant,
  text,
  avatarUrl,
  className = "",
}: BotDollLoaderProps) {
  if (variant === "top-banner") {
    return (
      <div
        className={`w-full flex items-center justify-center py-2 animate-in fade-in duration-300 ${className}`}
      >
        <div className="inline-flex items-center gap-2 transition-all">
          <BotDollAvatar
            size={20}
            withShadow={false}
            avatarUrl={avatarUrl}
            variant={avatarVariant}
          />
          <span className="text-[11.5px] font-medium text-muted-foreground tracking-tight">
            {text || "Loading earlier messages..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center min-h-[320px] text-muted-foreground gap-3.5 animate-in fade-in duration-300 ${className}`}
    >
      <BotDollAvatar
        size={56}
        withShadow
        avatarUrl={avatarUrl}
        variant={avatarVariant}
      />
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs text-foreground font-semibold tracking-wide">
          {text || "Loading conversation"}
        </span>
        <span className="text-[10.5px] text-muted-foreground font-normal">
          Preparing marketing assets and chat history
        </span>
      </div>
    </div>
  );
}
