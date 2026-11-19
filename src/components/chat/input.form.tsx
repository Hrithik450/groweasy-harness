"use client";

import React, { useState, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import {
  Plus,
  Mic,
  Loader2,
  Paperclip,
  SlidersHorizontal,
  X,
  Square,
} from "lucide-react";
import { useConnectorStore } from "@/store/connector.store";
import { toast } from "sonner";

interface PendingAttachment {
  id: string;
  filename: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ChatInputFormProps {
  inputValue: string;
  setInputValue: (val: string) => void;
  onSubmit: (
    e: React.FormEvent | React.KeyboardEvent,
    receiptIds: string[],
  ) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;
  onStop?: () => void;
  isBlocked?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInputForm({
  inputValue,
  setInputValue,
  onSubmit,
  onKeyDown,
  isStreaming,
  onStop,
  isBlocked = false,
  placeholder = "Message Chief",
  className = "w-full max-w-3xl mx-auto relative",
}: ChatInputFormProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // Names show immediately, so an upload never reads as a bare spinner.
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload on pick, keep the receipt until the message is sent.
  const handleFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    setUploadingNames(Array.from(files).map((file) => file.name));
    try {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      const response = await fetch("/api/attachments/upload", {
        method: "POST",
        body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          (isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Upload failed") as string,
        );
      }
      const receipts =
        isRecord(payload) && Array.isArray(payload.data)
          ? (payload.data as PendingAttachment[])
          : [];
      setPending((current) => [...current, ...receipts]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingNames([]);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = (e: React.FormEvent | React.KeyboardEvent): void => {
    const receiptIds = pending.map((item) => item.id);
    onSubmit(e, receiptIds);
    setPending([]);
  };

  const openConnectorsModal = useConnectorStore((state) => state.openModal);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <form
      onSubmit={(e) => {
        if (isBlocked) {
          e.preventDefault();
          toast.info("Please complete the questions above to continue.");
          return;
        }
        send(e);
      }}
      className={className}
    >
      <input
        multiple
        type="file"
        ref={fileRef}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {(pending.length > 0 || uploadingNames.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          {uploadingNames.map((name) => (
            <span
              key={`uploading-${name}`}
              className="inline-flex items-center gap-1.5 max-w-[220px] bg-secondary text-foreground border border-border text-[11.5px] px-2 py-1"
            >
              <Loader2
                size={12}
                className="animate-spin text-muted-foreground shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">{name}</span>
            </span>
          ))}

          {pending.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1.5 max-w-[220px] bg-secondary text-foreground border border-border text-[11.5px] px-2 py-1"
            >
              <span className="truncate">{item.filename}</span>
              <button
                type="button"
                title="Remove"
                onClick={() =>
                  setPending((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )
                }
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end bg-card border border-border hover:border-input focus-within:border-input rounded-none pl-2 pr-2 py-2 transition-colors relative min-h-[52px]">
        {/* Action Menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`h-[36px] w-[36px] flex items-center justify-center rounded-none transition-colors flex-shrink-0 cursor-pointer ${
              isMenuOpen
                ? "bg-muted text-foreground"
                : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Add content or connectors"
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
                  fileRef.current?.click();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-gothic text-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors text-left cursor-pointer"
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
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-gothic text-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors text-left cursor-pointer"
              >
                <SlidersHorizontal
                  size={15}
                  className="text-muted-foreground"
                />
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
          onKeyDown={(e) => {
            if (isStreaming && e.key === "Escape") {
              e.preventDefault();
              onStop?.();
              return;
            }
            if (
              !e.nativeEvent.isComposing &&
              (isBlocked || isStreaming) &&
              e.key === "Enter" &&
              !e.shiftKey
            ) {
              e.preventDefault();
              if (isBlocked) {
                toast.info("Please complete the questions above to continue.");
              }
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
              return;
            }
            onKeyDown(e);
          }}
          placeholder={
            isBlocked
              ? "Please complete the questions above to continue..."
              : placeholder
          }
          className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none text-foreground placeholder:text-muted-foreground px-2.5 sm:px-4 py-1.5 text-[16px] sm:text-[15px] leading-6 min-h-[36px] resize-none overflow-y-auto"
          style={{
            boxShadow: "none",
            border: "none",
            outline: "none",
            WebkitBoxShadow: "none",
            height: 36,
          }}
        />

        <button
          type={
            !isStreaming &&
            (inputValue.trim() || pending.length > 0) &&
            !isBlocked
              ? "submit"
              : "button"
          }
          disabled={!isStreaming && isBlocked}
          onClick={(e) => {
            if (isStreaming) {
              e.preventDefault();
              onStop?.();
              return;
            }
            if (isBlocked) {
              e.preventDefault();
              toast.info("Please complete the questions above to continue.");
            }
          }}
          className={`h-[36px] w-[36px] flex items-center justify-center rounded-none transition-all ml-1 flex-shrink-0 ${
            isStreaming
              ? "bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer active:scale-95"
              : isBlocked
                ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-40"
                : "bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer active:scale-95"
          }`}
          title={
            isStreaming
              ? "Stop generating"
              : isBlocked
                ? "Please complete the questions above to continue"
                : undefined
          }
          aria-label={isStreaming ? "Stop generating" : "Send message"}
        >
          {isStreaming ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : inputValue.trim() || pending.length > 0 ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          ) : (
            <Mic size={16} />
          )}
        </button>
      </div>
    </form>
  );
}
