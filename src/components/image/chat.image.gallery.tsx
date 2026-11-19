"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ImageboxModal, Image } from "@/components/modals/image.lightbox.modal";
import { Maximize2, Loader2, ImageOff } from "lucide-react";

interface ChatImageGalleryProps {
  images: Image[];
}

function ImageItem({
  image,
  onClick,
  className = "",
  overlayText,
  isSingle = false,
}: {
  image: Image;
  onClick: () => void;
  className?: string;
  overlayText?: string;
  isSingle?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node;
    if (node) {
      if (node.complete && node.naturalWidth > 0) {
        setIsLoading(false);
      } else if (typeof node.decode === "function") {
        node
          .decode()
          .then(() => setIsLoading(false))
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setIsLoading(false);
    }
  }, [image.src]);

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border border-border-strong/80 bg-foreground/60 hover:border-border-strong transition-all cursor-pointer select-none ${
        isSingle ? "w-fit max-w-full" : "w-full"
      } ${isLoading ? "min-w-[min(240px,100%)] min-h-[320px]" : ""} ${className}`}
    >
      {/* Loading Skeleton */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 backdrop-blur-sm z-10 pointer-events-none transition-opacity">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error Fallback */}
      {hasError ? (
        <div className="w-full min-h-[140px] flex flex-col items-center justify-center p-4 bg-foreground/90 text-muted-foreground">
          <ImageOff className="w-8 h-8 mb-1" />
          <span className="text-xs">Failed to load</span>
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={handleRef}
          src={image.src}
          alt={image.alt || "Generated Image"}
          loading="eager"
          decoding="async"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`${
            isSingle
              ? "block w-auto h-auto max-h-[480px] max-w-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
              : "block w-full h-auto max-h-[480px] object-cover rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
          }`}
        />
      )}

      {/* Hover Expand Icon Badge */}
      {!overlayText && (
        <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-foreground/60 text-background opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-opacity z-20 pointer-events-none">
          <Maximize2 size={13} />
        </div>
      )}

      {/* WhatsApp-style +N Overlay */}
      {overlayText && (
        <div className="absolute inset-0 bg-foreground/55 backdrop-blur-[2px] flex items-center justify-center z-20 transition-colors group-hover:bg-foreground/45">
          <span className="font-display text-3xl sm:text-4xl font-bold text-background tracking-tight drop-shadow-lg">
            {overlayText}
          </span>
        </div>
      )}
    </div>
  );
}

export function ImageGallery({ images }: ChatImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!images || images.length === 0) return null;

  const openLightboxAt = (index: number) => {
    setSelectedIdx(index);
    setLightboxOpen(true);
  };

  const count = images.length;

  return (
    <>
      <div
        className={`my-3 transition-all duration-300 ease-out ${
          count === 1
            ? "w-fit max-w-full"
            : "w-full max-w-full sm:max-w-[520px]"
        }`}
      >
        {/* ── Case 1: Single Image ─────────────────────────────────── */}
        {count === 1 && (
          <div className="w-fit max-w-full transition-all duration-300 ease-out">
            <ImageItem
              image={images[0]}
              onClick={() => openLightboxAt(0)}
              isSingle
            />
          </div>
        )}

        {/* ── Case 2: Exactly 2 Images (Side-by-Side Free-Form) ────── */}
        {count === 2 && (
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 w-full items-start transition-all duration-300 ease-out [&>*]:min-w-0">
            <ImageItem image={images[0]} onClick={() => openLightboxAt(0)} />
            <ImageItem image={images[1]} onClick={() => openLightboxAt(1)} />
          </div>
        )}

        {/* ── Case 3: More Than 2 Images (WhatsApp Style: 2 Cards with +N Overlay on 2nd) ── */}
        {count > 2 && (
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 w-full items-start transition-all duration-300 ease-out [&>*]:min-w-0">
            <ImageItem image={images[0]} onClick={() => openLightboxAt(0)} />
            <ImageItem
              image={images[1]}
              onClick={() => openLightboxAt(1)}
              overlayText={`+${count - 2}`}
            />
          </div>
        )}
      </div>

      <ImageboxModal
        isOpen={lightboxOpen}
        images={images}
        initialIndex={selectedIdx}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
