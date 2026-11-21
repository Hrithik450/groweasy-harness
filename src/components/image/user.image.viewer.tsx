"use client";

import React, { useState, useEffect, useRef } from "react";
import { Maximize2, Loader2, ImageOff } from "lucide-react";
import type { Image } from "@/components/modals/image.lightbox.modal";
import { useModalStore } from "@/store/modal.store";

export interface UserImageItemProps {
  image: Image;
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
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  // Immediate detection for cached images
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete) {
      if (el.naturalWidth > 0) {
        setIsLoading(false);
      } else {
        setIsLoading(false);
        setHasError(true);
      }
    }
  }, [image.src]);

  // Fallback safety timeout so loaders never hang
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) {
        setIsLoading(false);
      } else {
        setIsLoading(false);
        setHasError(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [isLoading, image.src]);

  // Fixed, small card: the asset fits inside without cropping or resizing it.
  const sizeClass = isSingle ? "w-28 h-28" : "w-24 h-24";

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border border-border/90 bg-muted hover:border-border-strong transition-all cursor-pointer select-none shadow-xs ${sizeClass} ${className}`}
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
          ref={imgRef}
          src={image.src}
          alt={image.alt || "Uploaded image"}
          loading="eager"
          decoding="async"
          onLoad={handleLoad}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-full object-contain rounded-xl transition-opacity duration-200 ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
        />
      )}

      {!overlayText && (
        <div className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-foreground/60 text-background opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-opacity z-20 pointer-events-none shadow-sm">
          <Maximize2 size={13} />
        </div>
      )}

      {overlayText && (
        <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px] flex items-center justify-center z-20 transition-colors group-hover:bg-foreground/50">
          <span className="font-display text-lg sm:text-xl font-bold text-background tracking-tight drop-shadow-lg">
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
export function UserImageGallery({ images }: { images: Image[] }) {
  const openLightbox = useModalStore((s) => s.openLightbox);

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
        <div className={`grid ${gridCols} gap-2 w-fit items-start`}>
          {visibleImages.map((img, idx) => (
            <UserImageItem
              key={idx}
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
