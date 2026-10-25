# @deepseek-ai/dsh-ffmpeg

Standalone cross-platform FFmpeg runtime, binary resolver, and media probe utilities for DeepSeek Harness.

## Features

- **Zero Host Installation Required**: Automatically downloads hermetic static binaries for Linux (x86_64, arm64), macOS (Apple Silicon, Intel), and Windows if missing from the host.
- **Cross-Platform Hardware Encoder Detection**: Seamlessly detects and leverages Linux NVIDIA NVENC (`h264_nvenc` + `-hwaccel cuda`), macOS VideoToolbox (`h264_videotoolbox` + `-hwaccel videotoolbox`), and falls back to universal software `libx264`.
- **Media Probing**: Extracts media duration, resolution, framerate, and audio/video stream layout.
- **Process Cancellation**: Wires cooperative `AbortSignal` listeners to terminate background FFmpeg rendering instantly on cancel.
