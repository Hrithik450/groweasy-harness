"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { formatDuration, getNearestAspectRatio } from "./video-utils";

export interface UserVideoViewerProps {
  src: string;
  title?: string;
  className?: string;
}

export function UserVideoViewer({
  src,
  title = "User video",
  className = "",
}: UserVideoViewerProps) {
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
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

  const updateMeta = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) {
      setDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
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

  if (hasError) {
    return (
      <div className="flex items-center gap-2 rounded-none border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive max-w-[280px]">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="truncate">Failed to load video</span>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const { ratioString, maxWidth } = getNearestAspectRatio(
    dimensions?.width,
    dimensions?.height,
  );

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
      className={`group relative select-none overflow-hidden transition-all duration-200 flex items-center justify-center bg-foreground ${
        isFullscreen
          ? "fixed inset-0 z-50 w-full h-full max-w-none max-h-none rounded-none border-none"
          : `rounded-none sm:rounded-none border border-border ${className}`
      }`}
    >
      <video
        ref={videoRef}
        src={src}
        title={title}
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
        onWaiting={() => setIsLoading(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          if (isLoading) setIsLoading(false);
        }}
        onLoadedMetadata={(e) => updateMeta(e.currentTarget)}
        onCanPlay={(e) => updateMeta(e.currentTarget)}
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
          <Loader2 className="w-6 h-6 animate-spin text-primary-foreground/80" />
        </div>
      )}

      {!isPlaying && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-foreground/25 hover:bg-foreground/35 transition-all cursor-pointer z-10"
        >
          <button
            type="button"
            aria-label="Play video"
            className="flex h-11 w-11 items-center justify-center rounded-none bg-foreground/60 text-primary-foreground hover:scale-105 active:scale-95 transition-all border border-primary-foreground/20"
          >
            <Play className="h-5 w-5 ml-0.5 fill-primary-foreground" />
          </button>
        </div>
      )}

      {/* Mini Controls Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-foreground/80 via-foreground/50 to-transparent p-2.5 pt-4 z-20 transition-opacity duration-200 ${
          showControls || !isPlaying
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="relative mb-1.5 flex items-center">
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
            className="w-full h-1 bg-card/20 rounded-none appearance-none cursor-pointer accent-primary-foreground transition-all"
            style={{
              background: `linear-gradient(to right, var(--card) ${progressPercent}%, color-mix(in srgb, var(--primary-foreground) 20%, transparent) ${progressPercent}%)`,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-primary-foreground/90">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-6 w-6 items-center justify-center rounded-none hover:bg-card/10 transition-colors"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5 fill-primary-foreground" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-primary-foreground ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="flex h-6 w-6 items-center justify-center rounded-none hover:bg-card/10 transition-colors text-primary-foreground/80 hover:text-primary-foreground"
            >
              {isMuted ? (
                <VolumeX className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
            </button>

            <span className="tabular-nums text-primary-foreground/70">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-6 w-6 items-center justify-center rounded-none hover:bg-card/10 transition-colors text-primary-foreground/80 hover:text-primary-foreground"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
