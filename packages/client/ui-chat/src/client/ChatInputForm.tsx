"use client";

/**
 * Composer input form.
 *
 * Unchanged application behaviour: staged previews, paste/drop intake, size
 * and video-duration checks, attachment upload, send/stop, and keyboard
 * handling. Only the application imports are packaged: the connector store
 * comes from `@openai-harness/client-ui-session`, and the upload receipt is a
 * local structural type.
 *
 * @module @openai-harness/client-ui-chat/client/ChatInputForm
 */

import React, { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowUp,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Square,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConnectorStore } from "@openai-harness/client-ui-session";

/** Upload receipt the attachment endpoint returns for one file. */
interface AttachmentReceipt {
  id: string;
  url: string;
  mimeType?: string;
}

interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;

function checkVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(0);
    };
    video.src = objectUrl;
  });
}

export interface ChatInputFormProps {
  onSubmit: (content: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  isStreaming?: boolean;
  onStop?: () => void;
  /** Attachment upload endpoint; defaults to the application route. */
  uploadUrl?: string;
}

/**
 * Render the composer input.
 * @param props - submission/stop callbacks and streaming state.
 * @returns the attachment-aware input form.
 */
export function ChatInputForm({
  onSubmit,
  placeholder = "Ask or request a marketing campaign...",
  className = "w-full max-w-3xl mx-auto relative",
  isStreaming = false,
  onStop,
  uploadUrl = "/api/attachments/upload",
}: ChatInputFormProps) {
  const stopStream = onStop ?? (() => {});
  const { openModal: openConnectorsModal } = useConnectorStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedAttachment[]>([]);
  const [inputValue, setInputValue] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = inputValue.trim().length > 0 || stagedFiles.length > 0;
  const canSend = !isStreaming && !isUploading && hasContent;
  const isSendOrStopActive = isStreaming || canSend;

  useEffect(() => {
    if (!isMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isMenuOpen]);

  const handleDrag = (e: React.DragEvent, dragging: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(dragging);
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const processFiles = async (files: File[]) => {
    const validFiles = files.filter(
      (f) =>
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
        /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|mov|m4v|avi|mkv)$/i.test(f.name),
    );

    if (validFiles.length === 0) return;

    const accepted: StagedAttachment[] = [];

    for (const file of validFiles) {
      const isVideo =
        file.type.startsWith("video/") ||
        /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name);

      if (!isVideo && file.size > MAX_IMAGE_BYTES) {
        const limitMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
        toast.error(
          `"${file.name}" exceeds maximum allowed image size of ${limitMb}MB.`,
        );
        continue;
      }

      if (isVideo) {
        try {
          const duration = await checkVideoDuration(file);
          if (duration > MAX_VIDEO_DURATION_SECONDS) {
            toast.error(
              `"${file.name}" exceeds the 60-second limit (${Math.round(duration)}s). Please upload a video under 60 seconds.`,
            );
            continue;
          }
        } catch (err) {
          console.warn("[ChatInputForm] Video duration check failed:", err);
        }
      }

      accepted.push({
        file: file,
        previewUrl: URL.createObjectURL(file),
        id: `stage_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      });
    }

    if (accepted.length > 0) {
      setStagedFiles((prev) => [...prev, ...accepted]);
    }
  };

  const handleFinalSubmit = async (
    e?: React.FormEvent | React.KeyboardEvent,
  ) => {
    if (e) e.preventDefault();
    if (isStreaming || isUploading || !hasContent) return;

    const contentToSend = inputValue.trim();
    const filesToUpload = [...stagedFiles];

    let uploadedAttachments: AttachmentReceipt[] = [];

    if (filesToUpload.length > 0) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        filesToUpload.forEach((s) => formData.append("files", s.file));
        formData.append("storage", "artifact");

        const res = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Upload failed with status ${res.status}`,
          );
        }

        const data = await res.json();
        uploadedAttachments = data.data || [];
      } catch (err) {
        console.error("[ChatInputForm] Attachment upload failed:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to upload attachments",
        );
        setIsUploading(false);
        return;
      }
    }

    filesToUpload.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    setInputValue("");
    setStagedFiles([]);
    setIsUploading(false);

    const attachmentMarkdown = uploadedAttachments
      .map((att) => {
        if (att.mimeType?.startsWith("image/")) {
          return `![${att.id}](${att.url})`;
        }
        return `[${att.id}](${att.url})`;
      })
      .join("\n");

    const finalContent = [contentToSend, attachmentMarkdown]
      .filter(Boolean)
      .join("\n\n");

    try {
      await onSubmit(finalContent);
    } catch (err) {
      console.error("[ChatInputForm] Submit error:", err);
    }
  };

  return (
    <form onSubmit={handleFinalSubmit} className={className}>
      <input
        type="file"
        ref={fileInputRef}
        multiple
        tabIndex={-1}
        className="hidden"
        aria-hidden="true"
        accept="image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.mov,.webm,.m4v"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />

      <div
        onDragOver={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={(e) => {
          handleDrag(e, false);
          if (e.dataTransfer.files?.length)
            processFiles(Array.from(e.dataTransfer.files));
        }}
        className={`relative flex flex-col bg-card border rounded-none p-2 transition-all ${
          isDragging
            ? "border-input ring-2 ring-ring/10 bg-muted"
            : "border-border hover:border-input focus-within:border-input"
        }`}
      >
        {stagedFiles.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 pb-2">
            {stagedFiles.map((staged) => {
              const isVideo =
                staged.file.type.startsWith("video/") ||
                /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(staged.file.name);

              return (
                <div
                  key={staged.id}
                  className="relative group shrink-0 w-16 h-16 rounded-none overflow-hidden border border-border bg-foreground flex items-center justify-center"
                >
                  {isVideo ? (
                    <>
                      <video
                        src={staged.previewUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 bg-foreground/20 flex items-center justify-center pointer-events-none">
                        <Video className="w-4 h-4 text-primary-foreground" />
                      </div>
                    </>
                  ) : (
                    <img
                      src={staged.previewUrl}
                      alt={staged.file.name}
                      className="w-full h-full object-cover"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeStagedFile(staged.id)}
                    disabled={isUploading}
                    className="absolute top-1 right-1 w-4.5 h-4.5 rounded-none bg-foreground/60 text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground/90 cursor-pointer disabled:opacity-0 z-10"
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-end">
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`h-[36px] w-[36px] flex items-center justify-center rounded-none transition-colors cursor-pointer ${
                isMenuOpen
                  ? "bg-muted text-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Add attachments or tools"
            >
              <Plus
                size={18}
                className={
                  isMenuOpen
                    ? "rotate-45 transition-transform"
                    : "transition-transform"
                }
              />
            </button>

            {isMenuOpen && (
              <div className="absolute bottom-12 left-0 z-40 w-56 max-w-[calc(100vw-2.5rem)] bg-card border border-border rounded-none p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors text-left cursor-pointer"
                >
                  <Paperclip size={15} className="text-muted-foreground" />
                  <span>Add files or photos</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    openConnectorsModal();
                  }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-medium text-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors text-left cursor-pointer"
                >
                  <SlidersHorizontal size={15} className="text-muted-foreground" />
                  <span className="flex-1 font-medium text-foreground">
                    Connectors
                  </span>
                </button>
              </div>
            )}
          </div>

          <TextareaAutosize
            rows={1}
            minRows={1}
            maxRows={8}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData?.files.length) {
                const imageFiles = Array.from(e.clipboardData.files).filter(
                  (f) => f.type.startsWith("image/"),
                );
                if (imageFiles.length > 0) {
                  e.preventDefault();
                  processFiles(imageFiles);
                }
              }
            }}
            onKeyDown={(e) => {
              if (isStreaming && e.key === "Escape") {
                e.preventDefault();
                stopStream();
                return;
              }

              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (canSend) {
                  handleFinalSubmit(e);
                }
              }
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground px-2.5 sm:px-3 py-1.5 text-[15px] leading-6 min-h-[36px] resize-none overflow-y-auto"
          />

          <button
            type={canSend ? "submit" : "button"}
            disabled={!isSendOrStopActive}
            onClick={(e) => {
              if (isStreaming) {
                e.preventDefault();
                stopStream();
              }
            }}
            className={`h-[36px] w-[36px] flex items-center justify-center rounded-none transition-all ml-1 shrink-0 ${
              isSendOrStopActive
                ? "bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer active:scale-95"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}
            title={
              isStreaming
                ? "Stop generating"
                : isUploading
                  ? "Uploading attachments..."
                  : hasContent
                    ? "Send message"
                    : undefined
            }
            aria-label={isStreaming ? "Stop generating" : "Send message"}
          >
            {isStreaming ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
            ) : hasContent ? (
              <ArrowUp size={17} strokeWidth={2.5} />
            ) : (
              <Mic size={16} />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
