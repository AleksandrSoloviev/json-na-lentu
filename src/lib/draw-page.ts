import { encodeCameraJpeg } from "@/lib/camera-jpeg";
import { PHOTO_HEIGHT, PHOTO_WIDTH, type PagePlan } from "@/lib/plan-pages";

export type PreviewFrame =
  | {
      kind: "text";
      width: number;
      height: number;
      page: PagePlan;
    }
  | {
      kind: "image";
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
      data: Uint8ClampedArray;
      dx: number;
      dy: number;
      dw: number;
      dh: number;
    };

const INK_CUTOFF = 188;

const scaledSize = (scale: number): { width: number; height: number } => ({
  width: Math.max(1, Math.round(PHOTO_WIDTH * scale)),
  height: Math.max(1, Math.round(PHOTO_HEIGHT * scale)),
});

const flattenInk = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void => {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance =
      pixels[index] * 0.299 +
      pixels[index + 1] * 0.587 +
      pixels[index + 2] * 0.114;
    const value = luminance < INK_CUTOFF ? 0 : 255;
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
};

export const drawPage = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
  scale = 1,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  const { width, height } = scaledSize(scale);
  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.font = `700 ${page.fontSize * scale}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";
  page.lines.forEach((line, index) => {
    context.fillText(
      line,
      page.padding * scale,
      (page.padding + index * page.linePx) * scale,
    );
  });
  flattenInk(context, width, height);
};

export const paintImage = (
  canvas: HTMLCanvasElement,
  page: {
    sourceWidth: number;
    sourceHeight: number;
    data: Uint8ClampedArray;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  },
  scale = 1,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const { width, height } = scaledSize(scale);
  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const source = document.createElement("canvas");
  source.width = page.sourceWidth;
  source.height = page.sourceHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return;
  const copy = new Uint8ClampedArray(page.data);
  sourceContext.putImageData(new ImageData(copy, page.sourceWidth, page.sourceHeight), 0, 0);
  context.drawImage(
    source,
    Math.round(page.dx * scale),
    Math.round(page.dy * scale),
    Math.max(1, Math.round(page.dw * scale)),
    Math.max(1, Math.round(page.dh * scale)),
  );
};

export const renderFrame = (
  canvas: HTMLCanvasElement,
  frame: PreviewFrame,
  fontFamily: string,
  scale = 1,
): void => {
  if (frame.kind === "image") {
    paintImage(canvas, frame, scale);
    return;
  }
  drawPage(canvas, frame.page, fontFamily, scale);
};

export const canvasToJpeg = (canvas: HTMLCanvasElement): Promise<Blob> => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return Promise.reject(new Error("Не удалось собрать JPEG"));
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = encodeCameraJpeg(image.data, canvas.width, canvas.height);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return Promise.resolve(new Blob([copy], { type: "image/jpeg" }));
};
