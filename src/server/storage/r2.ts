import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { ApiError, ErrorCodes } from "@/server/errors";

export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL of the bucket (e.g. https://pub-abc.r2.dev). */
  publicBaseUrl: string;
}

export interface PutResult {
  id: string;
  previewUrl: string;
}

export interface GetResult {
  stream: ReadableStream<Uint8Array>;
  mime: string;
  bytes: number;
}

export interface HeadResult {
  mime: string;
  bytes: number;
  lastModified: Date;
}

const KEY_PREFIX = "images/";
const ID_LENGTH = 12;

export class R2Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    // Strip trailing slash so previewUrl concatenation is clean.
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/+$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(buf: Buffer, mime: string): Promise<PutResult> {
    const id = nanoid(ID_LENGTH);
    const key = KEY_PREFIX + id;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buf,
          ContentType: mime,
          ContentLength: buf.byteLength,
        }),
      );
    } catch (err) {
      console.error("R2 put failed:", err);
      throw new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to store image.");
    }
    return { id, previewUrl: `${this.publicBaseUrl}/${key}` };
  }

  async get(id: string): Promise<GetResult> {
    const key = KEY_PREFIX + id;
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!out.Body) {
        throw new ApiError(ErrorCodes.NOT_FOUND, "Image not found.");
      }
      return {
        stream: out.Body.transformToWebStream(),
        mime: out.ContentType ?? "application/octet-stream",
        bytes: out.ContentLength ?? 0,
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof NoSuchKey) {
        throw new ApiError(ErrorCodes.NOT_FOUND, "Image not found.");
      }
      console.error("R2 get failed:", err);
      throw new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to fetch image.");
    }
  }

  /** Cheap existence + metadata probe (no body bytes). */
  async head(id: string): Promise<HeadResult> {
    const key = KEY_PREFIX + id;
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        mime: out.ContentType ?? "application/octet-stream",
        bytes: out.ContentLength ?? 0,
        lastModified: out.LastModified ?? new Date(),
      };
    } catch (err) {
      if (err instanceof NotFound || err instanceof NoSuchKey) {
        throw new ApiError(ErrorCodes.NOT_FOUND, "Image not found.");
      }
      console.error("R2 head failed:", err);
      throw new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to fetch image.");
    }
  }

  /** Idempotent: deleting a missing key resolves without throwing. */
  async delete(id: string): Promise<void> {
    const key = KEY_PREFIX + id;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      if (err instanceof NoSuchKey) return;
      console.error("R2 delete failed:", err);
      throw new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to delete image.");
    }
  }

  /**
   * List ids whose `LastModified` is older than `olderThan`. Paginates through
   * the bucket — the cron job calls this every few minutes so the page size
   * doesn't need to be tuned.
   */
  async listExpired(olderThan: Date): Promise<string[]> {
    const ids: string[] = [];
    let continuationToken: string | undefined;
    try {
      do {
        const out = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: KEY_PREFIX,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of out.Contents ?? []) {
          if (!obj.Key || !obj.LastModified) continue;
          if (obj.LastModified.getTime() < olderThan.getTime()) {
            ids.push(obj.Key.slice(KEY_PREFIX.length));
          }
        }
        continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (err) {
      console.error("R2 list failed:", err);
      throw new ApiError(ErrorCodes.STORAGE_FAILED, "Failed to list images.");
    }
    return ids;
  }
}

/** Build an `R2Storage` from validated env vars. */
export function createR2StorageFromEnv(env: {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;
}): R2Storage {
  return new R2Storage({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  });
}
