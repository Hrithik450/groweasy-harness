/**
 * Animated bot avatar used by every sidebar session row.
 *
 * Markup, class names, animation hooks, and colour derivation are moved
 * verbatim from the app-side `src/components/sidebar/sidebar.tsx`.
 */
import { useId } from "react";
import type { SessionView } from "@openai-harness/session";

const botAvatars = [
  "sales-outbound-animated.svg",
  "account-manager-animated.svg",
  "chief-animated.svg",
  "inbox-manager-animated.svg",
  "talent-scout-animated.svg",
  "expense-manager-animated.svg",
  "offsite-crew-animated.svg",
  "grok-bot-animated.svg",
  "gem-animated.svg",
  "crystal-animated.svg",
];

/**
 * Resolves a distinct animated bot avatar icon matching the session's agent role.
 */
export function getRoleAvatar(session: SessionView): string {
  const text = (session.title || "").toLowerCase();

  if (text.includes("strategist") || text.includes("strategy")) {
    return "/bot/sales-outbound-animated.svg";
  }
  if (text.includes("manager") || text.includes("management")) {
    return "/bot/account-manager-animated.svg";
  }
  if (text.includes("creator") || text.includes("creative")) {
    return "/bot/chief-animated.svg";
  }

  const hash = Math.abs(
    (session.id || session.title || "").split("").reduce((acc, char) => {
      return (acc << 5) - acc + char.charCodeAt(0);
    }, 0),
  );

  return `/bot/${botAvatars[hash % botAvatars.length]}`;
}

const ROUND_HEAD_PATH =
  "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";

const GEM_HEAD_PATH =
  "M227.48 114.27C227.48 114.96 227.42 115.46 227.3 116.32C226.51 120.57 225.49 124.41 224.59 127.2C222.98 131.59 221.03 136.22 218.75 141.05C216.14 146.01 213.23 151.06 210.01 156.18C206.54 161.31 202.79 166.44 198.79 171.52C194.59 176.54 190.17 181.44 185.59 186.23C180.85 190.85 175.98 195.31 171.02 199.55C165.97 203.57 160.9 207.35 155.8 210.87C150.74 214.11 145.73 217.05 140.8 219.68C136.03 221.98 131.43 223.95 127.08 225.57C123.03 226.84 119.39 227.76 116.3 228.31C114.95 228.49 114.27 228.49 114.27 228.49C113.59 228.49 112.24 228.31 109.16 227.76C105.51 226.84 101.46 225.57 97.11 223.95C92.51 221.98 87.74 219.68 82.81 217.05C77.81 214.11 72.74 210.87 67.64 207.35C62.57 203.57 57.52 199.55 52.56 195.31C47.69 190.85 42.95 186.23 38.37 181.44C33.95 176.54 29.75 171.52 25.76 166.44C22.02 161.31 18.53 156.18 15.31 151.06C12.4 146.01 9.79 141.05 7.51 136.22C5.56 131.59 3.95 127.2 2.69 123.11C1.79 119.44 1.24 116.32 1.06 114.27C1.06 113.58 1.24 112.22 1.79 109.11C2.69 105.44 3.95 101.34 5.56 96.96C7.51 92.32 9.79 87.49 12.4 82.54C15.31 77.48 18.53 72.36 22.02 67.23C25.76 62.1 29.75 57.02 33.95 52.01C38.37 47.1 42.95 42.31 47.69 37.69C52.56 33.23 57.52 28.99 62.57 24.97C67.64 21.19 72.74 17.67 77.81 14.43C82.81 11.49 87.74 8.86 92.51 6.56C97.11 4.59 101.46 2.97 105.51 1.7C109.16 0.79 112.24 0.23 114.27 0.05C114.95 0.05 116.3 0.23 119.39 0.79C123.03 1.7 127.08 2.97 131.43 4.59C136.03 6.56 140.8 8.86 145.73 11.49C150.74 14.43 155.8 17.67 160.9 21.19C165.97 24.97 171.02 28.99 175.98 33.23C180.85 37.69 185.59 42.31 190.17 47.1C194.59 52.01 198.79 57.02 202.79 62.1C206.54 67.23 210.01 72.36 213.23 77.48C216.14 82.54 218.75 87.49 221.03 92.32C222.98 96.96 224.59 101.34 225.85 105.44C226.75 109.11 227.18 111.36 227.3 112.22C227.42 113.08 227.48 113.58 227.48 114.27Z";

export function SidebarBotAvatar({
  session,
  index,
}: {
  session: SessionView;
  index: number;
}) {
  const text = (session.title || "").toLowerCase();
  const gradientKey = useId().replace(/:/g, "");
  const shellFillId = `sidebar-shell-${gradientKey}`;
  const shellRimId = `sidebar-rim-${gradientKey}`;

  let headColor = "var(--agent-green)";
  let motionClass = "animate-sidebar-inquisitive";
  let isGem = false;

  if (text.includes("strategist") || text.includes("strategy")) {
    headColor = "var(--agent-amber)";
    motionClass = "animate-sidebar-inquisitive";
  } else if (text.includes("manager") || text.includes("management")) {
    headColor = "var(--agent-violet)";
    motionClass = "animate-sidebar-scanning";
    isGem = true;
  } else if (text.includes("creator") || text.includes("creative")) {
    headColor = "var(--agent-green)";
    motionClass = "animate-sidebar-playful";
  } else {
    const colors = ["var(--agent-blue)", "var(--agent-coral)", "var(--agent-indigo)", "var(--card)"];
    headColor = colors[index % colors.length];
    const motions = [
      "animate-sidebar-inquisitive",
      "animate-sidebar-scanning",
      "animate-sidebar-playful",
      "animate-sidebar-orbit",
    ];
    motionClass = motions[index % motions.length];
  }

  const shellTop = `color-mix(in srgb, white 16%, ${headColor})`;
  const shellBottom = `color-mix(in srgb, black 18%, ${headColor})`;
  const rimTop = `color-mix(in srgb, white 22%, ${headColor})`;
  const rimBottom = `color-mix(in srgb, black 22%, ${headColor})`;

  return (
    <div className="w-8 h-8 flex items-center justify-center shrink-0">
      <svg
        viewBox="-15 -15 259 259"
        xmlns="http://www.w3.org/2000/svg"
        className="w-7 h-7 select-none transition-[transform,filter] duration-150 ease-out group-hover:scale-105 group-hover:brightness-[1.06]"
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
        <g
          transform="translate(114.2705 114.2705) scale(1.0405) translate(-114.2705 -114.2705)"
          style={{
            filter:
              "drop-shadow(0 3px 6px color-mix(in srgb, black 35%, transparent))",
          }}
        >
          {/* Head Shell */}
          <path
            d={isGem ? GEM_HEAD_PATH : ROUND_HEAD_PATH}
            fill={`url(#${shellFillId})`}
          />
          <path
            d={isGem ? GEM_HEAD_PATH : ROUND_HEAD_PATH}
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
            style={{ filter: "blur(4px)" }}
          />

          {/* Unique Autonomous Eye Motion Cluster */}
          <g
            className={motionClass}
            style={{ transformOrigin: "114.27px 114.27px" }}
          >
            {/* Left Eye */}
            <g
              className="animate-sidebar-blink"
              style={{
                transformOrigin: "85px 114.27px",
                animationDelay: `${(index * 0.6) % 3}s`,
              }}
            >
              <line
                x1={85}
                y1={98}
                x2={85}
                y2={130}
                stroke="var(--foreground)"
                strokeWidth={20}
                strokeLinecap="round"
              />
            </g>

            {/* Right Eye */}
            <g
              className="animate-sidebar-blink"
              style={{
                transformOrigin: "143.5px 114.27px",
                animationDelay: `${(index * 0.6) % 3 + 0.05}s`,
              }}
            >
              <line
                x1={143.5}
                y1={98}
                x2={143.5}
                y2={130}
                stroke="var(--foreground)"
                strokeWidth={20}
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
