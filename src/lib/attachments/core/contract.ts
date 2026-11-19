import { AttachmentError } from "./errors";
import { DEFAULT_IMAGE_LIMITS, validateImageBatchLimits } from "./admission";
import type {
  AttachmentRef,
  FileAttachmentRef,
  AttachmentId,
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

/**
 * Immutable binary attachment store contract.
 *
 * Implementations validate and normalize bytes before publishing an immutable
 * content-addressed reference (AttachmentRef).
 *
 * Sessions, databases, and LLM turns interact strictly with this contract,
 * making the underlying storage driver (local disk, Cloudflare R2, S3) 100% swappable.
 */
export abstract class AttachmentStore {
  /**
   * Deployment-resolved image admission policy.
   */
  readonly imageLimits: ImageAttachmentLimits = DEFAULT_IMAGE_LIMITS;

  /**
   * Deployment-resolved video admission policy.
   */
  readonly videoLimits: VideoAttachmentLimits = Object.freeze({
    maxVideoBytes: 50 * 1024 * 1024, // 50MB
    mediaTypes: Object.freeze([
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ] as const),
  });

  // ─── Write Operations ───────────────────────────────────────────────────

  /**
   * Validate one image without writing to storage.
   */
  abstract validateImage(input: SaveImageAttachment): Promise<void>;

  /**
   * Validate and durably commit one image, returning an immutable ImageAttachmentRef.
   */
  abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>;

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
   * Durably commit one file from an asynchronous byte stream without buffering everything in memory.
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
   * Resolve an upload receipt id back to the durable ref it names.
   *
   * The browser refers to already-committed content by receipt id rather than
   * re-sending bytes, so the store must be able to answer "what is this".
   * Returns `null` when nothing is stored under that id.
   */
  async resolveReceipt(
    attachmentId: AttachmentId,
    signal?: AbortSignal,
  ): Promise<AttachmentRef | null> {
    void attachmentId;
    void signal;
    return null;
  }

  /**
   * Delete the stored object a ref names. Returns whether it is gone.
   */
  async deleteAttachment(ref: AttachmentRef): Promise<boolean> {
    void ref;
    return false;
  }

  // ─── Read Operations ────────────────────────────────────────────────────

  /**
   * Read verified image bytes matching the provided ImageAttachmentRef.
   */
  abstract readImage(
    ref: ImageAttachmentRef,
    signal?: AbortSignal,
  ): Promise<StoredAttachment<ImageAttachmentRef>>;

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

  // ─── Model / LLM Request Projection ─────────────────────────────────────

  /**
   * Generate or read a deterministic, route-sized variant from the stored normalized image.
   * Clamped to token budgets and formats expected by multimodal LLMs (Claude, OpenAI, Gemini).
   */
  abstract readImageRequest(
    ref: ImageAttachmentRef,
    target: ImageRequestTarget,
    signal?: AbortSignal,
  ): Promise<RequestImageAttachment>;

  // ─── Client / Browser URL Mapping ───────────────────────────────────────

  /**
   * Derive the public URL or local API route for UI consumption.
   */
  abstract getPublicUrl(ref: AttachmentRef): string;
}
