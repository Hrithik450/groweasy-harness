/**
 * Video tools: image-to-video motion, lip sync, subtitles, and reading clips.
 *
 * The registry addresses the motion tool as `imageToVideo`, so its definition
 * and executor are re-exported under those names alongside the module's own.
 *
 * @module @/lib/tools/video
 */

export * from "./create.subtitles/tool";
export * from "./image.to.video.motion/tool";
export * from "./read.videos/tool";
export * from "./sync.lips/tool";

export {
  imageToVideoMotionToolDefinition as imageToVideoToolDefinition,
  executeImageToVideoMotion as executeImageToVideoTool,
  type ImageToVideoMotionArgs as ImageToVideoArgs,
} from "./image.to.video.motion/tool";
export { executeCreateSubtitles as executeCreateSubtitlesTool } from "./create.subtitles/tool";
export { executeSyncLips as executeSyncLipsTool } from "./sync.lips/tool";
