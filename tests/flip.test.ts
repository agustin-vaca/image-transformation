import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { Flipper } from "@/server/processor/flip";

/**
 * Build a tiny PNG with a distinctive left/right asymmetry so we can detect
 * the flip pixel-perfectly: a 4×1 image of [red, red, blue, blue].
 */
async function makeStripe(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from([
          255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
        ]),
        raw: { width: 4, height: 1, channels: 4 },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

async function rawPixels(
  png: Buffer,
): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

describe("Flipper", () => {
  it("mirrors pixels horizontally", async () => {
    const input = await makeStripe();
    const output = await new Flipper().flip(input);

    const { data, info } = await rawPixels(output);
    expect(info.width).toBe(4);
    expect(info.height).toBe(1);
    expect(info.channels).toBe(4);

    // Input row was [R, R, B, B]; flipped should be [B, B, R, R].
    const px = (i: number) => Array.from(data.subarray(i * 4, i * 4 + 4));
    expect(px(0)).toEqual([0, 0, 255, 255]);
    expect(px(1)).toEqual([0, 0, 255, 255]);
    expect(px(2)).toEqual([255, 0, 0, 255]);
    expect(px(3)).toEqual([255, 0, 0, 255]);
  });

  it("preserves the alpha channel", async () => {
    const transparent = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const flipped = await new Flipper().flip(transparent);
    const { info } = await rawPixels(flipped);

    expect(info.channels).toBe(4);
    const meta = await sharp(flipped).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it("input pixel (0,y) equals output pixel (width-1,y)", async () => {
    const input = await makeStripe();
    const output = await new Flipper().flip(input);

    const inRaw = await rawPixels(input);
    const outRaw = await rawPixels(output);
    const w = inRaw.info.width;

    const left = Array.from(inRaw.data.subarray(0, 4));
    const right = Array.from(outRaw.data.subarray((w - 1) * 4, w * 4));
    expect(left).toEqual(right);
  });
});
