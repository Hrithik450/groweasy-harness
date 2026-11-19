---
name: ffmpeg
description: "Cross-platform FFmpeg reference for video stitching, audio mixing, transitions, speed changes, and caption burning, with the exact filters and flags available in this build."
---

## Rules

- **Invoke through the `ffmpeg` tool** with one command string.
- **Attachment references, never paths:** pass every input exactly as the producing tool returned it — an attachment id (`sha256:<hex>`) or its `/api/attachments/<attachmentId>` URL. The tool materializes the bytes itself. Never invent a path and never use a placeholder like `input.mp4`.
- **Outputs are managed:** pass the target extension as `extension` (`".mp4"`, `".png"`, `".mp3"`). Do not name the output file; the tool stores it and returns its `/api/attachments/<attachmentId>` URL.
- **Retention, not location:** `storage: "artifact"` for final deliverables, `"tmp"` for clips, stills, and intermediates. It marks intent only; every object is durable and content-addressed.
- **Always** put `-y` immediately after `ffmpeg`, use `-pix_fmt yuv420p` for video, and use `-map` explicitly with `-filter_complex`.
- **Quote every expression** that uses variables (`x='(main_w-overlay_w)/2'`).
- **Check exit codes.** On non-zero, read stderr and fix the filter graph before retrying.
- **Portability:** Default to `libx264` + `aac`; use hardware encoders only when confirmed on the target machine.

**Standard production flags:**

```bash
-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart
```

---

## Encoders

| Codec | Encoder | Use |
|---|---|---|
| H.264 | `libx264` | Universal default: `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p` |
| H.264 NVIDIA | `h264_nvenc` | Linux/Windows GPU: `-hwaccel cuda -c:v h264_nvenc -preset p4 -cq 23 -pix_fmt yuv420p` |
| H.264 VAAPI | `h264_vaapi` | Linux Intel/AMD: `-c:v h264_vaapi -vf 'format=nv12,hwupload'` |
| H.264 macOS | `h264_videotoolbox` | Apple Silicon/Intel: `-hwaccel videotoolbox -c:v h264_videotoolbox -q:v 60 -pix_fmt yuv420p` |
| H.265 | `libx265` | Universal: `-c:v libx265 -preset fast -crf 26 -pix_fmt yuv420p` |
| H.265 NVIDIA | `hevc_nvenc` | `-hwaccel cuda -c:v hevc_nvenc -preset p4 -cq 26` |
| H.265 macOS | `hevc_videotoolbox` | `-hwaccel videotoolbox -c:v hevc_videotoolbox -q:v 65` |
| VP9 | `libvpx-vp9` | Web: `-b:v 0 -crf 33` |
| AV1 | `libsvtav1` | Maximum compression |
| Audio | `aac` / `libmp3lame` / `libopus` | `-c:a aac -b:a 192k`, `-q:a 2`, `-b:a 128k` |

---

## Video Filters

### `scale` — resize

Options: `w`/`width`, `h`/`height`, `force_original_aspect_ratio` (`disable|decrease|increase`), `flags` (`bilinear|bicubic|lanczos|neighbor`), `eval` (`init|frame`). Variables: `iw`, `ih`, `ow`, `oh`, `dar`, `sar`.

```bash
scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black
scale=1080:-2
scale=-2:1920
```

### `pad` — letterbox / pillarbox

Options: `w`, `h`, `x`, `y`, `color`, `eval`, `aspect`.

```bash
pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black
```

### `crop` — crop

Options: `w`/`out_w`, `h`/`out_h`, `x`, `y`, `keep_aspect`, `exact`. Defaults center.

```bash
crop=1080:1080:(iw-1080)/2:0
crop=ih*9/16:ih:(iw-ih*9/16)/2:0
```

### `overlay` — composite

Options: `x`, `y`, `eof_action` (`repeat|endall|pass`), `eval` (`init|frame`), `shortest`, `format`, `repeatlast`, `alpha`, `ts_sync_mode`. Variables: `main_w`, `main_h`, `overlay_w`, `overlay_h`, `t`, `n`.

> **Critical:** `overlay` has no `w`/`h`. Scale the overlay input first.

```bash
[0:v][1:v]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2
[0:v][1:v]overlay=x=main_w-overlay_w-10:y=main_h-overlay_h-10
[logo]scale=200:100[sized];[base][sized]overlay=x=10:y=10
```

### `rotate` — rotate

Options: `angle`/`a` (radians), `out_w`/`ow`, `out_h`/`oh`, `fillcolor`/`c`, `bilinear`.

> **Critical:** `roth()` and `rotw()` do not exist. Use `hypot(iw,ih)`, `iw`, or `ih`.

```bash
rotate=angle=PI/2:out_w=ih:out_h=iw
rotate=angle=-PI/2:out_w=ih:out_h=iw
rotate=angle=2*PI*t:out_w='hypot(iw,ih)':out_h='hypot(iw,ih)':fillcolor=black
```

### `xfade` — transition between clips

Options: `transition`, `duration`, `offset` (first clip duration minus overlap), `expr` (custom only).

Transitions: `fade`, `fadeblack`, `fadewhite`, `fadefast`, `fadeslow`, `fadegrays`, `wipeleft`, `wiperight`, `wipeup`, `wipedown`, `wipetl`, `wipetr`, `wipebl`, `wipebr`, `slideleft`, `slideright`, `slideup`, `slidedown`, `smoothleft`, `smoothright`, `smoothup`, `smoothdown`, `coverleft`, `coverright`, `coverup`, `circlecrop`, `circleopen`, `circleclose`, `rectcrop`, `radial`, `distance`, `dissolve`, `pixelize`, `zoomin`, `squeezeh`, `squeezev`, `diagtl`, `diagtr`, `diagbl`, `diagbr`, `hlslice`, `hrslice`, `vuslice`, `vdslice`, `hlwind`, `hrwind`, `vuwind`, `vdwind`, `hblur`, `horzopen`, `horzclose`, `vertopen`, `vertclose`, `custom`.

```bash
[0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[v01];
[v01][2:v]xfade=transition=wipeleft:duration=0.5:offset=5[v012];
[v012][3:v]xfade=transition=zoomin:duration=0.5:offset=7.5[outv]
```

### `concat` — join segments

Options: `n`, `v`, `a`, `unsafe`. All inputs must share resolution, fps, and pixel format.

```bash
[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[outv]
[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]
```

### `zoompan` — Ken Burns

Options: `z` (1.0–10.0), `x`, `y`, `d` (frames), `s` (output size), `fps`. Always clamp zoom with `min()`.

```bash
zoompan=z='min(zoom+0.0067,1.5)':d=75:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25
```

### `fade` — single-clip fade

Options: `type` (`in|out`), `start_time`, `duration`, `start_frame`, `nb_frames`, `alpha`, `color`.

```bash
fade=type=in:start_time=0:duration=0.5
fade=type=out:start_time=4.5:duration=0.5
```

### `colorkey` / `chromakey` — remove a color

Options: `color`, `similarity` (0.00001–1.0), `blend` (0–1); `chromakey` adds `yuv`.

```bash
colorkey=color=green:similarity=0.3:blend=0.1
```

### Utility filters

- `hstack=inputs=2` / `vstack=inputs=2` — side-by-side or stacked; match height/width first.
- `split=3[a][b][c]` — duplicate a stream.
- `trim=start=10:end=20,setpts=PTS-STARTPTS` — cut and reset timestamps.
- `setpts=2*PTS` (50% speed), `setpts=0.5*PTS` (200% speed).
- `fps=30` — force frame rate. `scale=1080:1920,setsar=1` — square pixels after scaling.
- `loop=...` — input option `-loop 1` loops a still.
- `hue=s=0` (grayscale), `hue=s=1.5` (saturation).
- `eq=brightness=0.1:contrast=1.2:saturation=1.3`.
- `colorchannelmixer` — 16 `[src][dst]` gains; sepia: `rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131`.
- `transpose=1` (90° clockwise); `vflip`, `hflip`.
- `drawbox=x=0:y=ih-200:w=iw:h=200:color=black@0.5:thickness=fill` — caption bar.

---

## Audio Filters

- `volume=1.5` (+50%), `volume=-3dB`. Options: `volume`, `precision`, `eval`.
- `afade=type=in:start_time=0:duration=1` / `afade=type=out:start_time=9:duration=1`. Options: `type`, `start_time`, `duration`, `nb_samples`, `curve`.
- `[0:a][1:a]acrossfade=duration=0.5[outa]`.
- `[0:a][1:a]amix=inputs=2:duration=first[outa]`. Options: `inputs`, `duration` (`longest|shortest|first`), `dropout_transition`.
- `[0:a]atrim=start=5:end=15,asetpts=PTS-STARTPTS[a]`.
- `aresample=44100` / `aresample=48000`.

---

## Input / Output Flags

| Before `-i` | Effect |
|---|---|
| `-loop 1` | Loop a still image |
| `-t DURATION` | Limit input duration |
| `-ss TIMESTAMP` | Fast seek |
| `-framerate N` / `-r N` | Force input frame rate |

| Before output | Effect |
|---|---|
| `-t DURATION` | Limit output duration |
| `-frames:v N` | Exact frame count |
| `-r N` | Output frame rate |
| `-c:v` / `-crf` / `-preset` | Encoder, quality, speed (`ultrafast` … `veryslow`) |
| `-pix_fmt yuv420p` | H.264 compatibility (always) |
| `-c:a` / `-b:a` / `-an` / `-vn` | Audio codec, bitrate, drop audio or video |
| `-movflags +faststart` | Web streaming |

---

## Common 9:16 Reels Recipes (1080×1920, 30fps)

Inputs below are shown as `/api/attachments/<...>`; substitute the exact reference you were given.

**Any input → Reels:**

```bash
ffmpeg -y -i /api/attachments/<videoAttachmentId> -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart
```

**PNG → 3s clip:**

```bash
ffmpeg -y -loop 1 -i /api/attachments/<stillAttachmentId> -t 3 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p
```

**4-image slideshow with xfade:** render four 3s clips as above, then:

```bash
ffmpeg -y -i /api/attachments/<clip1AttachmentId> -i /api/attachments/<clip2AttachmentId> -i /api/attachments/<clip3AttachmentId> -i /api/attachments/<clip4AttachmentId> -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[v01];[v01][2:v]xfade=transition=wipeleft:duration=0.5:offset=5[v012];[v012][3:v]xfade=transition=zoomin:duration=0.5:offset=7.5[outv]" -map "[outv]" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -movflags +faststart
```

**Add music:**

```bash
ffmpeg -y -i /api/attachments/<videoAttachmentId> -i /api/attachments/<musicAttachmentId> -filter_complex "[1:a]volume=0.5,afade=type=out:start_time=9:duration=1[music];[0:a][music]amix=inputs=2:duration=first[outa]" -map 0:v -map "[outa]" -c:v copy -c:a aac -b:a 192k
```

**Ken Burns still** (upscale first to avoid pixelation):

```bash
ffmpeg -y -loop 1 -i /api/attachments/<stillAttachmentId> -t 5 -vf "scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p
```

---

## filter_complex Rules

1. `[0:v]` / `[0:a]` address the first input's video/audio; `[1:v]` the second.
2. Every filter output must be consumed by another filter or `-map`.
3. Intermediate labels are free-form (`[v01]`, `[scaled]`).
4. No spaces inside filter option strings.
5. Semicolons separate chains.
6. Quote the entire `-filter_complex` argument.

---

## Does NOT Exist in This Build

| Hallucination | Reality |
|---|---|
| `overlay=w=...` or `overlay=h=...` | Not options. Scale the input first. |
| `rotate=out_h='roth(angle)'` / `out_w='rotw(angle)'` | Functions do not exist. Use `hypot(iw,ih)`, `ih`, or `iw`. |
| `drawtext=...` | Not compiled (no libfreetype). |
| `subtitles=...` / `ass=...` | Only available through the caption-burning path. |
| `zoompan` without `min()` | Zoom exceeds 10× and crashes. Clamp it. |
| `concat` with mismatched fps/resolution | Errors or distortion. Normalize first. |
