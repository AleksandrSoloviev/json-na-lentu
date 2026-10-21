import {
  COLUMN_MAX_WIDTH,
  FRAME_WIDTH,
  printSheetPlacement,
  type PagePlan,
} from "@/lib/plan-pages";

export type TextTurn = 0 | 90 | -90;

export type SheetTurn = 90 | -90;

export type PreviewFrame =
  | {
      kind: "text";
      width: number;
      height: number;
      page: PagePlan;
      turn: TextTurn;
      column?: boolean;
    }
  | {
      kind: "image";
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
      data: Uint8ClampedArray;
      turn: SheetTurn;
    };

const INK_CUTOFF = 188;

const sheetTurn = (turn: TextTurn): SheetTurn => (turn === -90 ? -90 : 90);

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

const paintRotatedText = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
  turn: SheetTurn,
  outputWidth: number,
  outputHeight: number,
): void => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

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

export const drawPage = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
  turn: TextTurn = 90,
): void => {
  paintRotatedText(
    canvas,
    page,
    fontFamily,
    sheetTurn(turn),
    COLUMN_MAX_WIDTH,
    FRAME_WIDTH,
  );
};

export const drawColumn = (
  canvas: HTMLCanvasElement,
  page: PagePlan,
  fontFamily: string,
  turn: SheetTurn,
): void => {
  paintRotatedText(canvas, page, fontFamily, turn, page.width, page.height);
};

const turnOntoSheet = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  turn: SheetTurn,
): HTMLCanvasElement => {
  const turnedWidth = sourceHeight;
  const turnedHeight = sourceWidth;
  const turned = document.createElement("canvas");
  turned.width = turnedWidth;
  turned.height = turnedHeight;
  const turnedContext = turned.getContext("2d");
  if (!turnedContext) return turned;
  turnedContext.imageSmoothingEnabled = false;
  turnedContext.fillStyle = "#ffffff";
  turnedContext.fillRect(0, 0, turnedWidth, turnedHeight);
  turnedContext.save();
  if (turn === 90) {
    turnedContext.translate(turnedWidth, 0);
    turnedContext.rotate(Math.PI / 2);
  } else {
    turnedContext.translate(0, turnedHeight);
    turnedContext.rotate(-Math.PI / 2);
  }
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
    turn?: TextTurn;
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
  sourceContext.putImageData(
    new ImageData(copy, page.sourceWidth, page.sourceHeight),
    0,
    0,
  );
  const turned = turnOntoSheet(
    source,
    page.sourceWidth,
    page.sourceHeight,
    sheetTurn(page.turn ?? 90),
  );
  const place = printSheetPlacement(turned.width, turned.height);
  canvas.width = COLUMN_MAX_WIDTH;
  canvas.height = FRAME_WIDTH;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, COLUMN_MAX_WIDTH, FRAME_WIDTH);
  context.drawImage(turned, place.dx, place.dy, place.dw, place.dh);
  flattenInk(context, COLUMN_MAX_WIDTH, FRAME_WIDTH);
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
