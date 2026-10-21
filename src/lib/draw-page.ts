import {
  COLUMN_MAX_WIDTH,
  FRAME_WIDTH,
  printSheetPlacement,
  type PagePlan,
} from "@/lib/plan-pages";

export type TextTurn = 0 | 90 | -90;

export type PreviewFrame =
  | {
      kind: "text";
      width: number;
      height: number;
      page: PagePlan;
      turn: TextTurn;
      column?: boolean;
    }
  | { kind: "image"; width: number; height: number; data: Uint8ClampedArray };

const INK_CUTOFF = 188;

const mountOnPrintSheet = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
): void => {
  if (canvas.width === COLUMN_MAX_WIDTH && canvas.height === FRAME_WIDTH) return;
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const snap = snapshot.getContext("2d");
  if (!snap) return;
  snap.drawImage(canvas, 0, 0);
  const place = printSheetPlacement(snapshot.width, snapshot.height);
  canvas.width = COLUMN_MAX_WIDTH;
  canvas.height = FRAME_WIDTH;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, COLUMN_MAX_WIDTH, FRAME_WIDTH);
  context.drawImage(snapshot, place.dx, place.dy, place.dw, place.dh);
  flattenInk(context, COLUMN_MAX_WIDTH, FRAME_WIDTH);
};

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
  mountOnPrintSheet(context, canvas);
};

export const drawColumn = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
  turn: 90 | -90,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  const outputWidth = page.width;
  const outputHeight = page.height;
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
  context.font = `700 ${page.fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";
  page.lines.forEach((line, index) => {
    context.fillText(line, page.padding, page.padding + index * page.linePx);
  });
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
  mountOnPrintSheet(context, canvas);
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
