"use client";

import React, { useState, useEffect, useRef } from "react";
import { Maximize2, Loader2, ImageOff } from "lucide-react";
import {
  useAttachmentLightbox,
  type MessageImage,
} from "./lightbox";
import {
  ASPECT_CONFIG,
  getNearestAspectRatio,
  normalizeAspectRatio,
  type StandardAspectRatio,
} from "./image-utils";

export interface UserImageItemProps {
  image: MessageImage;
  onClick: () => void;
  className?: string;
  overlayText?: string;
  isSingle?: boolean;
}

export function UserImageItem({
  image,
  onClick,
  overlayText,
  className = "",
  isSingle = false,
}: UserImageItemProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [aspect, setAspect] = useState<StandardAspectRatio>(() =>
    normalizeAspectRatio(image.aspectRatio) || "1/1",
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  const applyDimensions = (img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setAspect(getNearestAspectRatio(img.naturalWidth, img.naturalHeight));
    }
    setIsLoading(false);
    setHasError(false);
  };

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    applyDimensions(e.currentTarget);
  };

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
  }, [image.src]);

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
  }, [isLoading, image.src]);

  const config = ASPECT_CONFIG[aspect];
  const widthClass = isSingle ? config.cardWidthClass : "w-full";

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-none sm:rounded-none border border-border bg-muted hover:border-input transition-all cursor-pointer select-none ${config.aspectClass} ${widthClass} ${className}`}
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
          src={image.src}
          alt={image.alt || "Uploaded image"}
          loading="eager"
          decoding="async"
          onLoad={handleLoad}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-full object-cover rounded-none sm:rounded-none transition-opacity duration-200 group-hover:scale-[1.01] ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {!overlayText && (
        <div className="absolute top-2.5 right-2.5 p-1.5 rounded-none bg-foreground/60 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
          <Maximize2 size={13} />
        </div>
      )}

      {overlayText && (
        <div className="absolute inset-0 bg-foreground/60-[2px] flex items-center justify-center z-20 transition-colors group-hover:bg-foreground/50">
          <span className="font-display text-2xl sm:text-3xl font-bold text-primary-foreground tracking-tight">
            {overlayText}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * UserImageGallery:
 * Renders user uploaded images in a compact row (max 3 images).
 * Extra images beyond 3 are cleanly indicated with a +N badge on the 3rd tile.
 */
export function UserImageGallery({ images }: { images: MessageImage[] }) {
  const { openLightbox } = useAttachmentLightbox();

  if (!images || images.length === 0) return null;
  const count = images.length;
  const visibleImages = count > 3 ? images.slice(0, 3) : images;
  const gridCols =
    count === 1 ? "grid-cols-1" : count === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="w-full flex justify-end transition-all duration-300 ease-out">
      {count === 1 ? (
        <UserImageItem
          image={images[0]}
          onClick={() => openLightbox(images, 0)}
          isSingle
        />
      ) : (
        <div
          className={`grid ${gridCols} gap-2 w-full max-w-[360px] sm:max-w-[420px] items-start`}
        >
          {visibleImages.map((img, idx) => (
            <UserImageItem
              key={`user-img-${idx}-${img.src || idx}`}
              image={img}
              onClick={() => openLightbox(images, idx)}
              overlayText={idx === 2 && count > 3 ? `+${count - 2}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
