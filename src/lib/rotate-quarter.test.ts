import assert from "node:assert/strict";
import test from "node:test";

import { rotatePixels } from "./rotate-quarter.ts";

const pixel = (
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): number[] => {
  const index = (y * width + x) * 4;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
};

test("rotatePixels turns a frame clockwise and counter-clockwise", () => {
  const source = new Uint8ClampedArray([
    10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255,
  ]);

  const clockwise = rotatePixels(2, 2, source, 90);
  assert.deepEqual([clockwise.width, clockwise.height], [2, 2]);
  assert.deepEqual(pixel(clockwise.data, 2, 0, 0), [30, 0, 0]);
  assert.deepEqual(pixel(clockwise.data, 2, 1, 0), [10, 0, 0]);
  assert.deepEqual(pixel(clockwise.data, 2, 0, 1), [40, 0, 0]);
  assert.deepEqual(pixel(clockwise.data, 2, 1, 1), [20, 0, 0]);

  const counter = rotatePixels(2, 2, source, -90);
  assert.deepEqual(pixel(counter.data, 2, 0, 0), [20, 0, 0]);
  assert.deepEqual(pixel(counter.data, 2, 1, 0), [40, 0, 0]);
  assert.deepEqual(pixel(counter.data, 2, 0, 1), [10, 0, 0]);
  assert.deepEqual(pixel(counter.data, 2, 1, 1), [30, 0, 0]);
});

test("rotatePixels swaps the sides of a wide strip", () => {
  const source = new Uint8ClampedArray(3 * 1 * 4);
  source[0] = 1;
  source[4] = 2;
  source[8] = 3;
  const turned = rotatePixels(3, 1, source, 90);
  assert.deepEqual([turned.width, turned.height], [1, 3]);
  assert.equal(turned.data[0], 1);
  assert.equal(turned.data[4], 2);
  assert.equal(turned.data[8], 3);
});
