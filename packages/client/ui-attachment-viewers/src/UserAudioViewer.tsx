"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Loader2,
  Music,
  AlertCircle,
} from "lucide-react";
import { formatDuration } from "./audio-utils";

export interface UserAudioViewerProps {
  src: string;
  title?: string;
  className?: string;
}

export function UserAudioViewer({
  src,
  title = "Audio note",
  className = "",
}: UserAudioViewerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleError = () => {
      setHasError(true);
      setIsLoading(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("error", handleError);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  if (hasError) {
    return (
      <div className="flex items-center gap-2 rounded-none border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive max-w-[280px]">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="truncate">Failed to load audio</span>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`w-full max-w-[320px] sm:max-w-[360px] flex flex-col gap-3 p-3.5 sm:p-4 rounded-none bg-brand text-primary-foreground select-none ${className}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-card/15 text-primary-foreground">
            <Music className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium text-primary-foreground/95 truncate">
            {title}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none text-primary-foreground/70 hover:text-primary-foreground hover:bg-card/10 transition-colors"
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Scrubber Range */}
      <div className="relative flex items-center w-full py-1.5 my-0.5">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => {
            const seekTime = Number(e.target.value);
            if (audioRef.current) audioRef.current.currentTime = seekTime;
            setCurrentTime(seekTime);
          }}
          className="w-full h-1 bg-card/20 rounded-none appearance-none cursor-pointer accent-primary-foreground transition-all focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--card) ${progressPercent}%, color-mix(in srgb, var(--primary-foreground) 20%, transparent) ${progressPercent}%)`,
          }}
        />
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between text-xs text-primary-foreground/90 pt-0.5">
        <button
          type="button"
          onClick={togglePlay}
          className="flex h-7 w-7 items-center justify-center rounded-none bg-card text-brand hover:bg-card/90 transition-all active:scale-95"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-brand" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-brand ml-0.5" />
          )}
        </button>

        <span className="text-[11px] font-mono text-primary-foreground/80 tabular-nums">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
