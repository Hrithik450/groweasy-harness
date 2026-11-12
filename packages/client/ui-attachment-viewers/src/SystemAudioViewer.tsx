"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  Music,
} from "lucide-react";
import { formatDuration } from "./audio-utils";

export interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
}

export function AudioPlayer({
  src,
  title = "Audio Track",
  className = "",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

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

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio
        .play()
        .catch((err) => console.warn("[AudioPlayer] Playback error:", err));
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleDownload = async () => {
    if (!src || isDownloading) return;
    try {
      setIsDownloading(true);
      const res = await fetch(src);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "audio"}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("[AudioPlayer] Download failed:", err);
      window.open(src, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`w-full flex flex-col gap-3 p-3.5 sm:p-4 rounded-none border border-border bg-card ${className}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-brand/10 text-brand">
            <Music className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-foreground truncate">
            {title}
          </span>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-label="Download audio"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
          ) : (
            <Download className="w-3.5 h-3.5" />
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
          className="w-full h-1.5 bg-muted rounded-none appearance-none cursor-pointer accent-accent transition-all focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--foreground) ${progressPercent}%, var(--border) ${progressPercent}%)`,
          }}
        />
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-7 w-7 items-center justify-center rounded-none bg-brand text-primary-foreground hover:bg-brand-hover transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-foreground" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-primary-foreground" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-primary-foreground ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded-none hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
