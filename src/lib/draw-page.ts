import {
  printSheetPlacement,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  textBlockDepth,
  type PagePlan,
} from "@/lib/plan-pages";

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
    };

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
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
  context.save();
  context.translate(textBlockDepth(SHEET_WIDTH, page.padding, page.linePx, page.lines.length), 0);
  context.rotate(Math.PI / 2);
  context.fillStyle = "#000000";
  context.font = `700 ${page.fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";
  page.lines.forEach((line, index) => {
    context.fillText(line, page.padding, page.padding + index * page.linePx);
  });
  context.restore();
  flattenInk(context, SHEET_WIDTH, SHEET_HEIGHT);
};

const turnOntoSheet = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): HTMLCanvasElement => {
  const turned = document.createElement("canvas");
  turned.width = sourceHeight;
  turned.height = sourceWidth;
  const turnedContext = turned.getContext("2d");
  if (!turnedContext) return turned;
  turnedContext.imageSmoothingEnabled = false;
  turnedContext.fillStyle = "#ffffff";
  turnedContext.fillRect(0, 0, turned.width, turned.height);
  turnedContext.save();
  turnedContext.translate(turned.width, 0);
  turnedContext.rotate(Math.PI / 2);
  turnedContext.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  turnedContext.restore();
  return turned;
};

export const paintImage = (
  canvas: HTMLCanvasElement,
  page: {
    sourceWidth: number;
    sourceHeight: number;
    data: Uint8ClampedArray;
  },
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const source = document.createElement("canvas");
  source.width = page.sourceWidth;
  source.height = page.sourceHeight;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return;
  const copy = new Uint8ClampedArray(page.data);
  sourceContext.putImageData(new ImageData(copy, page.sourceWidth, page.sourceHeight), 0, 0);
  const turned = turnOntoSheet(source, page.sourceWidth, page.sourceHeight);
  const place = printSheetPlacement(turned.width, turned.height);
  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
  context.drawImage(turned, place.dx, place.dy, place.dw, place.dh);
  flattenInk(context, SHEET_WIDTH, SHEET_HEIGHT);
};

export const renderFrame = (
  canvas: HTMLCanvasElement,
  frame: PreviewFrame,
  fontFamily: string,
): void => {
  if (frame.kind === "image") {
    paintImage(canvas, frame);
    return;
  }
  drawPage(canvas, frame.page, fontFamily);
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
