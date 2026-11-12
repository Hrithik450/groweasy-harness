export function parseAspectRatio(aspectRatio?: string): {
  ratioString: string;
  maxWidth: string;
} | null {
  if (!aspectRatio) return null;
  const clean = aspectRatio.replace(/\s+/g, "");
  switch (clean) {
    case "9/16":
      return { ratioString: "9 / 16", maxWidth: "min(280px, 100%)" };
    case "4/5":
      return { ratioString: "4 / 5", maxWidth: "min(300px, 100%)" };
    case "1/1":
      return { ratioString: "1 / 1", maxWidth: "min(340px, 100%)" };
    case "3/2":
      return { ratioString: "3 / 2", maxWidth: "min(400px, 100%)" };
    case "16/9":
      return { ratioString: "16 / 9", maxWidth: "min(440px, 100%)" };
    default:
      return null;
  }
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function getNearestAspectRatio(
  width?: number,
  height?: number,
): {
  ratioString: string;
  maxWidth: string;
} {
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
