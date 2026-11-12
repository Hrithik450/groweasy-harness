"use client";

import React, { useState, useRef, useEffect } from "react";
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
import {
  formatDuration,
  getNearestAspectRatio,
  parseAspectRatio,
} from "./video-utils";

export interface VideoPlayerProps {
  src: string;
  title?: string;
  aspectRatio?: string;
  className?: string;
}

export function VideoPlayer({
  src,
  title = "Generated Video",
  aspectRatio,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  };

  useEffect(() => {
    const handleFsChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (video.readyState >= 1) {
        updateMeta(video);
      }
    }
  }, [src]);

  const updateMeta = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) {
      setDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: video.videoWidth / video.videoHeight,
      });
    }
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
    setIsLoading(false);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video.play().catch(() => {});
      setIsPlaying(true);
      setIsLoading(false);
      showControlsTemporarily();
    } else {
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);

    try {
      const fallbackName = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "video-creative"}.mp4`;
      const cleanFilename = src.split("/").pop()?.split("?")[0] || fallbackName;
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
      console.error("Video download failed, opening direct URL:", err);
      window.open(src, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  if (hasError) {
    return (
      <div className="my-3 flex items-center gap-2 rounded-none border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive font-gothic max-w-md">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span>
          Failed to load video. The link may have expired or is inaccessible.
        </span>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const explicitRatio = parseAspectRatio(aspectRatio);
  const { ratioString, maxWidth } =
    explicitRatio ||
    getNearestAspectRatio(dimensions?.width, dimensions?.height);
  const containerStyle: React.CSSProperties = isFullscreen
    ? {}
    : {
        width: "100%",
        maxWidth,
        aspectRatio: ratioString,
      };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      className={`not-prose group relative select-none font-gothic overflow-hidden transition-all duration-200 flex items-center justify-center bg-foreground ${
        isFullscreen
          ? "fixed inset-0 z-50 w-full h-full max-w-none max-h-none rounded-none border-none"
          : `rounded-none border border-border ${className}`
      }`}
    >
      <video
        ref={videoRef}
        src={src}
        title={title}
        aria-label={title}
        playsInline
        preload="metadata"
        onClick={() =>
          isPlaying
            ? showControls
              ? setShowControls(false)
              : showControlsTemporarily()
            : togglePlay()
        }
        onPlay={() => {
          setIsPlaying(true);
          setIsLoading(false);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
        }}
        onWaiting={() => setIsLoading(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          if (isLoading) setIsLoading(false);
        }}
        onLoadedMetadata={(e) => updateMeta(e.currentTarget)}
        onCanPlay={(e) => updateMeta(e.currentTarget)}
        onCanPlayThrough={(e) => updateMeta(e.currentTarget)}
        onSeeked={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
        className={`block cursor-pointer m-0 p-0 ${
          isFullscreen
            ? "w-full h-full object-contain"
            : "w-full h-full object-cover"
        }`}
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/40 pointer-events-none z-10">
          <Loader2 className="w-7 h-7 animate-spin text-primary-foreground" />
        </div>
      )}

      {!isPlaying && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-foreground/20 hover:bg-foreground/30 transition-all cursor-pointer z-10"
        >
          <button
            type="button"
            aria-label="Play video"
            className="flex h-14 w-14 items-center justify-center rounded-none bg-foreground/70 text-primary-foreground hover:scale-110 active:scale-95 transition-all border border-primary-foreground/20"
          >
            <Play className="h-6 w-6 ml-1 fill-primary-foreground" />
          </button>
        </div>
      )}

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
          className="flex h-8 w-8 items-center justify-center rounded-none bg-foreground/60 text-primary-foreground hover:text-primary-foreground hover:bg-foreground/80 transition-all border border-primary-foreground/10 active:scale-95 disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-foreground/90 via-foreground/60 to-transparent p-3 pt-6 z-20 transition-opacity duration-200 ${
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="relative mb-2 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const seekTime = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = seekTime;
              setCurrentTime(seekTime);
            }}
            className="w-full h-1 bg-brand-surface rounded-none appearance-none cursor-pointer accent-primary-foreground hover:h-1.5 transition-all"
            style={{
              background: `linear-gradient(to right, var(--card) ${progressPercent}%, color-mix(in srgb, var(--primary-foreground) 20%, transparent) ${progressPercent}%)`,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-primary-foreground">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-7 w-7 items-center justify-center rounded-none hover:bg-card/10 transition-colors text-primary-foreground"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-primary-foreground" />
              ) : (
                <Play className="h-4 w-4 fill-primary-foreground ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="flex h-7 w-7 items-center justify-center rounded-none hover:bg-card/10 transition-colors text-primary-foreground hover:text-primary-foreground"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-destructive" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>

            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-none hover:bg-card/10 transition-colors text-primary-foreground hover:text-primary-foreground"
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
  );
}
