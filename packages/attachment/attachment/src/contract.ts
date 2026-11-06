import { type Context, Service } from "@deepseek-ai/cordis";
import {
  admitEncodedFile as admitFileUpload,
  admitEncodedImages,
  admitEncodedVideo as admitVideoUpload,
  validateImageBatchLimits,
} from "./admission";
import {
  AttachmentError,
  isAttachmentError as matchesAttachmentError,
} from "./errors";
import type {
  AdmittedPromptContentPart,
  AttachmentAdmissionPart,
  EncodedFileAttachment,
  EncodedVideoAttachment,
  FileAttachmentRef,
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageRequestTarget,
  RequestImageAttachment,
  SaveFileAttachment,
  SaveFileStreamAttachment,
  SaveImageAttachment,
  SaveVideoAttachment,
  SaveVideoStreamAttachment,
  StoredAttachment,
  VideoAttachmentLimits,
  VideoAttachmentRef,
} from "./types";

declare module "@deepseek-ai/cordis" {
  interface Context {
    attachments: AttachmentStore;
  }
}

/**
 * Immutable binary attachment service (`ctx.attachments`).
 *
 * Implementations validate and normalize bytes before publishing an immutable
 * content-addressed reference. Sessions, databases, and LLM turns interact
 * strictly with this contract, so the underlying storage driver (local disk,
 * Cloudflare R2, S3) stays swappable.
 *
 * Ported from `packages/attachment/attachment/src/index.ts` in the reference
 * deepseek-harness repository: the service shape, admission delegation and
 * default unsupported answers are kept; the reference's video read-stream and
 * host-path hooks are represented by this repository's generic
 * {@link StoredAttachment} result and omitted where no host file exists.
 */
export abstract class AttachmentStore extends Service {
  constructor(ctx: Context) {
    super(ctx, "attachments");
  }

  /**
   * Deployment-resolved image admission policy.
   */
  abstract readonly imageLimits: ImageAttachmentLimits;

  /**
   * Deployment-resolved video admission policy. Backends without video support
   * keep empty media types.
   */
  readonly videoLimits: VideoAttachmentLimits = Object.freeze({
    maxVideoBytes: 0,
    mediaTypes: Object.freeze([] as const),
  });

  /**
   * Validate one image without writing to storage.
   */
  abstract validateImage(input: SaveImageAttachment): Promise<void>;

  /**
   * Validate and durably commit an ordered batch of images.
   * If any image fails validation or admission, the batch fails without persisting.
   */
  async saveImages(
    inputs: readonly SaveImageAttachment[],
  ): Promise<readonly ImageAttachmentRef[]> {
    validateImageBatchLimits(inputs, this.imageLimits);
    for (const input of inputs) {
      await this.validateImage(input);
    }
    const refs: ImageAttachmentRef[] = [];
    for (const input of inputs) {
      refs.push(await this.saveImage(input));
    }
    return refs;
  }

  /**
   * Admit one Host prompt, replacing each uploaded image or video with its
   * durable reference. Text and durable file references pass through
   * unchanged.
   */
  async admitPromptContent(
    content: readonly AttachmentAdmissionPart[],
  ): Promise<AdmittedPromptContentPart[]> {
    const hasImage = content.some((part) => part.type === "image");
    const imageRefs = hasImage
      ? await admitEncodedImages(
          this,
          content.filter(
            (
              part,
            ): part is Extract<AttachmentAdmissionPart, { type: "image" }> =>
              part.type === "image",
          ),
        )
      : [];
    let nextImage = 0;
    const parts: AdmittedPromptContentPart[] = [];
    for (const part of content) {
      if (part.type === "text") {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "file") {
        parts.push({ type: "file", attachment: part.attachment });
      } else if (part.type === "image") {
        parts.push({
          type: "image",
          attachment: imageRefs[nextImage++] as ImageAttachmentRef,
        });
      } else if (part.type === "video") {
        if ("attachment" in part) {
          parts.push({ type: "video", attachment: part.attachment });
        } else {
          const videoRef = await admitVideoUpload(this, part);
          parts.push({ type: "video", attachment: videoRef });
        }
      }
    }
    return parts;
  }

  /**
   * Decode and durably commit one canonical base64 file upload.
   */
  admitEncodedFile(input: EncodedFileAttachment): Promise<FileAttachmentRef> {
    return admitFileUpload(this, input);
  }

  /**
   * Decode and durably commit one canonical base64 video upload.
   */
  admitEncodedVideo(input: EncodedVideoAttachment): Promise<VideoAttachmentRef> {
    return admitVideoUpload(this, input);
  }

  /**
   * Identify a failure emitted by this attachment capability by its stable code.
   */
  isAttachmentError(error: unknown): error is AttachmentError {
    return matchesAttachmentError(error);
  }

  /**
   * Validate and durably commit one image, returning an immutable ImageAttachmentRef.
   */
  abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>;

  /**
   * Read verified image bytes matching the provided ImageAttachmentRef.
   */
  abstract readImage(
    ref: ImageAttachmentRef,
    signal?: AbortSignal,
  ): Promise<StoredAttachment<ImageAttachmentRef>>;

  /**
   * Durably commit one file byte-for-byte.
   */
  async saveFile(input: SaveFileAttachment): Promise<FileAttachmentRef> {
    void input;
    throw new AttachmentError(
      "The mounted attachment provider cannot store verbatim files.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Durably commit one file from an asynchronous byte stream without buffering
   * everything in memory.
   */
  async saveFileStream(
    input: SaveFileStreamAttachment,
  ): Promise<FileAttachmentRef> {
    void input;
    throw new AttachmentError(
      "The mounted attachment provider cannot stream files.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Stream verified file chunks matching the provided FileAttachmentRef.
   */
  async *readFileStream(
    ref: FileAttachmentRef,
    signal?: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    signal?.throwIfAborted();
    void ref;
    throw new AttachmentError(
      "The mounted attachment provider cannot stream file reads.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Durably commit one video.
   */
  async saveVideo(input: SaveVideoAttachment): Promise<VideoAttachmentRef> {
    void input;
    throw new AttachmentError(
      "The mounted attachment provider cannot store videos.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Durably commit one video from an asynchronous byte stream.
   */
  async saveVideoStream(
    input: SaveVideoStreamAttachment,
  ): Promise<VideoAttachmentRef> {
    void input;
    throw new AttachmentError(
      "The mounted attachment provider cannot stream videos.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Read verified video bytes matching the provided VideoAttachmentRef.
   */
  async readVideo(
    ref: VideoAttachmentRef,
    signal?: AbortSignal,
  ): Promise<StoredAttachment<VideoAttachmentRef>> {
    signal?.throwIfAborted();
    void ref;
    throw new AttachmentError(
      "The mounted attachment provider cannot read videos.",
      "STORAGE_UNSUPPORTED",
    );
  }

  /**
   * Generate or read a deterministic, route-sized variant from the stored
   * normalized image. Providers without projection keep this default rejection.
   */
  async readImageRequest(
    ref: ImageAttachmentRef,
    target: ImageRequestTarget,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment> {
    signal?.throwIfAborted();
    void ref;
    void target;
    throw new AttachmentError(
      "The mounted attachment provider cannot derive model-request images.",
      "STORAGE_UNSUPPORTED",
    );
  }
}

export default AttachmentStore;
