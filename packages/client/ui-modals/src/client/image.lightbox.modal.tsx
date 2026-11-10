"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@openai-harness/client-ui-primitives";
import { useModalStore } from "@openai-harness/client-ui-session";
import { gatewayFetch } from "./gateway";

export interface LightboxImage {
  src: string;
  alt: string;
  aspectRatio?: string;
}

export type Image = LightboxImage;

export interface ImageboxModalProps {
  isOpen?: boolean;
  images?: Image[];
  initialIndex?: number;
  onClose?: () => void;
}

/**
 * ImageboxModal:
 * Can be rendered globally once (e.g. in AppShell) reading from useModalStore,
 * or used with direct props.
 *
 * The shared `Modal` primitive supplies the portal and focus restore; the
 * lightbox keeps its original full-bleed stage, navigation, and thumbnails.
 */
export function ImageboxModal(props: ImageboxModalProps = {}) {
  const storeLightbox = useModalStore((s) => s.lightbox);
  const storeClose = useModalStore((s) => s.closeLightbox);

  const isOpen =
    props.isOpen !== undefined ? props.isOpen : storeLightbox.isOpen;
  const images =
    props.images !== undefined ? props.images : storeLightbox.images;
  const initialIndex =
    props.initialIndex !== undefined ? props.initialIndex : storeLightbox.index;
  const onClose = props.onClose !== undefined ? props.onClose : storeClose;

  return (
    <Modal
      open={isOpen && images.length > 0}
      onClose={onClose}
      title="Image preview"
      headless
      className="max-h-none! w-auto! max-w-none! border-0! bg-transparent! p-0!"
    >
      {images.length > 0 && (
        <ImageboxModalContent
          images={images}
          initialIndex={initialIndex}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function ImageboxModalContent({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: Image[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const lightboxImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    setIsImageLoading(true);
  }, [initialIndex]);

  useEffect(() => {
    const el = lightboxImgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setIsImageLoading(false);
    }
  }, [currentIndex, images]);

  useEffect(() => {
    if (!isImageLoading) return;
    const timer = setTimeout(() => {
      setIsImageLoading(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isImageLoading, currentIndex]);

  const handleNext = () => {
    if (images.length <= 1) return;
    setIsImageLoading(true);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    if (images.length <= 1) return;
    setIsImageLoading(true);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      diff > 0 ? handleNext() : handlePrev();
    }
    touchStartX.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose, handleNext, handlePrev]);

  const currentImage = images[currentIndex] || images[0];

  const handleDownload = async () => {
    if (!currentImage?.src) return;
    try {
      toast.info("Downloading image...");
      const ext =
        currentImage.src
          .split("?")[0]
          .match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)?.[0] || ".png";
      const filename = `${(
        currentImage.alt || `image-${currentIndex + 1}`
      ).replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`;

      const res = await gatewayFetch(
        `/api/download?url=${encodeURIComponent(
          currentImage.src,
        )}&filename=${encodeURIComponent(filename)}`,
      );
      if (!res.ok) throw new Error();

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Image downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  if (!currentImage) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-foreground/90 animate-in fade-in duration-200 select-none p-2 sm:p-6"
    >
      {/* Top Header */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full flex items-center justify-between z-20 max-w-7xl mx-auto py-2 px-2"
      >
        <span className="text-sm text-primary-foreground font-gothic truncate max-w-md hidden sm:inline-block">
          {currentImage.alt || `Image ${currentIndex + 1} of ${images.length}`}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            title="Download Image"
            className="p-2 rounded-none text-muted-foreground hover:text-primary-foreground bg-foreground/80 hover:bg-brand-surface border border-brand-border transition-colors cursor-pointer"
          >
            <Download size={18} />
          </button>
          <a
            href={currentImage.src}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in new tab"
            className="p-2 rounded-none text-muted-foreground hover:text-primary-foreground bg-foreground/80 hover:bg-brand-surface border border-brand-border transition-colors"
          >
            <ExternalLink size={18} />
          </a>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-2 rounded-none text-muted-foreground hover:text-primary-foreground bg-foreground/80 hover:bg-brand-surface border border-brand-border transition-colors ml-1 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchStartX.current = e.targetTouches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 w-full max-w-7xl flex items-center justify-center my-auto min-h-0 px-2 sm:px-4"
      >
        {images.length > 1 && (
          <button
            onClick={handlePrev}
            title="Previous (Arrow Left)"
            className="absolute left-2 sm:left-4 z-20 p-2.5 sm:p-3 rounded-none bg-foreground/60 hover:bg-foreground/80 text-primary-foreground/80 hover:text-primary-foreground border border-primary-foreground/10 transition-all hover:scale-105 cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {isImageLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
          </div>
        )}

        <img
          ref={(el) => {
            lightboxImgRef.current = el;
            if (el && el.complete && el.naturalWidth > 0) {
              setIsImageLoading(false);
            }
          }}
          key={currentImage.src}
          src={currentImage.src}
          alt={currentImage.alt || "Lightbox view"}
          decoding="async"
          onLoad={() => setIsImageLoading(false)}
          onError={() => setIsImageLoading(false)}
          className={`max-h-[72vh] max-w-full object-contain rounded-none border border-primary-foreground/10 transition-opacity duration-200 ${
            isImageLoading ? "opacity-0" : "opacity-100"
          }`}
        />

        {images.length > 1 && (
          <button
            onClick={handleNext}
            title="Next (Arrow Right)"
            className="absolute right-2 sm:right-4 z-20 p-3 rounded-none bg-foreground/60 hover:bg-foreground/80 text-primary-foreground/80 hover:text-primary-foreground border border-primary-foreground/10 transition-all hover:scale-105 cursor-pointer"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl mx-auto flex items-center justify-center gap-2 py-2 overflow-x-auto z-20"
        >
          {images.map((img, idx) => (
            <button
              key={`${img.src}-${idx}`}
              onClick={() => {
                if (idx !== currentIndex) {
                  setIsImageLoading(true);
                  setCurrentIndex(idx);
                }
              }}
              className={`relative h-14 w-14 rounded-none overflow-hidden shrink-0 transition-all cursor-pointer ${
                idx === currentIndex
                  ? "ring-2 ring-success scale-105 opacity-100 border border-primary-foreground/20"
                  : "opacity-40 hover:opacity-80 border border-brand-border"
              }`}
            >
              <img
                src={img.src}
                alt={img.alt || `Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const ImageLightboxModal = ImageboxModal;
