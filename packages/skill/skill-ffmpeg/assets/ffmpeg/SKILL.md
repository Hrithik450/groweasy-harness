---
name: ffmpeg
description: "Universal cross-platform FFmpeg filter and encoder reference for Linux and macOS. Read this before writing any ffmpeg bash command. Covers every option for all commonly used filters and standard cross-platform encoding flags so commands work on the first attempt without platform bias or hallucinations."
---

# FFmpeg — Universal Cross-Platform Reference (Linux & macOS)

> **Cross-Platform Compatibility Note:**
> This reference applies across Linux (x86_64, arm64) and macOS (Apple Silicon, Intel).
> Always use universal software encoders (`libx264` + `aac`) by default to guarantee 100% portability across cloud servers, Docker containers, and local environments unless hardware acceleration is explicitly confirmed for the target platform.

---

## 0. Global Rules

- **User-Specific Scratchpad (`../tmp/`):** All intermediate, transient, or scratch files (such as extracted audio `.wav`, temporary video splits/cuts, demuxer `.txt` file lists, generated subtitle `.ass` files, and intermediate filter clips) MUST strictly be dumped directly into the user's private temporary directory at `../tmp/` (which is `workspaces/<userId>/tmp/`). In Linux container sandboxes, `/tmp/` is also bound directly to this directory. The workspace root must remain completely clean—never write intermediate files in the workspace. Never write temporary files to the host global `/tmp` or anywhere else.
- **Immediate Scratch Cleanup:** As soon as the final media render completes, immediately delete all temporary files from `../tmp/` (`rm -rf ../tmp/*`). Always ensure proper deletion and leave the user's temporary directory completely clean.
- **Content-Addressed Deliverables (`.dsh/attachments/`):** DeepSeek Harness stores all media outputs (video, audio, images) directly into the content-addressed attachment store (`.dsh/attachments/v1/objects/`). The session turn log records the `attachmentId` and playback metadata for UI presentation. Never clutter the workspace root with loose media outputs.
- **Declare Deliverables via `present` Tool:** When the user explicitly requests a specific deliverable file in their workspace, call the `present` tool (e.g. `present({ files: [{ path: '<output_path>', description: 'Final rendered video' }] })`). NEVER invoke `present` for intermediate or temporary scratch files in `tmp/` or `../tmp/` — `present` is strictly for finished deliverables.
- Always pass `-y` immediately after `ffmpeg` to overwrite output files without prompting.
- Always use `-map` explicitly when using `-filter_complex`.
- Check `[exit code: N]` on every result. If non-zero, read stderr carefully and fix before retrying.
- All expressions (angle, x, y, z, etc.) that use variables must be quoted: `'expression'`.
- Always specify `-pix_fmt yuv420p` for video outputs to ensure web/mobile playback compatibility.

---

## 1. Available Encoders (Universal & Hardware)

| Codec | Encoder name | Platform / Environment | Recommended Flags & Usage |
|---|---|---|---|
| **H.264 (Universal Baseline)** | `libx264` | **All Platforms (CPU)** | **Standard for 100% portability across Linux & macOS:**<br>`-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p` |
| **H.264 (Linux NVIDIA)** | `h264_nvenc` | Linux / Windows (NVIDIA GPU) | `-hwaccel cuda -c:v h264_nvenc -preset p4 -cq 23 -pix_fmt yuv420p` |
| **H.264 (Linux Intel/AMD)** | `h264_vaapi` | Linux (Intel/AMD GPU) | `-c:v h264_vaapi -vf 'format=nv12,hwupload'` |
| **H.264 (macOS Hardware)** | `h264_videotoolbox` | macOS (Apple Silicon / Intel) | `-hwaccel videotoolbox -c:v h264_videotoolbox -q:v 60 -pix_fmt yuv420p` |
| **H.265/HEVC (Universal)** | `libx265` | **All Platforms (CPU)** | `-c:v libx265 -preset fast -crf 26 -pix_fmt yuv420p` |
| **H.265 (Linux NVIDIA)** | `hevc_nvenc` | Linux (NVIDIA GPU) | `-hwaccel cuda -c:v hevc_nvenc -preset p4 -cq 26` |
| **H.265 (macOS Hardware)** | `hevc_videotoolbox` | macOS (Apple Silicon / Intel) | `-hwaccel videotoolbox -c:v hevc_videotoolbox -q:v 65` |
| **VP9 (Universal)** | `libvpx-vp9` | All Platforms | Web video. Use `-b:v 0 -crf 33` |
| **AV1 (Universal)** | `libsvtav1` | All Platforms | Maximum compression efficiency. |
| **Audio (Universal)** | `aac` | **All Platforms** | Native AAC audio. Use `-c:a aac -b:a 192k` |
| **Audio (MP3)** | `libmp3lame` | All Platforms | MP3 audio. Use `-c:a libmp3lame -q:a 2` |
| **Audio (Opus)** | `libopus` | All Platforms | Opus streaming. Use `-c:a libopus -b:a 128k` |

**Standard Production Video Flags (Universal — Guaranteed to work on Linux, macOS, and Docker):**
```bash
-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart
```

---

## 2. Video Filters — Complete Option Reference

All options listed below are **the exact options this FFmpeg build accepts**. Do NOT use any option not listed here for that filter.

---

### 2.1 `scale` — Resize video

**Inputs:** 1 video → 1 video

| Option | Type | Default | Description |
|---|---|---|---|
| `w` / `width` | string | source width | Output width. Supports expressions: `iw`, `ih`, `iw/2`, `1080`, `-1` (auto) |
| `h` / `height` | string | source height | Output height. Supports expressions |
| `force_original_aspect_ratio` | int | `disable` | `disable`, `decrease`, `increase` |
| `flags` | string | `""` | Scaling algorithm: `bilinear`, `bicubic`, `lanczos`, `neighbor` |
| `eval` | int | `init` | When to eval expressions: `init` or `frame` |

**Key expression variables:** `iw` (input width), `ih` (input height), `ow` (output width), `oh` (output height), `dar` (display aspect ratio), `sar` (sample aspect ratio)

**9:16 Reels canonical scale + pad to 1080×1920:**
```
scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black
```

**Scale keeping aspect ratio, fit into box:**
```
scale=1080:-2
scale=-2:1920
scale=1080:1920:force_original_aspect_ratio=decrease
```

---

### 2.2 `pad` — Add padding/letterbox/pillarbox

**Inputs:** 1 video → 1 video

| Option | Type | Default | Description |
|---|---|---|---|
| `w` / `width` | string | `iw` | Total output width |
| `h` / `height` | string | `ih` | Total output height |
| `x` | string | `0` | X offset of input within output. Use `(ow-iw)/2` for centering |
| `y` | string | `0` | Y offset of input within output. Use `(oh-ih)/2` for centering |
| `color` | color | `black` | Pad fill color. Any CSS color name or hex `#rrggbb` |
| `eval` | int | `init` | `init` or `frame` |
| `aspect` | rational | `0/1` | Pad to fit an aspect ratio instead |

**Center input in 1080×1920 black canvas:**
```
pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black
```

---

### 2.3 `crop` — Crop video

**Inputs:** 1 video → 1 video

| Option | Type | Default | Description |
|---|---|---|---|
| `w` / `out_w` | string | `iw` | Output (crop) width |
| `h` / `out_h` | string | `ih` | Output (crop) height |
| `x` | string | `(in_w-out_w)/2` | X position of crop region. Default: centered |
| `y` | string | `(in_h-out_h)/2` | Y position of crop region. Default: centered |
| `keep_aspect` | bool | `false` | Keep aspect ratio |
| `exact` | bool | `false` | Exact cropping |

**Center-crop 1920×1080 source to 1080×1080 (square):**
```
crop=1080:1080:(iw-1080)/2:0
```

**Center-crop landscape to 9:16:**
```
crop=ih*9/16:ih:(iw-ih*9/16)/2:0
```

---

### 2.4 `overlay` — Overlay one video/image on top of another

**Inputs:** 2 videos [base][overlay] → 1 video

> ⚠️ **CRITICAL:** `overlay` has NO `w` or `h` options. NEVER write `overlay=w=...:h=...`. Use `scale` on the overlay input BEFORE overlaying to resize it.

| Option | Type | Default | Description |
|---|---|---|---|
| `x` | string | `0` | X position of overlay on base. Supports expressions |
| `y` | string | `0` | Y position of overlay on base. Supports expressions |
| `eof_action` | int | `repeat` | What to do at overlay EOF: `repeat`, `endall`, `pass` |
| `eval` | int | `frame` | When to eval: `init` or `frame` |
| `shortest` | bool | `false` | End output when shortest input ends |
| `format` | int | `yuv420` | Output pixel format: `yuv420`, `rgb`, `gbrp`, `auto` |
| `repeatlast` | bool | `true` | Repeat last overlay frame beyond EOF |
| `alpha` | int | `auto` | Alpha mode: `auto`, `straight`, `premultiplied` |
| `ts_sync_mode` | int | `default` | Timestamp sync: `default`, `nearest` |

**Available expression variables for x/y:** `main_w`, `main_h` (base dimensions), `overlay_w`, `overlay_h` (overlay dimensions), `t` (time in seconds), `n` (frame number)

**Center overlay on base:**
```
[base][ovr]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2
```

**Bottom-right corner:**
```
[base][ovr]overlay=x=main_w-overlay_w-10:y=main_h-overlay_h-10
```

**Size the overlay first, then overlay:**
```
[logo]scale=200:100[sized];[base][sized]overlay=x=10:y=10
```

---

### 2.5 `rotate` — Rotate video

**Inputs:** 1 video → 1 video

> ⚠️ **CRITICAL:** `out_w` and `out_h` accept only numeric expressions using `iw`, `ih`, `hypot()`, `PI`, `t`. They do NOT accept `roth()` or `rotw()` — those functions do not exist.

| Option | Type | Default | Description |
|---|---|---|---|
| `angle` / `a` | string | `0` | Rotation angle in **radians**. 360° = `2*PI`. Supports `t` (time) |
| `out_w` / `ow` | string | `iw` | Output frame width expression |
| `out_h` / `oh` | string | `ih` | Output frame height expression |
| `fillcolor` / `c` | string | `black` | Background fill color for empty areas |
| `bilinear` | bool | `true` | Use bilinear interpolation |

**Rotate 90° clockwise (static):**
```
rotate=angle=PI/2:out_w=ih:out_h=iw
```

**Rotate 90° counter-clockwise:**
```
rotate=angle=-PI/2:out_w=ih:out_h=iw
```

**Spin continuously (animated, canvas expands to fit):**
```
rotate=angle=2*PI*t:out_w='hypot(iw,ih)':out_h='hypot(iw,ih)':fillcolor=black
```

**Spin keeping original canvas size:**
```
rotate=angle=2*PI*t:out_w=iw:out_h=ih:fillcolor=black
```

**NOTE:** For transition between two clips using spin, prefer `xfade=transition=radial` — it is cleaner and requires no canvas math.

---

### 2.6 `xfade` — Transition between two video streams

**Inputs:** 2 videos [main][xfade] → 1 video

| Option | Type | Default | Description |
|---|---|---|---|
| `transition` | int | `fade` | Transition effect name (see full list below) |
| `duration` | duration | — | Duration of transition in seconds (e.g. `0.5`) |
| `offset` | duration | — | Time offset in seconds when the transition starts (= first clip duration minus transition overlap) |
| `expr` | string | — | Custom transition expression (for `custom` transition only) |

**All available transitions in this build (57 total):**

| Name | Effect |
|---|---|
| `fade` | Simple crossfade |
| `fadeblack` | Fade through black |
| `fadewhite` | Fade through white |
| `fadefast` | Fast fade |
| `fadeslow` | Slow fade |
| `fadegrays` | Fade through grayscale |
| `wipeleft` | Wipe from right to left |
| `wiperight` | Wipe from left to right |
| `wipeup` | Wipe upward |
| `wipedown` | Wipe downward |
| `wipetl` | Wipe top-left |
| `wipetr` | Wipe top-right |
| `wipebl` | Wipe bottom-left |
| `wipebr` | Wipe bottom-right |
| `slideleft` | Slide left |
| `slideright` | Slide right |
| `slideup` | Slide up |
| `slidedown` | Slide down |
| `smoothleft` | Smooth slide left |
| `smoothright` | Smooth slide right |
| `smoothup` | Smooth slide up |
| `smoothdown` | Smooth slide down |
| `coverleft` | Cover left |
| `coverright` | Cover right |
| `coverup` | Cover up |
| `circlecrop` | Circle crop |
| `circleopen` | Circle open |
| `circleclose` | Circle close |
| `rectcrop` | Rectangle crop |
| `radial` | Radial/clock-wipe spin |
| `distance` | Distance-based blend |
| `dissolve` | Dissolve |
| `pixelize` | Pixelate/glitch |
| `zoomin` | Zoom in |
| `squeezeh` | Horizontal squeeze |
| `squeezev` | Vertical squeeze |
| `diagtl` | Diagonal top-left |
| `diagtr` | Diagonal top-right |
| `diagbl` | Diagonal bottom-left |
| `diagbr` | Diagonal bottom-right |
| `hlslice` | Horizontal line slice |
| `hrslice` | Horizontal reverse slice |
| `vuslice` | Vertical up slice |
| `vdslice` | Vertical down slice |
| `hlwind` | Horizontal left wind |
| `hrwind` | Horizontal right wind |
| `vuwind` | Vertical up wind |
| `vdwind` | Vertical down wind |
| `hblur` | Horizontal blur |
| `horzopen` | Horizontal open |
| `horzclose` | Horizontal close |
| `vertopen` | Vertical open |
| `vertclose` | Vertical close |
| `custom` | Custom expression |

**Standard xfade between two clips of duration D with T-second transition:**
```
ffmpeg -y -i clip1.mp4 -i clip2.mp4 \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=D-0.5[outv]" \
  -map "[outv]" out.mp4
```

**Chain 4 clips with xfade (each 3s, 0.5s overlap):**
```
ffmpeg -y -i a.mp4 -i b.mp4 -i c.mp4 -i d.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[v01];
    [v01][2:v]xfade=transition=wipeleft:duration=0.5:offset=5[v012];
    [v012][3:v]xfade=transition=zoomin:duration=0.5:offset=7.5[outv]
  " \
  -map "[outv]" out.mp4
```

---

### 2.7 `concat` — Concatenate video/audio segments

**Inputs:** N×(v+a) streams → v+a streams

| Option | Type | Default | Description |
|---|---|---|---|
| `n` | int | `2` | Number of input segments |
| `v` | int | `1` | Number of output video streams |
| `a` | int | `0` | Number of output audio streams |
| `unsafe` | bool | `false` | Allow segments with different properties |

**Concatenate 4 video-only segments (no audio):**
```
ffmpeg -y -i a.mp4 -i b.mp4 -i c.mp4 -i d.mp4 \
  -filter_complex "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[outv]" \
  -map "[outv]" out.mp4
```

**Concatenate 3 segments with audio:**
```
ffmpeg -y -i a.mp4 -i b.mp4 -i c.mp4 \
  -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]" \
  -map "[outv]" -map "[outa]" out.mp4
```

> ⚠️ All segments must have the same resolution, fps, and pixel format before concat. Scale/pad each input first if needed.

---

### 2.8 `zoompan` — Ken Burns pan & zoom effect

**Inputs:** 1 video → 1 video

| Option | Type | Default | Description |
|---|---|---|---|
| `z` / `zoom` | string | `1` | Zoom factor expression. Range 1.0–10.0. Use `t` for time-based animation |
| `x` | string | `0` | X pan expression (top-left of crop window) |
| `y` | string | `0` | Y pan expression |
| `d` | string | `90` | Duration in frames (at output fps) |
| `s` | image_size | `hd720` | Output size (e.g. `1080x1920`, `hd720`) |
| `fps` | video_rate | `25` | Output framerate |

**Available expression variables:** `zoom` (current zoom), `x`, `y`, `iw`, `ih`, `ow`, `oh`, `in` (frame index), `on` (output frame index)

**Zoom in from 1.0× to 1.5× over 3 seconds (75 frames @ 25fps):**
```
zoompan=z='min(zoom+0.0067,1.5)':d=75:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25
```

**Pan left while zoomed 1.3×:**
```
zoompan=z=1.3:x='x+2':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=25
```

---

### 2.9 `fade` — Fade in / fade out (single clip)

**Inputs:** 1 video → 1 video  
*(For fading between two clips, use `xfade` instead)*

| Option | Type | Default | Description |
|---|---|---|---|
| `type` / `t` | int | `in` | `in` (fade in) or `out` (fade out) |
| `start_frame` / `s` | int | `0` | First frame to apply fade |
| `nb_frames` / `n` | int | `25` | Number of frames to apply fade over |
| `start_time` / `st` | duration | `0` | Start time of fade effect in seconds |
| `duration` / `d` | duration | `0` | Duration of fade in seconds (overrides nb_frames) |
| `alpha` | bool | `false` | Also fade alpha channel |
| `color` / `c` | color | `black` | Fade-to/from color |

**Fade in first 0.5s:**
```
fade=type=in:start_time=0:duration=0.5
```

**Fade out last 0.5s of a 5s clip:**
```
fade=type=out:start_time=4.5:duration=0.5
```

---

### 2.10 `colorkey` — Remove a specific color (green/blue screen)

**Inputs:** 1 video → 1 video (with alpha)

| Option | Type | Default | Description |
|---|---|---|---|
| `color` | color | `black` | Key color to remove (e.g. `green`, `#00ff00`) |
| `similarity` | float | `0.01` | Range 0.00001–1.0. Higher = more colors matched |
| `blend` | float | `0` | Softness of edge: 0 = hard, 1 = full blend |

**Green screen removal:**
```
colorkey=color=green:similarity=0.3:blend=0.1
```

---

### 2.11 `chromakey` — Chroma key (green/blue screen, YUV-aware)

| Option | Type | Default | Description |
|---|---|---|---|
| `color` | color | `black` | Key color |
| `similarity` | float | `0.01` | Match threshold |
| `blend` | float | `0` | Edge softness |
| `yuv` | bool | `false` | Treat color param as YUV instead of RGB |

---

### 2.12 `hstack` / `vstack` — Stack clips side by side or top/bottom

**hstack (horizontal):**
```
[0:v][1:v]hstack=inputs=2[out]
```

**vstack (vertical):**
```
[0:v][1:v]vstack=inputs=2[out]
```

Both require all inputs to have the same height (hstack) or width (vstack). Scale first if needed.

---

### 2.13 `split` — Duplicate a stream to multiple outputs

```
[input]split=3[a][b][c]
```
Splits one stream into 3 identical streams. Use for applying different effects to the same source.

---

### 2.14 `trim` — Extract a time range from video

| Option | Type | Default | Description |
|---|---|---|---|
| `start` | duration | — | Start timestamp (e.g. `00:00:05`, `5.0`) |
| `end` | duration | — | End timestamp |
| `duration` | duration | — | Max duration of output |
| `start_frame` | int64 | — | Start by frame number |
| `end_frame` | int64 | — | End by frame number |

Always follow `trim` with `setpts=PTS-STARTPTS` to reset timestamps:
```
[0:v]trim=start=10:end=20,setpts=PTS-STARTPTS[v]
```

---

### 2.15 `setpts` — Modify video timestamps

| Option | Type | Default | Description |
|---|---|---|---|
| `expr` | string | `PTS` | PTS expression |

**Common patterns:**
- `setpts=PTS-STARTPTS` — reset timestamps to start at 0 (required after trim)
- `setpts=2*PTS` — slow down to 50% speed
- `setpts=0.5*PTS` — speed up to 200%
- `setpts=N/(FRAME_RATE*TB)` — regenerate from frame number

---

### 2.16 `fps` — Force output framerate

| Option | Type | Default | Description |
|---|---|---|---|
| `fps` | string | `25` | Target framerate: `25`, `30`, `60`, `24000/1001` |
| `round` | int | `near` | Rounding: `zero`, `inf`, `down`, `up`, `near` |
| `eof_action` | int | `round` | `round` or `pass` |

```
fps=30
```

---

### 2.17 `setsar` / `setdar` — Set sample / display aspect ratio

| Option | Description |
|---|---|
| `sar` / `ratio` / `r` | Sample aspect ratio string (e.g. `1`, `1/1`) |
| `max` | Max denominator/numerator (default 100) |

**Force square pixels (always do this after scaling for social video):**
```
scale=1080:1920,setsar=1
```

---

### 2.18 `loop` — Loop video frames

| Option | Type | Default | Description |
|---|---|---|---|
| `loop` | int | `0` | Number of loops (-1 = infinite) |
| `size` | int64 | `0` | Max frames to loop |
| `start` | int64 | `0` | Start frame |
| `time` | duration | — | Start time |

**Loop a 1-frame PNG to make a 5-second still:**
```
ffmpeg -y -loop 1 -i image.png -t 5 -vf "scale=1080:1920,setsar=1,fps=30" -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
```

---

### 2.19 `hue` — Adjust hue, saturation, brightness

| Option | Type | Default | Description |
|---|---|---|---|
| `h` | string | — | Hue angle in degrees |
| `s` | string | `1` | Saturation multiplier (0=grayscale, 2=double) |
| `b` | string | `0` | Brightness offset |

**Grayscale:**
```
hue=s=0
```

**Boost saturation:**
```
hue=s=1.5
```

---

### 2.20 `eq` — Brightness, contrast, saturation, gamma

| Option | Type | Range | Default |
|---|---|---|---|
| `brightness` | float | -1.0–1.0 | `0` |
| `contrast` | float | -1000–1000 | `1` |
| `saturation` | float | 0–3.0 | `1` |
| `gamma` | float | 0.1–10.0 | `1` |
| `gamma_r/g/b` | float | 0.1–10.0 | `1` |

```
eq=brightness=0.1:contrast=1.2:saturation=1.3
```

---

### 2.21 `colorchannelmixer` — Shift/remap RGB channels

16 gain parameters named `[src][dst]`: `rr rg rb ra | gr gg gb ga | br bg bb ba | ar ag ab aa`
Default: identity matrix (1 on diagonal, 0 elsewhere).

**Sepia tone:**
```
colorchannelmixer=rr=0.393:rg=0.769:rb=0.189:gr=0.349:gg=0.686:gb=0.168:br=0.272:bg=0.534:bb=0.131
```

**Swap red and blue channels:**
```
colorchannelmixer=rr=0:rb=1:br=0:bb=1:gg=1
```

---

### 2.22 `transpose` — Rotate 90°

| Value | Effect |
|---|---|
| `0` or `cclock_flip` | 90° counter-clockwise + vertical flip |
| `1` or `clock` | 90° clockwise |
| `2` or `cclock` | 90° counter-clockwise |
| `3` or `clock_flip` | 90° clockwise + vertical flip |

```
transpose=1
```

---

### 2.23 `vflip` / `hflip` — Flip video

```
vflip        # flip vertically (upside down)
hflip        # flip horizontally (mirror)
```

---

### 2.24 `drawbox` — Draw a colored rectangle

| Option | Type | Default | Description |
|---|---|---|---|
| `x` | string | `0` | Left edge X |
| `y` | string | `0` | Top edge Y |
| `w` / `width` | string | `0` | Box width |
| `h` / `height` | string | `0` | Box height |
| `color` / `c` | string | `black` | Color and opacity (e.g. `red@0.5`) |
| `thickness` / `t` | string | `3` | Border thickness. Use `fill` for filled box |

**Semi-transparent black bar at bottom for captions:**
```
drawbox=x=0:y=ih-200:w=iw:h=200:color=black@0.5:thickness=fill
```

---

## 3. Audio Filters — Complete Option Reference

### 3.1 `volume` — Adjust audio volume

| Option | Type | Default | Description |
|---|---|---|---|
| `volume` | string | `1.0` | Volume factor. `2.0` = double, `0.5` = half, `10dB` = +10dB |
| `precision` | int | `float` | `fixed` (8-bit), `float` (32-bit), `double` (64-bit) |
| `eval` | int | `once` | `once` or `frame` |

```
volume=1.5        # +50% louder
volume=-3dB       # reduce by 3dB
```

---

### 3.2 `afade` — Audio fade in / out

| Option | Type | Default | Description |
|---|---|---|---|
| `type` / `t` | int | `in` | `in` or `out` |
| `start_time` / `st` | duration | `0` | When fade starts |
| `duration` / `d` | duration | — | Fade duration in seconds |
| `nb_samples` / `ns` | int64 | `44100` | Fade duration in samples |
| `curve` | int | `tri` | Curve type: `tri`, `qsin`, `hsin`, `esin`, `log`, `ipar`, `qua`, `cub`, `squ`, `cbr`, `par`, `exp`, `iqsin`, `ihsin`, `dese`, `desi`, `losi`, `nofade` |

**Fade audio in over first 1 second:**
```
afade=type=in:start_time=0:duration=1
```

**Fade audio out over last 1 second of a 10s clip:**
```
afade=type=out:start_time=9:duration=1
```

---

### 3.3 `acrossfade` — Cross-fade two audio streams

| Option | Type | Default | Description |
|---|---|---|---|
| `inputs` / `n` | int | `2` | Number of inputs |
| `duration` / `d` | duration | `0` | Crossfade duration |
| `nb_samples` / `ns` | int64 | `44100` | Duration in samples |

```
[0:a][1:a]acrossfade=duration=0.5[outa]
```

---

### 3.4 `amix` — Mix multiple audio streams

| Option | Type | Default | Description |
|---|---|---|---|
| `inputs` | int | `2` | Number of audio inputs |
| `duration` | int | `longest` | Output duration: `longest`, `shortest`, `first` |
| `dropout_transition` | float | `2` | Volume renorm transition time when input ends |

```
[0:a][1:a]amix=inputs=2:duration=first[outa]
```

---

### 3.5 `atrim` — Extract a time range from audio

Same options as video `trim`: `start`, `end`, `duration`, `start_pts`, `end_pts`.

Always follow with `asetpts=PTS-STARTPTS`:
```
[0:a]atrim=start=5:end=15,asetpts=PTS-STARTPTS[a]
```

---

### 3.6 `aresample` — Resample audio

```
aresample=44100     # resample to 44100 Hz
aresample=48000     # resample to 48000 Hz (required for some encoders)
```

---

## 4. Input Options (before `-i`)

| Flag | Description |
|---|---|
| `-loop 1` | Loop input (required for still images) |
| `-t DURATION` | Limit input duration (e.g. `-t 5` = 5 seconds) |
| `-ss TIMESTAMP` | Seek to timestamp before reading (fast seek) |
| `-framerate N` | Force input framerate |
| `-r N` | Input framerate |

**Still image to video (5 seconds):**
```
ffmpeg -y -loop 1 -i image.png -t 5 -r 30 -vf "scale=1080:1920,setsar=1" -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
```

---

## 5. Output Options (before output file)

| Flag | Description |
|---|---|
| `-t DURATION` | Limit output duration |
| `-frames:v N` | Output exactly N video frames |
| `-r N` | Output framerate |
| `-c:v ENCODER` | Video encoder (e.g. `libx264`) |
| `-crf N` | Constant Rate Factor quality (lower = better). H.264: 18-28. H.265: 24-32 |
| `-preset PRESET` | Encoding speed/quality: `ultrafast` `superfast` `veryfast` `faster` `fast` `medium` `slow` `slower` `veryslow` |
| `-pix_fmt yuv420p` | Pixel format. **Always set this for H.264** for maximum compatibility |
| `-c:a ENCODER` | Audio encoder (e.g. `aac`, `libmp3lame`) |
| `-b:a BITRATE` | Audio bitrate (e.g. `192k`) |
| `-an` | No audio output |
| `-vn` | No video output |
| `-movflags +faststart` | Move MP4 metadata to front (required for web streaming) |

---

## 6. Common Patterns for 9:16 Reels (1080×1920, 30fps)

### Convert any input to standard Reels format:
```bash
ffmpeg -y -i input.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1" \
  -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart \
  output_reels.mp4
```

### Images (PNG/JPG) → Reels clip (3 seconds each):
```bash
ffmpeg -y -loop 1 -i frame.png -t 3 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1" \
  -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p \
  clip.mp4
```

### 4-image slideshow with xfade transitions:
```bash
# Step 1: Convert each image to a clip
for i in 1 2 3 4; do
  ffmpeg -y -loop 1 -i frame_$i.png -t 3 \
    -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1" \
    -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p clip_$i.mp4
done

# Step 2: Chain with xfade transitions (0.5s overlap, clips are 3s each)
ffmpeg -y -i clip_1.mp4 -i clip_2.mp4 -i clip_3.mp4 -i clip_4.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[v01];
    [v01][2:v]xfade=transition=wipeleft:duration=0.5:offset=5.0[v012];
    [v012][3:v]xfade=transition=zoomin:duration=0.5:offset=7.5[outv]
  " \
  -map "[outv]" \
  -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p \
  -movflags +faststart \
  output.mp4
```

### Add background music to video:
```bash
ffmpeg -y -i video.mp4 -i music.mp3 \
  -filter_complex "[1:a]volume=0.5,afade=type=out:start_time=9:duration=1[music];[0:a][music]amix=inputs=2:duration=first[outa]" \
  -map 0:v -map "[outa]" \
  -c:v copy -c:a aac -b:a 192k \
  output_with_music.mp4
```

### Ken Burns zoom on a still image:
```bash
ffmpeg -y -loop 1 -i image.png -t 5 \
  -vf "scale=8000:-1,zoompan=z='min(zoom+0.0015,1.5)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30" \
  -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p \
  zoom.mp4
```

> Note: Scale to large resolution (e.g. 8000:-1) before zoompan to avoid pixelation at max zoom.

---

## 7. filter_complex Wiring Rules

1. **Label format:** `[0:v]` = video stream of first input. `[0:a]` = audio. `[1:v]` = video of second input.
2. **Every filter output must be consumed** — either by another filter or a `-map`.
3. **Intermediate labels** are free-form: `[v01]`, `[scaled]`, `[tmp]`, etc.
4. **No spaces** inside filter option strings within the complex filter graph.
5. **Semicolons** separate filter chains inside `-filter_complex "..."`.
6. **Quote the entire** `-filter_complex` argument in the shell.

---

## 8. What Does NOT Exist in This Build

These are common model hallucinations — they will cause an error:

| Hallucinated | Reality |
|---|---|
| `overlay=w=...` | `overlay` has no `w`/`h` options. Use `scale` on the input first. |
| `overlay=h=...` | Same — does not exist. |
| `rotate=out_h='roth(angle)'` | `roth()` does not exist. Use `'hypot(iw,ih)'` or `ih`. |
| `rotate=out_w='rotw(angle)'` | `rotw()` does not exist. Use `'hypot(iw,ih)'` or `iw`. |
| `drawtext=...` | `drawtext` is **not available** in this build (not compiled with libfreetype). |
| `subtitles=...` | Not available in this build. |
| `ass=...` | Not available in this build. |
| `zoompan=z='zoom+0.001':...` (without `min()`) | Zoom will exceed 10× and crash. Always clamp: `min(zoom+0.001, 1.5)`. |
| `concat` without matching fps/resolution | Will produce errors or distorted output. Normalize all inputs first. |
