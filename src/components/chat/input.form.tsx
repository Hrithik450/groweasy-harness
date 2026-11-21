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
import {
  useAudioRecorder,
  type AudioRecording,
} from "@/hooks/use.audio.recorder";
import { toast } from "sonner";
import { AudioVisualizer } from "./audio.visualizer";

interface PendingAttachment {
  id: string;
  filename: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Dictation lands in the draft; it never submits the turn. */
function appendTranscript(existing: string, transcript: string): string {
  const next = transcript.trim();
  if (!next) return existing;
  const base = existing.trimEnd();
  return base ? `${base} ${next}` : next;
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef(inputValue);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  inputValueRef.current = inputValue;

  const handleRecordingComplete = async (
    recording: AudioRecording,
  ): Promise<void> => {
    transcribeAbortRef.current?.abort();
    const abort = new AbortController();
    transcribeAbortRef.current = abort;
    setIsTranscribing(true);

    try {
      const extension = /mp4|m4a/.test(recording.mimeType)
        ? "mp4"
        : recording.mimeType.includes("ogg")
          ? "ogg"
          : "webm";
      const body = new FormData();
      body.append("audio", recording.blob, `voice.${extension}`);

      const response = await fetch("/api/audio/transcribe", {
        method: "POST",
        body,
        signal: abort.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not transcribe audio. Please try again.",
        );
      }

      const text =
        isRecord(payload) &&
        isRecord(payload.data) &&
        typeof payload.data.text === "string"
          ? payload.data.text.trim()
          : "";
      if (!text) {
        toast.info("No speech detected. Please try again.");
        return;
      }

      setInputValue(appendTranscript(inputValueRef.current, text));
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      if (abort.signal.aborted) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not transcribe audio. Please try again.",
      );
    } finally {
      if (transcribeAbortRef.current === abort) {
        transcribeAbortRef.current = null;
      }
      setIsTranscribing(false);
    }
  };

  const recorder = useAudioRecorder({
    onError: (message) => toast.error(message),
    onRecordingComplete: (recording) => {
      void handleRecordingComplete(recording);
    },
  });

  useEffect(() => {
    return () => {
      transcribeAbortRef.current?.abort();
      recorder.cancel();
    };
  }, [recorder.cancel]);

  useEffect(() => {
    if (!recorder.isRecording) return;

    const cancel = (): void => recorder.cancel();
    const onVisibility = (): void => {
      if (document.hidden) cancel();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };

    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKey);
    };
  }, [recorder.isRecording, recorder.cancel]);

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

        {recorder.isRecording ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1 sm:px-2 min-h-[36px]">
            <AudioVisualizer stream={recorder.stream} />
            <button
              type="button"
              onClick={recorder.cancel}
              title="Cancel recording"
              aria-label="Cancel recording"
              className="h-[24px] w-[24px] shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <TextareaAutosize
            ref={textareaRef}
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
                (isBlocked || isStreaming || isTranscribing) &&
                e.key === "Enter" &&
                !e.shiftKey
              ) {
                e.preventDefault();
                if (isBlocked) {
                  toast.info(
                    "Please complete the questions above to continue.",
                  );
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
              isTranscribing
                ? "Transcribing…"
                : isBlocked
                  ? "Please complete the questions above to continue..."
                  : placeholder
            }
            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none text-foreground placeholder:text-muted-foreground placeholder:truncate px-2.5 sm:px-4 py-1.5 text-[13.5px] sm:text-[15px] leading-5 sm:leading-6 min-h-[36px] resize-none overflow-y-auto"
            style={{
              boxShadow: "none",
              border: "none",
              outline: "none",
              WebkitBoxShadow: "none",
              height: 36,
            }}
          />
        )}

        <button
          type={
            !isStreaming &&
            !isTranscribing &&
            !recorder.isRecording &&
            (inputValue.trim() || pending.length > 0) &&
            !isBlocked
              ? "submit"
              : "button"
          }
          disabled={isTranscribing || (!isStreaming && isBlocked)}
          onClick={(e) => {
            if (isStreaming) {
              e.preventDefault();
              onStop?.();
              return;
            }
            if (isTranscribing) {
              e.preventDefault();
              return;
            }
            if (recorder.isRecording) {
              e.preventDefault();
              recorder.stop();
              return;
            }
            if (isBlocked) {
              e.preventDefault();
              toast.info("Please complete the questions above to continue.");
              return;
            }
            if (!inputValue.trim() && pending.length === 0) {
              e.preventDefault();
              void recorder.start();
            }
          }}
          className={`h-[36px] w-[36px] flex items-center justify-center rounded-none transition-all ml-1 flex-shrink-0 ${
            isStreaming || recorder.isRecording
              ? "bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer active:scale-95"
              : isTranscribing
                ? "bg-secondary text-muted-foreground cursor-wait"
                : isBlocked
                  ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-40"
                  : "bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer active:scale-95"
          }`}
          title={
            isStreaming
              ? "Stop generating"
              : isTranscribing
                ? "Transcribing…"
                : recorder.isRecording
                  ? "Stop recording"
                  : isBlocked
                    ? "Please complete the questions above to continue"
                    : inputValue.trim() || pending.length > 0
                      ? "Send message"
                      : "Voice input"
          }
          aria-label={
            isStreaming
              ? "Stop generating"
              : isTranscribing
                ? "Transcribing"
                : recorder.isRecording
                  ? "Stop recording"
                  : inputValue.trim() || pending.length > 0
                    ? "Send message"
                    : "Voice input"
          }
          aria-pressed={recorder.isRecording}
        >
          {isStreaming || recorder.isRecording ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : isTranscribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
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
