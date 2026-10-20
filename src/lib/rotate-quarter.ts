export type QuarterTurn = 0 | 90 | -90;

export const rotatePixels = (
  width: number,
  height: number,
  data: Uint8ClampedArray,
  turn: 90 | -90,
): { width: number; height: number; data: Uint8ClampedArray } => {
  const nextWidth = height;
  const nextHeight = width;
  const next = new Uint8ClampedArray(nextWidth * nextHeight * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const destX = turn === 90 ? height - 1 - y : y;
      const destY = turn === 90 ? x : width - 1 - x;
      const dest = (destY * nextWidth + destX) * 4;
      next[dest] = data[source] ?? 0;
      next[dest + 1] = data[source + 1] ?? 0;
      next[dest + 2] = data[source + 2] ?? 0;
      next[dest + 3] = data[source + 3] ?? 255;
    }
  }

  return { width: nextWidth, height: nextHeight, data: next };
};

export const turnCanvas = (
  canvas: HTMLCanvasElement,
  turn: QuarterTurn,
): void => {
  if (turn === 0 || canvas.width === 0 || canvas.height === 0) return;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const turned = rotatePixels(canvas.width, canvas.height, source.data, turn);
  const pixels = new Uint8ClampedArray(turned.data.length);
  pixels.set(turned.data);
  canvas.width = turned.width;
  canvas.height = turned.height;
  context.putImageData(new ImageData(pixels, turned.width, turned.height), 0, 0);
};
