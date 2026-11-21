"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_DURATION_MS = 60_000;

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export interface AudioRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface UseAudioRecorderOptions {
  maxDurationMs?: number;
  onError?: (message: string) => void;
  onRecordingComplete?: (recording: AudioRecording) => void;
}

export interface UseAudioRecorderResult {
  isRecording: boolean;
  isSupported: boolean;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

/**
 * Lazy microphone capture via MediaRecorder. Permission is requested on start,
 * and the mic is released as soon as recording stops or is cancelled.
 */
export function useAudioRecorder(
  options: UseAudioRecorderOptions = {},
): UseAudioRecorderResult {
  const maxDurationMs = options.maxDurationMs ?? MAX_DURATION_MS;
  const onErrorRef = useRef(options.onError);
  const onCompleteRef = useRef(options.onRecordingComplete);
  onErrorRef.current = options.onError;
  onCompleteRef.current = options.onRecordingComplete;

  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const release = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => () => release(), [release]);

  const start = useCallback(async () => {
    if (!isSupported) {
      onErrorRef.current?.(
        "Voice input is not supported in this browser. Try Chrome or Edge.",
      );
      return;
    }
    if (recorderRef.current?.state === "recording") return;

    cancelledRef.current = false;

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);

      chunksRef.current = [];
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        onErrorRef.current?.("Recording failed. Please try again.");
        setIsRecording(false);
        release();
      };

      recorder.onstop = () => {
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        setIsRecording(false);
        release();

        if (cancelledRef.current) return;
        if (blob.size === 0) {
          onErrorRef.current?.("No audio captured. Please try again.");
          return;
        }
        onCompleteRef.current?.({ blob, mimeType: type, durationMs });
      };

      startedAtRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);

      maxTimerRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, maxDurationMs);
    } catch (error) {
      release();
      setIsRecording(false);
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" ||
          error.name === "PermissionDeniedError");
      onErrorRef.current?.(
        denied
          ? "Microphone access denied. Enable it in your browser settings to use voice input."
          : "Could not access the microphone. Please try again.",
      );
    }
  }, [isSupported, maxDurationMs, release]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    chunksRef.current = [];
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    setIsRecording(false);
    release();
  }, [release]);

  return { isRecording, isSupported, stream, start, stop, cancel };
}
