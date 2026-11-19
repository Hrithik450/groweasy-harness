/** Helpers shared by the video viewers. */

/** `83` → `1:23`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Nearest renderable aspect ratio plus its container max-width. */
export function getNearestAspectRatio(
  width?: number,
  height?: number,
): { ratioString: string; maxWidth: string } {
  if (!width || !height) {
    return { ratioString: "9 / 16", maxWidth: "min(280px, 100%)" };
  }
  const ratio = width / height;
  if (ratio < 0.65) {
    return { ratioString: "9 / 16", maxWidth: "min(280px, 100%)" };
  }
  if (ratio < 0.88) {
    return { ratioString: "4 / 5", maxWidth: "min(300px, 100%)" };
  }
  if (ratio < 1.25) {
    return { ratioString: "1 / 1", maxWidth: "min(340px, 100%)" };
  }
  if (ratio < 1.64) {
    return { ratioString: "3 / 2", maxWidth: "min(400px, 100%)" };
  }
  return { ratioString: "16 / 9", maxWidth: "min(440px, 100%)" };
}
