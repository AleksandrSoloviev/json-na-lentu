"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { zipSync } from "fflate";
import { Download, FileUp, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decodeImageFile } from "@/lib/decode-raster";
import { canvasToJpeg, drawPage, paintImage, type PreviewFrame } from "@/lib/draw-page";
import {
  isImageFile,
  MAX_IMAGE_BYTES,
  prepareImagePages,
  type ImageFit,
  type ImageInk,
  type Raster,
} from "@/lib/image-pages";
import { parseJsonText } from "@/lib/json-text";
import { turnCanvas, type QuarterTurn } from "@/lib/rotate-quarter";
import {
  frameGeometry,
  MAX_PAGES,
  MAX_STRIP_HEIGHT,
  planPages,
  PRINT_LINE_HEIGHT,
  PRINT_PADDING,
  type FrameShape,
} from "@/lib/plan-pages";
import { SAMPLE_JSON } from "@/lib/sample-json";
import { cn } from "cn";

const MIN_FONT = 44;
const MAX_FONT = 76;
const FONT_STEP = 4;
const DEFAULT_FONT = 56;

const SHAPES: { id: FrameShape; label: string; hint: string }[] = [
  {
    id: "frame",
    label: "Кадр 3:4",
    hint: "Обычное фото. Длинный JSON продолжится на следующем кадре.",
  },
  {
    id: "square",
    label: "Квадрат",
    hint: "Короче кадра, если отпечаток у камеры почти квадратный.",
  },
  {
    id: "strip",
    label: "Лента",
    hint: "Высота растёт вместе с текстом. Так печатай, только если камера выводит всю высоту снимка.",
  },
];

const IMAGE_FITS: { id: ImageFit; label: string; hint: string }[] = [
  {
    id: "native",
    label: "Как есть",
    hint: "Пропорции снимка сохраняются. Широкий экран Mac остаётся широким.",
  },
  {
    id: "frame",
    label: "Кадр 3:4",
    hint: "Весь снимок вписан в вертикальное фото.",
  },
  {
    id: "square",
    label: "Квадрат",
    hint: "Весь снимок вписан в квадрат.",
  },
  {
    id: "strip",
    label: "Лента",
    hint: "Длинный снимок режется сверху вниз на несколько кадров.",
  },
];

const IMAGE_INKS: { id: ImageInk; label: string; hint: string }[] = [
  {
    id: "screenshot",
    label: "Скриншот",
    hint: "Текст и окна становятся чёрными на белом. Тёмное оформление Mac само переворачивается.",
  },
  {
    id: "photo",
    label: "Фото",
    hint: "Полутона остаются точками, как на термоленте.",
  },
];

const FILE_ACCEPT =
  ".json,.txt,.tif,.tiff,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.heif,.avif,application/json,text/plain,image/*";

type StudioMode = "json" | "image";

const STEPS = [
  "Скачай JPEG. Для камеры это фотография.",
  "Вставь карту памяти и подключи камеру к Mac. Без карты она часто видна только как веб-камера, и диска нет.",
  "Скопируй файл на карту. У VTech KidiZoom это папка DOWNLOAD/PHOTO на диске VTech 5491. На остальных камерах положи JPEG в DCIM.",
  "Извлеки камеру, открой снимок в альбоме и нажми кнопку печати на корпусе.",
  "Если файла в альбоме нет, эта модель печатает только свои снимки. Открой кадр на весь экран и сфотографируй монитор.",
];

type PrintStudioProps = {
  monoFamily: string;
};

type FontState = "loading" | "ready" | "error";

const primaryFontFamily = (family: string): string => {
  const first = family.split(",")[0] ?? family;
  const cleaned = first.replaceAll(/['"]/g, "").trim();
  return cleaned || "JetBrains Mono";
};

const framesWord = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "кадр";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "кадра";
  return "кадров";
};

const frameFileName = (index: number, mode: StudioMode): string => {
  const prefix = mode === "image" ? "snimok" : "json";
  return `${prefix}-${String(index + 1).padStart(2, "0")}.jpg`;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const PrintStudio = ({ monoFamily }: PrintStudioProps) => {
  const jsonId = useId();
  const errorId = useId();
  const sizeId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const printFont = primaryFontFamily(monoFamily);

  const [source, setSource] = useState("");
  const [pretty, setPretty] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);
  const [shape, setShape] = useState<FrameShape>("frame");
  const [turn, setTurn] = useState<QuarterTurn>(0);
  const [charWidth, setCharWidth] = useState<number | null>(null);
  const [fontState, setFontState] = useState<FontState>("loading");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<StudioMode>("json");
  const [rasters, setRasters] = useState<Raster[]>([]);
  const [imageFit, setImageFit] = useState<ImageFit>("native");
  const [imageInk, setImageInk] = useState<ImageInk>("screenshot");
  const [imageName, setImageName] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const parsed = useMemo(() => parseJsonText(source), [source]);
  const printable = parsed.kind === "ok" ? (pretty ? parsed.pretty : parsed.raw) : "";
  const geometry = frameGeometry(shape);

  const plan = useMemo(() => {
    if (!charWidth || !printable) return null;
    return planPages(printable, {
      width: geometry.width,
      height: geometry.height,
      fontSize,
      lineHeight: PRINT_LINE_HEIGHT,
      charWidth,
      padding: PRINT_PADDING,
      maxPages: MAX_PAGES,
      maxStripHeight: MAX_STRIP_HEIGHT,
    });
  }, [charWidth, fontSize, geometry.height, geometry.width, printable]);

  const pages = useMemo(() => plan?.pages ?? [], [plan]);
  const preparedImages = useMemo(() => {
    if (rasters.length === 0) return null;
    const imagePages: ReturnType<typeof prepareImagePages>["pages"] = [];
    let truncated = false;
    let inverted = false;
    let remaining = MAX_PAGES;

    for (const raster of rasters) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const result = prepareImagePages(raster, {
        fit: imageFit,
        ink: imageInk,
        maxPages: remaining,
      });
      imagePages.push(...result.pages);
      remaining -= result.pages.length;
      truncated = truncated || result.truncated;
      inverted = inverted || result.inverted;
    }

    return { pages: imagePages, truncated, inverted };
  }, [imageFit, imageInk, rasters]);
  const previewFrames = useMemo((): PreviewFrame[] => {
    if (mode === "image") {
      return (preparedImages?.pages ?? []).map((page) => ({
        kind: "image" as const,
        width: page.width,
        height: page.height,
        data: page.data,
      }));
    }
    return pages.map((page) => ({
      kind: "text" as const,
      width: page.width,
      height: page.height,
      page,
    }));
  }, [mode, pages, preparedImages]);
  const activeIndex =
    previewFrames.length === 0 ? 0 : Math.min(active, previewFrames.length - 1);
  const activeFrame = previewFrames[activeIndex];
  const shapeHint = SHAPES.find((item) => item.id === shape)?.hint ?? "";
  const imageFitHint = IMAGE_FITS.find((item) => item.id === imageFit)?.hint ?? "";
  const imageInkHint = IMAGE_INKS.find((item) => item.id === imageInk)?.hint ?? "";

  useEffect(() => {
    let activeMeasure = true;

    const measure = async () => {
      const spec = `700 ${fontSize}px "${printFont}"`;
      try {
        await document.fonts.load(spec);
      } catch {
        // The metric fallback face can fail while the real face is usable.
      }
      await document.fonts.ready;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context || !activeMeasure) return;
      context.font = spec;
      const width = context.measureText("0123456789").width / 10;
      if (!activeMeasure) return;
      if (!Number.isFinite(width) || width < fontSize * 0.3) {
        setFontState("error");
        return;
      }
      setCharWidth(width);
      setFontState("ready");
    };

    void measure();
    return () => {
      activeMeasure = false;
    };
  }, [fontSize, printFont]);

  useLayoutEffect(() => {
    previewFrames.forEach((frame, index) => {
      const canvas = canvasRefs.current[index];
      if (!canvas) return;
      if (frame.kind === "image") {
        paintImage(canvas, frame);
      } else if (fontState === "ready") {
        drawPage(canvas, frame.page, `"${printFont}"`);
      } else {
        return;
      }
      turnCanvas(canvas, turn);
    });
  }, [fontState, previewFrames, printFont, turn]);

  const handleSource = (value: string) => {
    setFileError(null);
    setNotice(null);
    setSource(value);
  };

  const readJsonFile = (file: File) => {
    if (file.size > 100_000) {
      setFileError("Файл больше 100 КБ. Раздели JSON на части.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileError(null);
      setNotice(null);
      setSource(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      setFileError("Не удалось прочитать файл.");
    };
    reader.readAsText(file);
  };

  const loadImages = async (files: File[]) => {
    setImageBusy(true);
    setImageError(null);
    setNotice(null);
    setActive(0);
    try {
      const decoded: Raster[] = [];
      for (const file of files) {
        if (file.size > MAX_IMAGE_BYTES) {
          throw new Error("Файл больше 80 МБ. Сохрани снимок поменьше.");
        }
        decoded.push(...(await decodeImageFile(file)));
      }
      if (decoded.length === 0) throw new Error("В файле нет изображения.");
      setRasters(decoded);
      setImageName(files.map((file) => file.name).join(", "));
    } catch (error) {
      setRasters([]);
      setImageName("");
      setImageError(error instanceof Error ? error.message : "Не удалось открыть снимок.");
    } finally {
      setImageBusy(false);
    }
  };

  const handleIncomingFiles = (files: File[]) => {
    const images = files.filter((file) => isImageFile(file));
    if (images.length > 0) {
      setMode("image");
      void loadImages(images);
      return;
    }
    const first = files[0];
    if (!first) return;
    setMode("json");
    readJsonFile(first);
  };

  const downloadFrame = async (index: number) => {
    const canvas = canvasRefs.current[index];
    if (!canvas) {
      setNotice("Кадр ещё не собран. Подожди секунду и повтори.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const blob = await canvasToJpeg(canvas);
      const filename = frameFileName(index, mode);
      downloadBlob(blob, filename);
      setNotice(`Браузер сохраняет ${filename}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось скачать кадр");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAll = async () => {
    if (previewFrames.length === 0) return;
    if (previewFrames.length === 1) {
      await downloadFrame(0);
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < previewFrames.length; index += 1) {
        const canvas = canvasRefs.current[index];
        if (!canvas) throw new Error("Кадр ещё не собран. Подожди секунду и повтори.");
        const blob = await canvasToJpeg(canvas);
        entries[frameFileName(index, mode)] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(entries, { level: 0 });
      downloadBlob(new Blob([Uint8Array.from(zipped)]), "kadry.zip");
      setNotice(`Браузер сохраняет архив из ${previewFrames.length} кадров`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось скачать кадры");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFullscreen = (index: number) => {
    setActive(index);
    setFullscreen(true);
  };

  return (
    <div className="min-h-full">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 md:px-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-9 w-7 border border-black bg-white shadow-[3px_3px_0_0_#1c1915]"
            />
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              На ленту
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Детская камера печатает снимок из своего альбома. Сюда можно
            вставить JSON или снимок экрана Mac: TIFF в полном разрешении,
            PNG, JPEG и другие картинки. На ленту уходит чёрно-белый JPEG.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          className={cn(
            "space-y-5 rounded-xl border border-border bg-card p-4 md:p-5",
            dragOver && "border-foreground",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            handleIncomingFiles([...event.dataTransfer.files]);
          }}
        >
          <div role="tablist" aria-label="Что печатать" className="flex flex-wrap gap-2">
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "json"}
              variant={mode === "json" ? "default" : "outline"}
              onClick={() => setMode("json")}
            >
              JSON
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "image"}
              variant={mode === "image" ? "default" : "outline"}
              onClick={() => setMode("image")}
            >
              Картинка
            </Button>
          </div>

          {mode === "json" ? (
          <>
          <div className="space-y-2">
            <Label htmlFor={jsonId}>JSON</Label>
            <Textarea
              id={jsonId}
              value={source}
              onChange={(event) => handleSource(event.target.value)}
              placeholder='{"место": "кухня", "готово": false}'
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              translate="no"
              aria-invalid={parsed.kind === "error" || Boolean(fileError)}
              aria-describedby={errorId}
              className="field-sizing-fixed h-80 min-h-64 resize-y font-mono text-sm leading-6"
            />
            <p
              id={errorId}
              role={fileError || parsed.kind === "error" ? "alert" : undefined}
              className="min-h-5 text-sm text-destructive"
            >
              {fileError ?? (parsed.kind === "error" ? parsed.message : "")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSource(SAMPLE_JSON)}
            >
              Пример
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp aria-hidden="true" />
              Открыть файл
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm" htmlFor="pretty-json">
            <input
              id="pretty-json"
              type="checkbox"
              checked={pretty}
              onChange={(event) => setPretty(event.target.checked)}
              className="size-4 accent-black"
            />
            Форматировать с отступами
          </label>

          <div className="space-y-2">
            <Label htmlFor={sizeId}>Размер букв на снимке: {fontSize}</Label>
            <input
              id={sizeId}
              type="range"
              min={MIN_FONT}
              max={MAX_FONT}
              step={FONT_STEP}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              className="w-full accent-black"
              aria-valuemin={MIN_FONT}
              aria-valuemax={MAX_FONT}
              aria-valuenow={fontSize}
              aria-valuetext={`${fontSize} пикселей`}
            />
            <p className="text-sm text-muted-foreground">
              Крупнее надёжнее читается на термоленте.
            </p>
          </div>
          </>
          ) : (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center hover:bg-muted"
            >
              <span className="text-sm font-medium">
                {imageBusy ? "Читаю снимок…" : "Снимок экрана или картинка"}
              </span>
              <span className="max-w-sm text-sm leading-6 text-muted-foreground">
                TIFF с Mac в полном разрешении, плюс PNG, JPEG, WebP, GIF и BMP.
                Можно перетащить сразу несколько файлов.
              </span>
            </button>
            <p
              role={imageError ? "alert" : undefined}
              className="min-h-5 text-sm text-destructive"
            >
              {imageError ?? ""}
            </p>
            {imageName ? (
              <p className="break-all text-sm text-muted-foreground">{imageName}</p>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium" id="ink-label">
                Как готовить картинку
              </p>
              <div role="group" aria-labelledby="ink-label" className="flex flex-wrap gap-2">
                {IMAGE_INKS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={imageInk === item.id ? "default" : "outline"}
                    aria-pressed={imageInk === item.id}
                    onClick={() => setImageInk(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{imageInkHint}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id="image-fit-label">
                Форма отпечатка
              </p>
              <div
                role="group"
                aria-labelledby="image-fit-label"
                className="flex flex-wrap gap-2"
              >
                {IMAGE_FITS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={imageFit === item.id ? "default" : "outline"}
                    aria-pressed={imageFit === item.id}
                    onClick={() => setImageFit(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{imageFitHint}</p>
            </div>
          </div>
          )}

          {mode === "json" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium" id="shape-label">
              Форма отпечатка
            </p>
            <div
              role="group"
              aria-labelledby="shape-label"
              className="flex flex-wrap gap-2"
            >
              {SHAPES.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={shape === item.id ? "default" : "outline"}
                  aria-pressed={shape === item.id}
                  onClick={() => setShape(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{shapeHint}</p>
          </div>
          ) : null}

          <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0">
            <legend className="text-sm font-medium">Поворот отпечатка</legend>
            <label className="flex items-center gap-2 text-sm" htmlFor="turn-clockwise">
              <input
                id="turn-clockwise"
                type="checkbox"
                checked={turn === 90}
                onChange={(event) => setTurn(event.target.checked ? 90 : 0)}
                className="size-4 accent-black"
              />
              Повернуть на 90°
            </label>
            <label className="flex items-center gap-2 text-sm" htmlFor="turn-counter">
              <input
                id="turn-counter"
                type="checkbox"
                checked={turn === -90}
                onChange={(event) => setTurn(event.target.checked ? -90 : 0)}
                className="size-4 accent-black"
              />
              Повернуть на −90°
            </label>
            <p className="text-sm text-muted-foreground">
              Бумага выходит сбоку. Отметь одно направление, скачай JPEG и
              проверь, как текст ложится на отпечаток.
            </p>
          </fieldset>

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="sr-only"
            aria-label="Открыть JSON или картинку"
            onChange={(event) => {
              handleIncomingFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />

          <div className="space-y-2 border-t border-border pt-4">
            <h2 className="text-sm font-medium">Как напечатать</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </section>

        <aside
          aria-label="Кадры для печати"
          className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="space-y-1">
            <h2 className="text-sm font-medium">Кадры</h2>
            <p className="break-all text-sm text-muted-foreground" aria-live="polite">
              {mode === "image"
                ? preparedImages && previewFrames.length > 0
                  ? `${previewFrames.length} ${framesWord(previewFrames.length)}${imageName ? ` · ${imageName}` : ""}${preparedImages.inverted ? " · тёмный фон стал белым" : ""}`
                  : "Перетащи снимок экрана: TIFF, PNG, JPEG и другие."
                : plan && pages.length > 0
                  ? `${pages.length} ${framesWord(pages.length)} · ${plan.maxChars} символов в строке · до ${plan.contentLineBudget} строк на кадр`
                  : "Здесь появится снимок для альбома камеры."}
            </p>
            {mode === "json" && plan?.truncated ? (
              <p role="status" className="text-sm text-destructive">
                На снимок попали первые {MAX_PAGES} кадров. Уменьши шрифт или
                разрежь JSON.
              </p>
            ) : null}
            {mode === "image" && preparedImages?.truncated ? (
              <p role="status" className="text-sm text-destructive">
                На снимок попали первые {MAX_PAGES} кадров.
              </p>
            ) : null}
          </div>

          {previewFrames.length > 0 ? (
            <Button
              type="button"
              className="h-10 w-full"
              disabled={busy || imageBusy || (mode === "json" && fontState !== "ready")}
              onClick={() => void handleDownloadAll()}
            >
              <Download aria-hidden="true" />
              {previewFrames.length === 1 ? "Скачать JPEG" : "Скачать все кадры"}
            </Button>
          ) : null}

          <p role="status" className="min-h-5 text-sm text-muted-foreground">
            {notice ?? ""}
          </p>

          {previewFrames.length === 0 ? (
            <EmptySheet
              message={
                mode === "image"
                  ? imageBusy
                    ? "Читаю снимок…"
                    : imageError
                      ? "Снимок не открылся. Попробуй PNG."
                      : "Перетащи картинку слева. Кадр соберётся здесь."
                  : fontState === "error"
                    ? "Шрифт не загрузился. Обнови страницу."
                    : parsed.kind === "error"
                      ? "Исправь JSON, и кадр появится снова."
                      : fontState === "loading" && source.trim()
                        ? "Подбираю шрифт для термопечати…"
                        : "Вставь JSON слева. Кадр соберётся здесь."
              }
            />
          ) : (
            <div className="space-y-6">
              {previewFrames.map((frame, index) => (
                <figure key={`${frame.kind}-${index}`} className="space-y-2">
                  <div className="border border-black bg-white shadow-[6px_6px_0_0_#1c1915]">
                    <canvas
                      ref={(node) => {
                        canvasRefs.current[index] = node;
                      }}
                      role="img"
                      aria-label={`Кадр ${index + 1} из ${previewFrames.length}`}
                      className="block h-auto w-full"
                    />
                  </div>
                  <figcaption className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {turn === 0 ? frame.width : frame.height}×
                      {turn === 0 ? frame.height : frame.width}
                      {turn === 0 ? "" : turn === 90 ? " · 90°" : " · −90°"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void downloadFrame(index)}
                      >
                        Скачать
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenFullscreen(index)}
                      >
                        <Maximize2 aria-hidden="true" />
                        На экран
                      </Button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </aside>
      </main>

      {fullscreen && activeFrame ? (
        <FullscreenFrame
          frame={activeFrame}
          index={activeIndex}
          total={previewFrames.length}
          monoFamily={`"${printFont}"`}
          fontReady={fontState === "ready"}
          turn={turn}
          onClose={() => setFullscreen(false)}
          onPrev={() => setActive((current) => Math.max(0, current - 1))}
          onNext={() =>
            setActive((current) => Math.min(previewFrames.length - 1, current + 1))
          }
        />
      ) : null}
    </div>
  );
};

const EmptySheet = ({ message }: { message: string }) => (
  <div className="flex aspect-[3/4] items-center justify-center border border-black bg-white p-6 text-center shadow-[6px_6px_0_0_#1c1915]">
    <p className="max-w-48 text-sm leading-6 text-neutral-600">{message}</p>
  </div>
);

type FullscreenFrameProps = {
  frame: PreviewFrame;
  index: number;
  total: number;
  monoFamily: string;
  fontReady: boolean;
  turn: QuarterTurn;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const FullscreenFrame = ({
  frame,
  index,
  total,
  monoFamily,
  fontReady,
  turn,
  onClose,
  onPrev,
  onNext,
}: FullscreenFrameProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (frame.kind === "image") {
      paintImage(canvas, frame);
    } else if (fontReady) {
      drawPage(canvas, frame.page, monoFamily);
    } else {
      return;
    }
    turnCanvas(canvas, turn);
  }, [fontReady, monoFamily, frame, turn]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key === "ArrowLeft") {
      onPrev();
      return;
    }
    if (event.key === "ArrowRight") {
      onNext();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const items = [
      ...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"),
    ];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Кадр ${index + 1} из ${total} на весь экран`}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center bg-white p-3">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Кадр ${index + 1} из ${total}`}
          className="h-auto max-w-full"
          style={{
            width: `min(96vw, calc((100dvh - 7rem) * ${
              (turn === 0 ? frame.width : frame.height) /
              (turn === 0 ? frame.height : frame.width)
            }))`,
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="min-w-48 flex-1 text-sm leading-5">
          Кадр {index + 1} из {total}. В объектив бери только белый лист.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={index === 0}
            onClick={onPrev}
          >
            Назад
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={index >= total - 1}
            onClick={onNext}
          >
            Дальше
          </Button>
          <Button ref={closeRef} type="button" variant="outline" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
};
