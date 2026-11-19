export type StandardAspectRatio = "9/16" | "4/5" | "1/1" | "16/9";

export const ASPECT_CONFIG: Record<
  StandardAspectRatio,
  {
    aspectClass: string;
    cardWidthClass: string;
    carouselWidthClass: string;
    maxWidthClass: string;
    singleWidthClass: string;
    userSingleWidthClass: string;
  }
> = {
  "9/16": {
    aspectClass: "aspect-[9/16]",
    cardWidthClass: "max-w-[280px] sm:max-w-[320px]",
    carouselWidthClass: "w-48 sm:w-56",
    maxWidthClass: "w-full max-w-[280px] sm:max-w-[320px]",
    singleWidthClass: "w-full max-w-[280px] sm:max-w-[320px]",
    userSingleWidthClass: "w-full max-w-[280px] sm:max-w-[320px]",
  },
  "4/5": {
    aspectClass: "aspect-[4/5]",
    cardWidthClass: "max-w-[320px] sm:max-w-[360px]",
    carouselWidthClass: "w-56 sm:w-64",
    maxWidthClass: "w-full max-w-[340px] sm:max-w-[380px]",
    singleWidthClass: "w-full max-w-[340px] sm:max-w-[380px]",
    userSingleWidthClass: "w-full max-w-[320px] sm:max-w-[360px]",
  },
  "1/1": {
    aspectClass: "aspect-[1/1]",
    cardWidthClass: "max-w-[380px] sm:max-w-[420px]",
    carouselWidthClass: "w-60 sm:w-68",
    maxWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
    singleWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
    userSingleWidthClass: "w-full max-w-[340px] sm:max-w-[380px]",
  },
  "16/9": {
    aspectClass: "aspect-[16/9]",
    cardWidthClass: "max-w-[380px] sm:max-w-[420px]",
    carouselWidthClass: "w-60 sm:w-68",
    maxWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
    singleWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
    userSingleWidthClass: "w-full max-w-[380px] sm:max-w-[420px]",
  },
};

/**
 * Fast aspect ratio matcher for standard marketing creative sizes:
 * - 9:16 (0.56) - Story / Reel
 * - 4:5  (0.80) - Instagram feed portrait
 * - 1:1  (1.00) - Square post
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
  if (ratio < 1.35) return "1/1";
  return "16/9";
}

export function parseInitialAspectRatio(aspect?: string): StandardAspectRatio {
  const norm = (aspect || "").replace(":", "/").trim();
  return norm in ASPECT_CONFIG ? (norm as StandardAspectRatio) : "1/1";
}

export function normalizeAspectRatio(
  aspect?: string,
): StandardAspectRatio | undefined {
  if (!aspect) return undefined;
  const norm = aspect.replace(":", "/").trim();
  return norm in ASPECT_CONFIG ? (norm as StandardAspectRatio) : undefined;
}
