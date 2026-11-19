"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface ChatVideoPlayerProps {
  src: string;
  title?: string;
  className?: string;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function ChatVideoPlayer({
  src,
  title = "Generated Video",
  className = "",
}: ChatVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const updateDimensions = useCallback((video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: video.videoWidth / video.videoHeight,
      });
    }
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
  }, []);

  // Toggle Play / Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video.play().catch(() => {});
      setIsPlaying(true);
      showControlsTemporarily();
    } else {
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  }, [showControlsTemporarily]);

  // Toggle Mute
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Fullscreen
  const toggleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if (
        (container as unknown as { webkitRequestFullscreen?: () => void })
          .webkitRequestFullscreen
      ) {
        (
          container as unknown as { webkitRequestFullscreen: () => void }
        ).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (
        (document as unknown as { webkitExitFullscreen?: () => void })
          .webkitExitFullscreen
      ) {
        (
          document as unknown as { webkitExitFullscreen: () => void }
        ).webkitExitFullscreen();
      }
    }
  }, []);

  // Handle Download via proxy
  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isDownloading) return;

      setIsDownloading(true);
      try {
        const fallbackName = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "video-creative"}.mp4`;
        const cleanFilename =
          src.split("/").pop()?.split("?")[0] || fallbackName;
        const proxyUrl = `/api/download?url=${encodeURIComponent(src)}&filename=${encodeURIComponent(cleanFilename)}`;

        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Download proxy request failed");

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = cleanFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (err) {
        console.error(
          "Video download failed, falling back to direct URL:",
          err,
        );
        window.open(src, "_blank");
      } finally {
        setIsDownloading(false);
      }
    },
    [src, isDownloading, title],
  );

  // Time progress scrubber
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const seekTime = Number(e.target.value);
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= 1 && video.videoWidth > 0) {
      updateDimensions(video);
      setIsLoading(false);
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      updateDimensions(video);
      setIsLoading(false);
    };
    const onCanPlay = () => {
      updateDimensions(video);
      setIsLoading(false);
    };
    const onError = () => {
      setHasError(true);
      setIsLoading(false);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
    };
  }, [src, updateDimensions]);

  if (hasError) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive-tint p-4 text-xs text-destructive font-gothic max-w-md">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span>
          Failed to load video. The link may have expired or is inaccessible.
        </span>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Calculate container bounds to match video dimensions without generic letterboxing
  const maxChatHeight = 480;
  const maxChatWidth = 400;

  let containerStyle: React.CSSProperties = {};

  if (!isFullscreen) {
    if (videoDimensions) {
      const { aspectRatio, width: vWidth, height: vHeight } = videoDimensions;

      if (aspectRatio < 1) {
        // Enforce 9:16 aspect ratio for vertical ad campaigns & reels
        const targetHeight = Math.min(maxChatHeight, 480);
        const targetWidth = Math.round(targetHeight * (9 / 16));
        containerStyle = {
          width: "100%",
          maxWidth: `min(${targetWidth}px, 100%)`,
          aspectRatio: "9 / 16",
        };
      } else {
        // Landscape / Square (e.g. 16:9 widescreen, 1:1 square)
        const targetWidth = Math.min(maxChatWidth, vWidth);
        containerStyle = {
          width: "100%",
          maxWidth: `min(${targetWidth}px, 100%)`,
          aspectRatio: `${vWidth} / ${vHeight}`,
        };
      }
    } else {
      // Default to vertical 9:16 ratio before metadata arrives
      containerStyle = {
        width: "100%",
        maxWidth: "min(270px, 100%)",
        aspectRatio: "9 / 16",
      };
    }
  }

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      className={`not-prose group relative select-none font-gothic overflow-hidden transition-all duration-200 flex items-center justify-center bg-foreground ${
        isFullscreen
          ? "fixed inset-0 z-50 w-full h-full max-w-none max-h-none rounded-none border-none"
          : `my-3 rounded-xl border border-foreground/80 shadow-md ${className}`
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        title={title}
        aria-label={title}
        playsInline
        preload="metadata"
        onClick={() => {
          if (isPlaying) {
            if (showControls) {
              setShowControls(false);
            } else {
              showControlsTemporarily();
            }
          } else {
            togglePlay();
          }
        }}
        onLoadedMetadata={(e) => {
          updateDimensions(e.currentTarget);
          setIsLoading(false);
        }}
        onCanPlay={(e) => {
          updateDimensions(e.currentTarget);
          setIsLoading(false);
        }}
        style={{ margin: 0, padding: 0 }}
        className={`block cursor-pointer m-0 p-0 ${
          isFullscreen
            ? "w-full h-full object-contain"
            : "w-full h-full object-cover"
        }`}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 backdrop-blur-sm pointer-events-none z-10">
          <Loader2 className="w-7 h-7 animate-spin text-background/80" />
        </div>
      )}

      {/* Big Center Play Overlay Button when paused */}
      {!isLoading && !isPlaying && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-foreground/20 hover:bg-foreground/30 transition-all cursor-pointer z-10"
        >
          <button
            type="button"
            aria-label="Play video"
            className="flex h-14 w-14 items-center justify-center rounded-none bg-foreground/70 backdrop-blur-md text-background shadow-xl hover:scale-110 active:scale-95 transition-all border border-background/20"
          >
            <Play className="h-6 w-6 ml-1 fill-background" />
          </button>
        </div>
      )}

      {/* Floating Download Button (Top Right) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-2.5 right-2.5 z-20 transition-opacity duration-200 ${
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          title={`Download ${title}`}
          aria-label={`Download ${title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/60 backdrop-blur-md text-background hover:text-background hover:bg-foreground/80 transition-all border border-background/10 shadow-lg active:scale-95 disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Bottom Controls Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-foreground/90 via-foreground/60 to-transparent p-3 pt-6 z-20 transition-opacity duration-200 ${
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Progress Bar / Scrubber */}
        <div className="relative mb-2 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-background/20 rounded-lg appearance-none cursor-pointer accent-background hover:h-1.5 transition-all"
            style={{
              background: `linear-gradient(to right, var(--background) ${progressPercent}%, color-mix(in srgb, var(--background) 20%, transparent) ${progressPercent}%)`,
            }}
          />
        </div>

        {/* Action buttons row */}
        <div className="flex items-center justify-between text-xs text-background/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-background/10 transition-colors text-background"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-background" />
              ) : (
                <Play className="h-4 w-4 fill-background ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-background/10 transition-colors text-background/80 hover:text-background"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-destructive-strong" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>

            <span className="text-[11px] text-background/60 tabular-nums">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded hover:bg-background/10 transition-colors text-background/80 hover:text-background"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
