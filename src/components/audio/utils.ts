/** Helpers shared by the video viewers. */

/** `83` → `1:23`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Nearest of the ratios the pipeline renders, for letterboxing decisions. */
export function getNearestAspectRatio(width: number, height: number): string {
  if (!width || !height) return "9:16";
  const ratio = width / height;
  const options: Array<[number, string]> = [
    [9 / 16, "9:16"],
    [1, "1:1"],
    [16 / 9, "16:9"],
    [4 / 5, "4:5"],
  ];
  return options.reduce((best, cur) =>
    Math.abs(cur[0] - ratio) < Math.abs(best[0] - ratio) ? cur : best,
  )[1];
}
