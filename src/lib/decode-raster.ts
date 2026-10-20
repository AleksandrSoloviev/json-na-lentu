import UTIF from "utif";

import { MAX_RASTER_PIXELS, type Raster } from "./image-pages.ts";

const tooLarge = (): Error =>
  new Error("Слишком большой снимок. Обрежь его или сохрани поменьше.");

const unreadableTiff = (): Error =>
  new Error("Этот TIFF не разбирается. Сохрани снимок как PNG.");

export const looksLikeTiff = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  const little =
    bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
  const big =
    bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
  return little || big;
};

export const decodeTiffBuffer = (buffer: ArrayBuffer): Raster[] => {
  let directories: ReturnType<typeof UTIF.decode>;
  try {
    directories = UTIF.decode(buffer);
  } catch {
    throw unreadableTiff();
  }
  if (directories.length === 0) throw unreadableTiff();

  return directories.map((directory) => {
    try {
      UTIF.decodeImage(buffer, directory);
    } catch {
      throw unreadableTiff();
    }
    const width = directory.width ?? 0;
    const height = directory.height ?? 0;
    const rgba = UTIF.toRGBA8(directory);
    if (width < 1 || height < 1 || rgba.length < width * height * 4) {
      throw unreadableTiff();
    }
    if (width * height > MAX_RASTER_PIXELS) throw tooLarge();
    return {
      width,
      height,
      data: new Uint8ClampedArray(rgba),
    };
  });
};

const rasterFromBitmap = (bitmap: ImageBitmap): Raster => {
  if (bitmap.width * bitmap.height > MAX_RASTER_PIXELS) throw tooLarge();
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Не удалось прочитать пиксели.");
  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: image.data };
};

const isHeic = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
};

const isTiffFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return name.endsWith(".tif") || name.endsWith(".tiff") || file.type === "image/tiff";
};

export const decodeImageFile = async (file: File): Promise<Raster[]> => {
  if (isHeic(file)) {
    throw new Error("HEIC эта страница не открывает. В «Просмотре» сохрани PNG или TIFF.");
  }
  if (isTiffFile(file)) return decodeTiffBuffer(await file.arrayBuffer());

  try {
    const bitmap = await createImageBitmap(file);
    try {
      return [rasterFromBitmap(bitmap)];
    } finally {
      bitmap.close();
    }
  } catch {
    const buffer = await file.arrayBuffer();
    if (looksLikeTiff(buffer)) return decodeTiffBuffer(buffer);
    throw new Error("Нужен TIFF, PNG, JPEG, WebP, GIF или BMP.");
  }
};
