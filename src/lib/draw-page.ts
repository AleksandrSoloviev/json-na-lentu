import type { PagePlan } from "@/lib/plan-pages";

export type TextTurn = 0 | 90 | -90;

export type PreviewFrame =
  | {
      kind: "text";
      width: number;
      height: number;
      page: PagePlan;
      segments?: PagePlan[];
      turn: TextTurn;
    }
  | { kind: "image"; width: number; height: number; data: Uint8ClampedArray };

const INK_CUTOFF = 188;

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
  turn: TextTurn = 0,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  const outputWidth = turn === 0 ? page.width : page.height;
  const outputHeight = turn === 0 ? page.height : page.width;
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.save();
  if (turn === 90) {
    context.translate(outputWidth, 0);
    context.rotate(Math.PI / 2);
  } else if (turn === -90) {
    context.translate(0, outputHeight);
    context.rotate(-Math.PI / 2);
  }
  context.fillStyle = "#000000";
  context.font = `700 ${page.fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";

  page.lines.forEach((line, index) => {
    context.fillText(line, page.padding, page.padding + index * page.linePx);
  });
  context.restore();
  flattenInk(context, outputWidth, outputHeight);
};

export const drawTape = (
  canvas: HTMLCanvasElement,
  segments: PagePlan[],
  fontFamily: string,
  turn: 90 | -90,
): void => {
  const first = segments[0];
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!first || !context) return;

  const outputWidth = first.height;
  const outputHeight = segments.reduce((sum, segment) => sum + segment.width, 0);
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.save();
  if (turn === 90) {
    context.translate(outputWidth, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, outputHeight);
    context.rotate(-Math.PI / 2);
  }
  context.fillStyle = "#000000";
  context.textBaseline = "top";
  context.textAlign = "left";

  let cursor = 0;
  for (const segment of segments) {
    context.font = `700 ${segment.fontSize}px ${fontFamily}`;
    segment.lines.forEach((line, index) => {
      context.fillText(
        line,
        cursor + segment.padding,
        segment.padding + index * segment.linePx,
      );
    });
    cursor += segment.width;
  }

  context.restore();
  flattenInk(context, outputWidth, outputHeight);
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
