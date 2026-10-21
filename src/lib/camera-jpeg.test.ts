import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { PHOTO_HEIGHT, PHOTO_WIDTH } from "./plan-pages.ts";
import { encodeCameraJpeg } from "./camera-jpeg.ts";

const require = createRequire(import.meta.url);
const jpeg = require("jpeg-js") as {
  decode: (
    data: Uint8Array,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ) => { data: Uint8Array; width: number; height: number };
};

const fill = (
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y);
      const index = (y * width + x) * 4;
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
};

const markers = (bytes: Uint8Array) => {
  const found: string[] = [];
  let restarts = 0;
  let sof = "";
  let dri = 0;
  let index = 0;
  while (index < bytes.length - 1) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    while (bytes[index] === 0xff) index += 1;
    const marker = bytes[index] ?? 0;
    index += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      if (marker >= 0xd0 && marker <= 0xd7) restarts += 1;
      found.push(marker.toString(16));
      if (marker === 0xd9) break;
      continue;
    }
    const length = ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0);
    if (marker === 0xc0) {
      const height = ((bytes[index + 3] ?? 0) << 8) | (bytes[index + 4] ?? 0);
      const width = ((bytes[index + 5] ?? 0) << 8) | (bytes[index + 6] ?? 0);
      const y = bytes[index + 9];
      const u = bytes[index + 12];
      const v = bytes[index + 15];
      sof = `${width}x${height} ${y?.toString(16)}/${u?.toString(16)}/${v?.toString(16)}`;
    }
    if (marker === 0xdd) dri = ((bytes[index + 2] ?? 0) << 8) | (bytes[index + 3] ?? 0);
    if (marker === 0xda) {
      index += length;
      continue;
    }
    found.push(marker.toString(16));
    index += length;
  }
  return { found, restarts, sof, dri };
};

test("camera jpeg is baseline 4:2:0 with a restart every 126 blocks", () => {
  const bytes = encodeCameraJpeg(fill(32, 16, () => [255, 255, 255]), 32, 16);
  const parsed = markers(bytes);
  assert.equal(parsed.sof, "32x16 22/11/11");
  assert.equal(parsed.dri, 126);
  assert.equal(parsed.restarts, 0);
  assert.deepEqual(parsed.found.slice(0, 6), ["d8", "e0", "db", "c0", "dd", "c4"]);
});

test("a restart is written between groups on a wide sheet", () => {
  const width = 126 * 16;
  const bytes = encodeCameraJpeg(fill(width, 32, () => [255, 255, 255]), width, 32);
  const parsed = markers(bytes);
  assert.equal(parsed.restarts, 1);
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, 32);
  assert.ok((decoded.data[0] ?? 0) > 250);
});

test("black and white blocks survive a round trip", () => {
  const pixels = fill(32, 32, (x, y) => (x < 16 && y < 16 ? [0, 0, 0] : [255, 255, 255]));
  const decoded = jpeg.decode(encodeCameraJpeg(pixels, 32, 32), {
    useTArray: true,
    formatAsRGBA: true,
  });
  assert.ok((decoded.data[0] ?? 255) < 8);
  const white = (16 * 32 + 16) * 4;
  assert.ok((decoded.data[white] ?? 0) > 247);
  assert.ok((decoded.data[white + 1] ?? 0) > 247);
  assert.ok((decoded.data[white + 2] ?? 0) > 247);
});

test("the left half of a block stays dark", () => {
  const decoded = jpeg.decode(
    encodeCameraJpeg(
      fill(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255])),
      16,
      16,
    ),
    { useTArray: true, formatAsRGBA: true },
  );
  assert.ok((decoded.data[0] ?? 255) < 40);
  assert.ok((decoded.data[8 * 4] ?? 0) > 200);
});

test("a red block stays red", () => {
  const decoded = jpeg.decode(
    encodeCameraJpeg(fill(16, 16, () => [255, 0, 0]), 16, 16),
    { useTArray: true, formatAsRGBA: true },
  );
  assert.ok((decoded.data[0] ?? 0) > 200);
  assert.ok((decoded.data[1] ?? 255) < 40);
  assert.ok((decoded.data[2] ?? 255) < 40);
});

test("a full camera frame restarts as often as the camera's own file", () => {
  const pixels = new Uint8ClampedArray(PHOTO_WIDTH * PHOTO_HEIGHT * 4);
  pixels.fill(255);
  const parsed = markers(encodeCameraJpeg(pixels, PHOTO_WIDTH, PHOTO_HEIGHT));
  assert.equal(parsed.sof, `${PHOTO_WIDTH}x${PHOTO_HEIGHT} 22/11/11`);
  assert.equal(parsed.dri, 126);
  assert.equal(parsed.restarts, 1535);
});
