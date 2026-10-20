import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { decodeTiffBuffer } from "./decode-raster.ts";
import {
  inkPhoto,
  meanLuminance,
  planImageSlots,
  prepareImagePages,
  sampleSlot,
  type Raster,
} from "./image-pages.ts";

const require = createRequire(import.meta.url);
const UTIF = require("utif") as {
  encodeImage: (rgba: Uint8Array, width: number, height: number) => ArrayBuffer;
};

const raster = (width: number, height: number, pixels: number[]): Raster => ({
  width,
  height,
  data: Uint8ClampedArray.from(pixels),
});

const smallPlan = {
  pageWidth: 4,
  frameHeight: 4,
  squareSize: 4,
  maxStripHeight: 4,
  maxNativeHeight: 4,
};

test("native fit keeps a wide screenshot in one short frame", () => {
  const planned = planImageSlots(8, 4, "native", smallPlan);
  assert.equal(planned.truncated, false);
  assert.equal(planned.slots.length, 1);
  assert.deepEqual(planned.slots[0], {
    width: 4,
    height: 2,
    sx: 0,
    sy: 0,
    sw: 8,
    sh: 4,
    dx: 0,
    dy: 0,
    dw: 4,
    dh: 2,
  });
});

test("a tall image is sliced and the rest is marked when the page limit is hit", () => {
  const planned = planImageSlots(4, 12, "strip", { ...smallPlan, maxPages: 2 });
  assert.equal(planned.truncated, true);
  assert.equal(planned.slots.length, 2);
  assert.equal(planned.slots[0]?.sy, 0);
  assert.equal(planned.slots[0]?.sh, 4);
  assert.equal(planned.slots[1]?.sy, 4);
  assert.equal(planned.slots[1]?.height, 4);
});

test("frame fit letterboxes a wide picture", () => {
  const slot = planImageSlots(4, 2, "frame", smallPlan).slots[0];
  assert.equal(slot?.width, 4);
  assert.equal(slot?.height, 4);
  assert.equal(slot?.dw, 4);
  assert.equal(slot?.dh, 2);
  assert.equal(slot?.dy, 1);
});

test("sampling averages a black and white pair into the print pixel", () => {
  const source = raster(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]);
  const sampled = sampleSlot(source, {
    width: 1,
    height: 1,
    sx: 0,
    sy: 0,
    sw: 2,
    sh: 1,
    dx: 0,
    dy: 0,
    dw: 1,
    dh: 1,
  });
  assert.ok((sampled[0] ?? 0) > 100 && (sampled[0] ?? 0) < 160);
});

test("transparent pixels sit on white paper", () => {
  const source = raster(1, 1, [0, 0, 0, 0]);
  const prepared = prepareImagePages(source, { fit: "native", ink: "screenshot" });
  const pixel = prepared.pages[0]?.data[0];
  assert.equal(pixel, 255);
});

test("a dark screenshot is inverted into black text on white", () => {
  const source = raster(2, 1, [20, 20, 20, 255, 230, 230, 230, 255]);
  assert.ok(meanLuminance(source) < 128);
  const prepared = prepareImagePages(source, { fit: "frame", ink: "screenshot" });
  assert.equal(prepared.inverted, true);
  const data = prepared.pages[0]?.data ?? new Uint8ClampedArray();
  const darkInk = data[0] === 0;
  const paper = data[(1 * 4) + 0] === 255 || data.some((value, index) => index % 4 === 0 && value === 255);
  assert.equal(darkInk, false);
  assert.equal(paper, true);
  assert.ok(data.some((value, index) => index % 4 === 0 && value === 0));
});

test("photo ink uses only black and white dots", () => {
  const data = Uint8ClampedArray.from([
    0, 0, 0, 255,
    80, 80, 80, 255,
    160, 160, 160, 255,
    255, 255, 255, 255,
  ]);
  inkPhoto(data, 4, 1);
  for (let index = 0; index < data.length; index += 4) {
    assert.ok(data[index] === 0 || data[index] === 255);
  }
  assert.ok(data.includes(0));
  assert.ok(data.includes(255));
});

test("TIFF bytes from a Mac-style file come back as pixels", () => {
  const rgba = Uint8Array.from([10, 10, 10, 255, 240, 240, 240, 255]);
  const encoded = UTIF.encodeImage(rgba, 2, 1);
  const decoded = decodeTiffBuffer(encoded);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0]?.width, 2);
  assert.equal(decoded[0]?.height, 1);
  assert.equal(decoded[0]?.data[0], 10);
  assert.equal(decoded[0]?.data[4], 240);
});
