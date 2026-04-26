import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiError, ErrorCodes } from "@/server/errors";
import { R2Storage } from "@/server/storage/r2";

/**
 * Real R2 integration is deferred (needs live credentials). These tests
 * mock `@aws-sdk/client-s3` and verify:
 *  - happy paths build the right commands and previewUrl
 *  - errors are mapped to ApiError with the right codes
 *  - `delete` is idempotent
 *  - underlying error messages are not leaked to clients (OWASP A09)
 *
 * NOTE: rejected mocks use `mockImplementation(async () => { throw ... })`
 * rather than `mockRejectedValue(err)` because the latter constructs the
 * rejected promise eagerly when defined, triggering vitest's unhandled-
 * rejection detection before the test can consume it.
 */

const sendMock = vi.hoisted(() => vi.fn());
const FakeNoSuchKey = vi.hoisted(() => {
  return class FakeNoSuchKey extends Error {
    constructor() {
      super("not found");
      this.name = "NoSuchKey";
    }
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({
      __type: "Put",
      input,
    })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({
      __type: "Get",
      input,
    })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({
      __type: "Delete",
      input,
    })),
    HeadObjectCommand: vi.fn().mockImplementation((input) => ({
      __type: "Head",
      input,
    })),
    ListObjectsV2Command: vi.fn().mockImplementation((input) => ({
      __type: "List",
      input,
    })),
    NoSuchKey: FakeNoSuchKey,
    NotFound: FakeNoSuchKey,
  };
});

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  sendMock.mockReset();
  // Source `console.error`s the underlying error before mapping to ApiError
  // (server-side log, OWASP A09). Silence in tests to keep output clean and
  // prevent vitest from surfacing the logged Error as a test failure.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Restore only the console.error spy — `vi.restoreAllMocks()` would also
  // restore the S3 client mocks declared via `vi.mock(...)`, breaking later
  // tests in this file.
  consoleErrorSpy?.mockRestore();
});

const config = {
  accountId: "acc",
  accessKeyId: "ak",
  secretAccessKey: "sk",
  bucket: "images",
  publicBaseUrl: "https://pub-xyz.r2.dev",
};

describe("R2Storage.put", () => {
  it("uploads via PutObjectCommand and returns previewUrl with images/ prefix", async () => {
    sendMock.mockResolvedValue({});
    const storage = new R2Storage(config);
    const buf = Buffer.from([1, 2, 3, 4]);

    const { id, previewUrl } = await storage.put(buf, "image/png");

    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(previewUrl).toBe(`https://pub-xyz.r2.dev/images/${id}`);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0]?.[0];
    expect(cmd.__type).toBe("Put");
    expect(cmd.input).toMatchObject({
      Bucket: "images",
      Key: `images/${id}`,
      ContentType: "image/png",
      ContentLength: 4,
    });
  });

  it("strips trailing slash from publicBaseUrl", async () => {
    sendMock.mockResolvedValue({});
    const storage = new R2Storage({
      ...config,
      publicBaseUrl: "https://pub-xyz.r2.dev///",
    });

    const { previewUrl } = await storage.put(Buffer.from([1]), "image/png");

    expect(previewUrl).toMatch(/^https:\/\/pub-xyz\.r2\.dev\/images\//);
    expect(previewUrl).not.toContain("//images");
  });

  it("maps S3 errors to STORAGE_FAILED without leaking details", async () => {
    sendMock.mockImplementation(async () => {
      throw new Error("AccessDenied: secret key wrong xyz");
    });
    const storage = new R2Storage(config);

    try {
      await storage.put(Buffer.from([1]), "image/png");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe(ErrorCodes.STORAGE_FAILED);
      expect((err as ApiError).message).not.toContain("AccessDenied");
      expect((err as ApiError).message).not.toContain("secret");
    }
  });
});

describe("R2Storage.get", () => {
  it("returns stream + metadata on hit", async () => {
    const fakeStream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        c.close();
      },
    });
    sendMock.mockResolvedValue({
      Body: { transformToWebStream: () => fakeStream },
      ContentType: "image/png",
      ContentLength: 3,
    });

    const storage = new R2Storage(config);
    const out = await storage.get("abc123");

    expect(out.stream).toBe(fakeStream);
    expect(out.mime).toBe("image/png");
    expect(out.bytes).toBe(3);
  });

  it("maps NoSuchKey to NOT_FOUND", async () => {
    sendMock.mockImplementation(async () => {
      throw new FakeNoSuchKey();
    });
    const storage = new R2Storage(config);

    await expect(storage.get("missing")).rejects.toMatchObject({
      name: "ApiError",
      code: ErrorCodes.NOT_FOUND,
    });
  });

  it("maps other errors to STORAGE_FAILED", async () => {
    sendMock.mockImplementation(async () => {
      throw new Error("network down");
    });
    const storage = new R2Storage(config);

    await expect(storage.get("abc")).rejects.toMatchObject({
      code: ErrorCodes.STORAGE_FAILED,
    });
  });

  it("treats missing Body as NOT_FOUND", async () => {
    sendMock.mockResolvedValue({ ContentType: "image/png", ContentLength: 0 });
    const storage = new R2Storage(config);

    await expect(storage.get("abc")).rejects.toMatchObject({
      code: ErrorCodes.NOT_FOUND,
    });
  });
});

describe("R2Storage.delete", () => {
  it("issues a DeleteObjectCommand for the right key", async () => {
    sendMock.mockResolvedValue({});
    const storage = new R2Storage(config);

    await storage.delete("xyz789");

    const cmd = sendMock.mock.calls[0]?.[0];
    expect(cmd.__type).toBe("Delete");
    expect(cmd.input).toEqual({ Bucket: "images", Key: "images/xyz789" });
  });

  it("is idempotent: NoSuchKey resolves without throwing", async () => {
    sendMock.mockImplementation(async () => {
      throw new FakeNoSuchKey();
    });
    const storage = new R2Storage(config);

    await expect(storage.delete("missing")).resolves.toBeUndefined();
  });

  it("propagates other errors as STORAGE_FAILED", async () => {
    sendMock.mockImplementation(async () => {
      throw new Error("kaboom");
    });
    const storage = new R2Storage(config);

    await expect(storage.delete("x")).rejects.toMatchObject({
      code: ErrorCodes.STORAGE_FAILED,
    });
  });
});

describe("R2Storage.listExpired", () => {
  it("returns ids whose LastModified is older than the cutoff", async () => {
    const cutoff = new Date("2024-01-01T12:00:00Z");
    sendMock.mockResolvedValueOnce({
      Contents: [
        { Key: "images/old1", LastModified: new Date("2024-01-01T11:00:00Z") },
        { Key: "images/fresh", LastModified: new Date("2024-01-01T12:30:00Z") },
        { Key: "images/old2", LastModified: new Date("2024-01-01T10:00:00Z") },
      ],
      IsTruncated: false,
    });
    const storage = new R2Storage(config);

    const ids = await storage.listExpired(cutoff);

    expect(ids).toEqual(["old1", "old2"]);
  });

  it("paginates through ContinuationToken", async () => {
    const cutoff = new Date("2024-01-01T12:00:00Z");
    sendMock
      .mockResolvedValueOnce({
        Contents: [
          { Key: "images/a", LastModified: new Date("2024-01-01T11:00:00Z") },
        ],
        IsTruncated: true,
        NextContinuationToken: "TOKEN",
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: "images/b", LastModified: new Date("2024-01-01T11:30:00Z") },
        ],
        IsTruncated: false,
      });
    const storage = new R2Storage(config);

    const ids = await storage.listExpired(cutoff);

    expect(ids).toEqual(["a", "b"]);
    const secondCall = sendMock.mock.calls[1]?.[0];
    expect(secondCall?.input.ContinuationToken).toBe("TOKEN");
  });
});
