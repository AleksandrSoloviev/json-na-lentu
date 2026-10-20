import type { PagePlan } from "@/lib/plan-pages";

export type PreviewFrame =
  | { kind: "text"; width: number; height: number; page: PagePlan }
  | { kind: "image"; width: number; height: number; data: Uint8ClampedArray };

const INK_CUTOFF = 188;

export const drawPage = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  canvas.width = page.width;
  canvas.height = page.height;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, page.width, page.height);
  context.fillStyle = "#000000";
  context.font = `700 ${page.fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";

  page.lines.forEach((line, index) => {
    context.fillText(line, page.padding, page.padding + index * page.linePx);
  });

  const image = context.getImageData(0, 0, page.width, page.height);
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

export const paintImage = (
  canvas: HTMLCanvasElement,
  page: { width: number; height: number; data: Uint8ClampedArray },
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  canvas.width = page.width;
  canvas.height = page.height;
  const copy = new Uint8ClampedArray(page.data);
  context.putImageData(new ImageData(copy, page.width, page.height), 0, 0);
};

export const canvasToJpeg = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось собрать JPEG"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.95,
    );
  });
