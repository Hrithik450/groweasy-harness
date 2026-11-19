"use client";

import { useEffect, useId, useRef, useState } from "react";

interface BotDollAvatarProps {
  size?: number;
  avatarUrl?: string;
  className?: string;
  withShadow?: boolean;
  fast?: boolean;
  interactive?: boolean;
}

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
  // Signature Grok bot (Pure white head with dark eyes)
  return {
    headColor: "var(--agent-paper)",
    headStroke: "var(--border-subtle)",
    eyeColor: "var(--foreground)",
  };
}

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
}: BotDollAvatarProps) {
  // No session is ever marked active, so the default avatar is the answer.
  const resolvedAvatar = avatarUrl || "/bot/chief-animated.svg";

  const colors = resolveRoleColors(resolvedAvatar);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientKey = useId().replace(/:/g, "");
  const shellFillId = `bot-shell-${gradientKey}`;
  const shellRimId = `bot-rim-${gradientKey}`;


  // Dynamic animation values (driven smoothly via RAF)
  const [renderTransform, setRenderTransform] = useState({
    eyeX: 0,
    eyeY: 0,
    rotation: 0,
    leftScaleX: 1,
    leftScaleY: 1,
    rightScaleX: 1,
    rightScaleY: 1,
    blinkScaleY: 1,
    showUArch: false,
  });

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
    lastActivityTime: Date.now(),
    idleDanceTimer: Date.now() + 7500, // Starts dance after ~7.5s of idle
  });

  useEffect(() => {
    if (!interactive) return;

    // Pointer move listener to track gaze angle, direction, and velocity
    const handlePointerMove = (e: MouseEvent) => {
      const state = stateRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - (state.lastTime || now));
      const dxMove = e.clientX - (state.lastMouseX || e.clientX);
      const dyMove = e.clientY - (state.lastMouseY || e.clientY);
      const moveSpeed = Math.hypot(dxMove, dyMove) / dt; // px/ms

      state.lastMouseX = e.clientX;
      state.lastMouseY = e.clientY;
      state.lastTime = now;
      state.lastActivityTime = Date.now();

      // Interrupt idle dance immediately on cursor movement
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

      // Travel radius in SVG coordinates (viewBox 259x259)
      const maxTravel = 28;
      const normalizedDist = Math.min(dist / 320, 1);
      const easedTravel = Math.sin((normalizedDist * Math.PI) / 2) * maxTravel;

      state.targetEyeX = Math.cos(angle) * easedTravel;
      state.targetEyeY = Math.sin(angle) * easedTravel;

      // Eye Angle Alignment: smoothly tilts the eyes along the cursor angle
      const horizRatio =
        Math.sign(deltaX) *
        Math.pow(
          Math.abs(deltaX) / (Math.abs(deltaX) + Math.abs(deltaY) + 1e-4),
          0.85,
        );
      state.targetRotation = horizRatio * normalizedDist * 36;

      // Subtle spherical perspective (kept within smooth bounds - no extreme zoom out!)
      const dirX = state.targetEyeX / maxTravel; // -1 to +1
      const speedBoost = Math.min(0.06, moveSpeed * 0.03);

      let lScaleX = 1;
      let lScaleY = 1;
      let rScaleX = 1;
      let rScaleY = 1;

      if (dirX > 0.05) {
        // Looking right: right eye slightly expands (near), left eye subtly contracts (far)
        rScaleX = Math.min(1.12, 1 + dirX * 0.09 + speedBoost);
        rScaleY = Math.min(1.06, 1 + dirX * 0.05);
        lScaleX = Math.max(0.88, 1 - dirX * 0.12 - speedBoost);
        lScaleY = Math.max(0.92, 1 - dirX * 0.08);
      } else if (dirX < -0.05) {
        // Looking left: left eye slightly expands (near), right eye subtly contracts (far)
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

    // Blink timer (natural periodic blinking)
    let blinkTimeout: NodeJS.Timeout;
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

    // Smooth RequestAnimationFrame animation loop
    let rafId: number;
    const loop = () => {
      const state = stateRef.current;
      const now = Date.now();

      // Idle Dance Routine: after inactivity, eyes make U shape and jingle left-right-left
      if (now - state.lastActivityTime > 7000 && now > state.idleDanceTimer) {
        if (!state.isDancing) {
          state.isDancing = true;
          state.danceStartTime = now;
        }

        const elapsed = now - state.danceStartTime;
        const DANCE_DURATION = 2600; // 2.6s playful dance

        if (elapsed < DANCE_DURATION) {
          const progress = elapsed / DANCE_DURATION;
          // Smooth decaying left-right-left jingle wave
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
          // Dance finished: schedule next dance after ~10-14 seconds
          state.isDancing = false;
          state.idleDanceTimer = now + 11000 + Math.random() * 4000;
          state.targetEyeX = 0;
          state.targetEyeY = 0;
          state.targetRotation = 0;
        }
      }

      // Smooth damping interpolation (lerp)
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

      setRenderTransform({
        eyeX: state.currentEyeX,
        eyeY: state.currentEyeY,
        rotation: state.currentRotation,
        leftScaleX: state.currentLeftScaleX,
        leftScaleY: state.currentLeftScaleY,
        rightScaleX: state.currentRightScaleX,
        rightScaleY: state.currentRightScaleY,
        blinkScaleY: state.blinkScaleY,
        showUArch: state.isHovered || state.isDancing,
      });

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
        className="w-full h-full select-none transform-gpu transition-transform duration-150"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Light on the top edge, shade below: white/black overlays on the
              flat head colour, so the gloss never depends on color-mix support
              inside an SVG paint server. */}
          <linearGradient id={shellFillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.26} />
            <stop offset="52%" stopColor="#ffffff" stopOpacity={0} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0.24} />
          </linearGradient>
          <linearGradient id={shellRimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0.28} />
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
            d="M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z"
            fill={colors.headColor}
          />
          <path
            d="M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z"
            fill={`url(#${shellFillId})`}
          />
          <path
            d="M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z"
            fill="none"
            stroke={`url(#${shellRimId})`}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {/* broad specular wash */}
          <ellipse
            cx="76"
            cy="50"
            rx="52"
            ry="32"
            fill="white"
            opacity={0.26}
            style={{ filter: "blur(7px)" }}
          />
          {/* tight hot spot */}
          <ellipse
            cx="72"
            cy="44"
            rx="22"
            ry="14"
            fill="white"
            opacity={0.38}
            style={{ filter: "blur(3px)" }}
          />

          {/* Interactive Eye Cluster */}
          <g
            transform={`translate(${renderTransform.eyeX.toFixed(2)}, ${renderTransform.eyeY.toFixed(2)}) rotate(${renderTransform.rotation.toFixed(2)}, 114.27, 114.27)`}
          >
            {renderTransform.showUArch ? (
              /* U-Shaped Eyebrow / Happy Dancing Arches */
              <g>
                <path
                  d="M 72 121 C 74 102 96 102 98 121"
                  fill="none"
                  stroke={colors.eyeColor}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
                <path
                  d="M 130.5 121 C 132.5 102 154.5 102 156.5 121"
                  fill="none"
                  stroke={colors.eyeColor}
                  strokeWidth={9}
                  strokeLinecap="round"
                />
              </g>
            ) : (
              /* Always-Round Capsule Eyes with widened center gap */
              <g>
                {/* Left Eye (Centered at X = 85, Y = 114.27) */}
                <g
                  transform={`translate(85, 114.27) scale(${renderTransform.leftScaleX.toFixed(3)}, ${(renderTransform.leftScaleY * renderTransform.blinkScaleY).toFixed(3)}) translate(-85, -114.27)`}
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
                </g>

                {/* Right Eye (Centered at X = 143.5, Y = 114.27 - widened center gap!) */}
                <g
                  transform={`translate(143.5, 114.27) scale(${renderTransform.rightScaleX.toFixed(3)}, ${(renderTransform.rightScaleY * renderTransform.blinkScaleY).toFixed(3)}) translate(-143.5, -114.27)`}
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
                </g>
              </g>
            )}
          </g>
        </g>
      </svg>

      {/* Clean Static Ground Shadow (No bounce) */}
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
  text?: string;
  avatarUrl?: string;
  className?: string;
}

export function BotDollLoader({
  variant = "top-banner",
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
          <BotDollAvatar size={20} withShadow={false} />
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
      <BotDollAvatar size={56} withShadow />
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
