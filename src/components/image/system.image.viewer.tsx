"use client";

import React, { useState, useRef, useEffect } from "react";
import { Maximize2, Loader2, ImageOff } from "lucide-react";
import { useModalStore } from "@/store/modal.store";
import {
  ASPECT_CONFIG,
  getNearestAspectRatio,
  parseInitialAspectRatio,
  type StandardAspectRatio,
} from "./utils";

export interface GenerativeUIImageProps {
  src: string;
  alt?: string;
  aspectRatio?: string;
  className?: string;
  fit?: "cover" | "contain" | "fill";
}

export function GenerativeUIImage({
  src,
  alt = "Image",
  aspectRatio,
  className = "",
  fit = "contain",
}: GenerativeUIImageProps) {
  const openLightbox = useModalStore((s) => s.openLightbox);

  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [aspect, setAspect] = useState<StandardAspectRatio>(() =>
    parseInitialAspectRatio(aspectRatio),
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete) {
      if (el.naturalWidth > 0) {
        applyDimensions(el);
      } else {
        setIsLoading(false);
        setHasError(true);
      }
    }
  }, [src]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) {
        applyDimensions(el);
      } else {
        setIsLoading(false);
        setHasError(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [isLoading, src]);

  const applyDimensions = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      if (!aspectRatio) {
        setAspect(getNearestAspectRatio(img.naturalWidth, img.naturalHeight));
      }
    }
    setIsLoading(false);
    setHasError(false);
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    applyDimensions(e.currentTarget);
  };

  const config = ASPECT_CONFIG[aspect];
  const widthClass = config.maxWidthClass;

  const handleClick = () => {
    if (src && !hasError) {
      openLightbox([{ src, alt, aspectRatio: aspect }], 0);
    }
  };

  return (
    <div
      data-system-image=""
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border/90 bg-muted hover:border-border-strong transition-all cursor-pointer select-none shadow-2xs my-1 ${config.aspectClass} ${widthClass} ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted z-10 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin text-muted-2" />
        </div>
      )}

      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-muted text-muted-2">
          <ImageOff className="w-8 h-8 mb-1" />
          <span className="text-xs">Failed to load</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={(el) => {
            imgRef.current = el;
            if (el && el.complete && el.naturalWidth > 0) {
              applyDimensions(el);
            }
          }}
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          onLoad={handleLoad}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-full ${
            fit === "cover"
              ? "object-cover"
              : fit === "fill"
                ? "object-fill"
                : "object-contain"
          } rounded-xl sm:rounded-2xl transition-opacity duration-200 group-hover:scale-[1.01] ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      <div className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-foreground/60 text-background opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-opacity z-20 pointer-events-none shadow-sm">
        <Maximize2 size={13} />
      </div>
    </div>
  );
}
