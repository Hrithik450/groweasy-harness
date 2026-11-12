export type StandardAspectRatio = "9/16" | "4/5" | "1/1" | "16/9" | "3/2";

export const ASPECT_CONFIG: Record<
  StandardAspectRatio,
  {
    aspectClass: string;
    cardWidthClass: string;
    carouselWidthClass: string;
  }
> = {
  "9/16": {
    aspectClass: "aspect-[9/16]",
    carouselWidthClass: "w-48 sm:w-56",
    cardWidthClass: "w-full max-w-[280px] sm:max-w-[320px]",
  },
  "4/5": {
    aspectClass: "aspect-[4/5]",
    carouselWidthClass: "w-56 sm:w-64",
    cardWidthClass: "w-full max-w-[320px] sm:max-w-[360px]",
  },
  "1/1": {
    aspectClass: "aspect-[1/1]",
    carouselWidthClass: "w-60 sm:w-68",
    cardWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
  },
  "3/2": {
    aspectClass: "aspect-[3/2]",
    carouselWidthClass: "w-60 sm:w-68",
    cardWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
  },
  "16/9": {
    aspectClass: "aspect-[16/9]",
    carouselWidthClass: "w-60 sm:w-68",
    cardWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
  },
};

/**
 * Fast aspect ratio matcher for standard marketing creative sizes:
 * - 9:16 (0.56) - Story / Reel
 * - 4:5  (0.80) - Instagram feed portrait
 * - 1:1  (1.00) - Square post
 * - 3:2  (1.50) - Classic photo landscape / 35mm
 * - 16:9 (1.78) - Landscape banner / YouTube
 */
export function getNearestAspectRatio(
  width: number,
  height: number,
): StandardAspectRatio {
  if (width <= 0 || height <= 0) return "1/1";
  const ratio = width / height;
  if (ratio < 0.68) return "9/16";
  if (ratio < 0.9) return "4/5";
  if (ratio < 1.25) return "1/1";
  if (ratio < 1.64) return "3/2";
  return "16/9";
}

export function normalizeAspectRatio(
  aspect?: string,
): StandardAspectRatio | undefined {
  if (!aspect) return undefined;
  const raw = aspect.trim().toLowerCase();
  if (raw === "3.2" || raw === "3 by 2" || raw === "3x2") return "3/2";
  const norm = raw.replace(":", "/").trim();
  return norm in ASPECT_CONFIG ? (norm as StandardAspectRatio) : undefined;
}
