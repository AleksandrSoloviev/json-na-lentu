import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_PAGES,
  MAX_STRIP_HEIGHT,
  SQUARE_SIZE,
} from "./plan-pages.ts";

export const MAX_NATIVE_HEIGHT = 1600;
export const MAX_RASTER_PIXELS = 40_000_000;
export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
const SCREEN_CUTOFF = 168;
const SAMPLE_SPAN = 4;

export type Raster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type ImageFit = "native" | "frame" | "square" | "strip";
export type ImageInk = "screenshot" | "photo";

export type ImageSlot = {
  width: number;
  height: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

export type ImagePage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type ImagePlanOptions = {
  maxPages?: number;
  pageWidth?: number;
  frameHeight?: number;
  squareSize?: number;
  maxStripHeight?: number;
  maxNativeHeight?: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const composite = (
  red: number,
  green: number,
  blue: number,
  alpha: number,
): [number, number, number] => {
  const cover = alpha / 255;
  return [
    red * cover + 255 * (1 - cover),
    green * cover + 255 * (1 - cover),
    blue * cover + 255 * (1 - cover),
  ];
};

const luminance = (red: number, green: number, blue: number): number =>
  red * 0.299 + green * 0.587 + blue * 0.114;

const sliceVertically = (
  srcWidth: number,
  srcHeight: number,
  pageWidth: number,
  maxPageHeight: number,
  maxPages: number,
): { slots: ImageSlot[]; truncated: boolean } => {
  const scale = pageWidth / srcWidth;
  const maxSrcSlice = Math.max(1, Math.floor(maxPageHeight / scale));
  const sliceCount = Math.ceil(srcHeight / maxSrcSlice);
  const kept = Math.min(sliceCount, maxPages);
  const slots: ImageSlot[] = [];

  for (let index = 0; index < kept; index += 1) {
    const sy = index * maxSrcSlice;
    const sh = Math.min(maxSrcSlice, srcHeight - sy);
    const height = Math.max(1, Math.round(sh * scale));
    slots.push({
      width: pageWidth,
      height,
      sx: 0,
      sy,
      sw: srcWidth,
      sh,
      dx: 0,
      dy: 0,
      dw: pageWidth,
      dh: height,
    });
  }

  return { slots, truncated: sliceCount > kept };
};

const containSlot = (
  srcWidth: number,
  srcHeight: number,
  pageWidth: number,
  pageHeight: number,
): ImageSlot => {
  const scale = Math.min(pageWidth / srcWidth, pageHeight / srcHeight);
  const dw = Math.max(1, Math.round(srcWidth * scale));
  const dh = Math.max(1, Math.round(srcHeight * scale));
  return {
    width: pageWidth,
    height: pageHeight,
    sx: 0,
    sy: 0,
    sw: srcWidth,
    sh: srcHeight,
    dx: Math.floor((pageWidth - dw) / 2),
    dy: Math.floor((pageHeight - dh) / 2),
    dw,
    dh,
  };
};

export const planImageSlots = (
  srcWidth: number,
  srcHeight: number,
  fit: ImageFit,
  options: ImagePlanOptions = {},
): { slots: ImageSlot[]; truncated: boolean } => {
  if (srcWidth < 1 || srcHeight < 1) return { slots: [], truncated: false };

  const maxPages = options.maxPages ?? MAX_PAGES;
  const pageWidth = options.pageWidth ?? FRAME_WIDTH;
  const frameHeight = options.frameHeight ?? FRAME_HEIGHT;
  const squareSize = options.squareSize ?? SQUARE_SIZE;
  const maxStripHeight = options.maxStripHeight ?? MAX_STRIP_HEIGHT;
  const maxNativeHeight = options.maxNativeHeight ?? MAX_NATIVE_HEIGHT;

  if (fit === "frame") {
    return {
      slots: [containSlot(srcWidth, srcHeight, pageWidth, frameHeight)],
      truncated: false,
    };
  }
  if (fit === "square") {
    return {
      slots: [containSlot(srcWidth, srcHeight, squareSize, squareSize)],
      truncated: false,
    };
  }
  if (fit === "strip") {
    return sliceVertically(srcWidth, srcHeight, pageWidth, maxStripHeight, maxPages);
  }

  const fullHeight = Math.max(1, Math.round((srcHeight * pageWidth) / srcWidth));
  if (fullHeight <= maxNativeHeight) {
    return {
      slots: [
        {
          width: pageWidth,
          height: fullHeight,
          sx: 0,
          sy: 0,
          sw: srcWidth,
          sh: srcHeight,
          dx: 0,
          dy: 0,
          dw: pageWidth,
          dh: fullHeight,
        },
      ],
      truncated: false,
    };
  }

  return sliceVertically(srcWidth, srcHeight, pageWidth, maxNativeHeight, maxPages);
};

export const sampleSlot = (
  raster: Raster,
  slot: ImageSlot,
  invert = false,
): Uint8ClampedArray => {
  const output = new Uint8ClampedArray(slot.width * slot.height * 4);
  output.fill(255);
  const source = raster.data;

  for (let y = 0; y < slot.dh; y += 1) {
    const srcY0 = slot.sy + (y * slot.sh) / slot.dh;
    const srcY1 = slot.sy + ((y + 1) * slot.sh) / slot.dh;
    const yStart = clamp(Math.floor(srcY0), 0, raster.height - 1);
    const yEnd = clamp(Math.ceil(srcY1), yStart + 1, raster.height);
    const yStep = Math.max(1, Math.floor((yEnd - yStart) / SAMPLE_SPAN));

    for (let x = 0; x < slot.dw; x += 1) {
      const srcX0 = slot.sx + (x * slot.sw) / slot.dw;
      const srcX1 = slot.sx + ((x + 1) * slot.sw) / slot.dw;
      const xStart = clamp(Math.floor(srcX0), 0, raster.width - 1);
      const xEnd = clamp(Math.ceil(srcX1), xStart + 1, raster.width);
      const xStep = Math.max(1, Math.floor((xEnd - xStart) / SAMPLE_SPAN));
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      let count = 0;

      for (let yy = yStart; yy < yEnd; yy += yStep) {
        for (let xx = xStart; xx < xEnd; xx += xStep) {
          const index = (yy * raster.width + xx) * 4;
          let [red, green, blue] = composite(
            source[index] ?? 255,
            source[index + 1] ?? 255,
            source[index + 2] ?? 255,
            source[index + 3] ?? 255,
          );
          if (invert) {
            red = 255 - red;
            green = 255 - green;
            blue = 255 - blue;
          }
          redSum += red;
          greenSum += green;
          blueSum += blue;
          count += 1;
        }
      }

      const offset = ((slot.dy + y) * slot.width + (slot.dx + x)) * 4;
      output[offset] = redSum / count;
      output[offset + 1] = greenSum / count;
      output[offset + 2] = blueSum / count;
      output[offset + 3] = 255;
    }
  }

  return output;
};

export const meanLuminance = (raster: Raster): number => {
  const step = Math.max(1, Math.floor(Math.sqrt((raster.width * raster.height) / 4000)));
  let sum = 0;
  let count = 0;

  for (let y = 0; y < raster.height; y += step) {
    for (let x = 0; x < raster.width; x += step) {
      const index = (y * raster.width + x) * 4;
      const [red, green, blue] = composite(
        raster.data[index] ?? 255,
        raster.data[index + 1] ?? 255,
        raster.data[index + 2] ?? 255,
        raster.data[index + 3] ?? 255,
      );
      sum += luminance(red, green, blue);
      count += 1;
    }
  }

  return count === 0 ? 255 : sum / count;
};

export const inkScreenshot = (data: Uint8ClampedArray): void => {
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 255;
    const green = data[index + 1] ?? 255;
    const blue = data[index + 2] ?? 255;
    const value = luminance(red, green, blue) < SCREEN_CUTOFF ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
};

export const inkPhoto = (data: Uint8ClampedArray, width: number, height: number): void => {
  const tone = new Float32Array(width * height);
  for (let index = 0; index < tone.length; index += 1) {
    const offset = index * 4;
    tone[index] = luminance(
      data[offset] ?? 255,
      data[offset + 1] ?? 255,
      data[offset + 2] ?? 255,
    );
  }

  const spread = (index: number, amount: number) => {
    tone[index] = clamp((tone[index] ?? 0) + amount, 0, 255);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const oldTone = tone[index] ?? 0;
      const value = oldTone < 128 ? 0 : 255;
      const error = oldTone - value;
      tone[index] = value;
      if (x + 1 < width) spread(index + 1, (error * 7) / 16);
      if (y + 1 < height) {
        if (x > 0) spread(index + width - 1, (error * 3) / 16);
        spread(index + width, (error * 5) / 16);
        if (x + 1 < width) spread(index + width + 1, error / 16);
      }
    }
  }

  for (let index = 0; index < tone.length; index += 1) {
    const value = (tone[index] ?? 0) < 128 ? 0 : 255;
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
};

export const prepareImagePages = (
  raster: Raster,
  options: { fit: ImageFit; ink: ImageInk; maxPages?: number },
): { pages: ImagePage[]; truncated: boolean; inverted: boolean } => {
  const planned = planImageSlots(raster.width, raster.height, options.fit, {
    maxPages: options.maxPages,
  });
  const inverted = options.ink === "screenshot" && meanLuminance(raster) < 128;
  const pages = planned.slots.map((slot) => {
    const data = sampleSlot(raster, slot, inverted);
    if (options.ink === "photo") inkPhoto(data, slot.width, slot.height);
    else inkScreenshot(data);
    return { width: slot.width, height: slot.height, data };
  });

  return { pages, truncated: planned.truncated, inverted };
};

export const isImageFile = (file: File): boolean => {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return [".tif", ".tiff", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic", ".heif", ".avif"].some(
    (extension) => name.endsWith(extension),
  );
};
