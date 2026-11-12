"use client";

import React, { useState, useRef, useEffect } from "react";
import { Maximize2, Loader2, ImageOff } from "lucide-react";
import { useAttachmentLightbox } from "./lightbox";
import {
  ASPECT_CONFIG,
  getNearestAspectRatio,
  normalizeAspectRatio,
  type StandardAspectRatio,
} from "./image-utils";

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
  const { openLightbox } = useAttachmentLightbox();

  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [aspect, setAspect] = useState<StandardAspectRatio>(() =>
    normalizeAspectRatio(aspectRatio) || "1/1",
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
  const widthClass = config.cardWidthClass;

  const handleClick = () => {
    if (src && !hasError) {
      openLightbox([{ src, alt, aspectRatio: aspect }], 0);
    }
  };

  return (
    <div
      data-system-image=""
      onClick={handleClick}
      className={`group relative overflow-hidden rounded-none sm:rounded-none border border-border bg-muted hover:border-input transition-all cursor-pointer select-none my-1 ${config.aspectClass} ${widthClass} ${className}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary z-10 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-muted text-muted-foreground">
          <ImageOff className="w-8 h-8 mb-1" />
          <span className="text-xs">Failed to load</span>
        </div>
      ) : (
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
          } rounded-none sm:rounded-none transition-opacity duration-200 ${
            fit === "cover" ? "group-hover:scale-[1.01]" : ""
          } ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      <div className="absolute top-2.5 right-2.5 p-1.5 rounded-none bg-foreground/60 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
        <Maximize2 size={13} />
      </div>
    </div>
  );
}
