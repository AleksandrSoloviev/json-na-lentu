"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { zipSync } from "fflate";
import { Download, FileUp, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decodeImageFile } from "@/lib/decode-raster";
import { canvasToJpeg, renderFrame, type PreviewFrame } from "@/lib/draw-page";
import {
  isImageFile,
  MAX_IMAGE_BYTES,
  prepareImagePages,
  type ImageInk,
  type Raster,
} from "@/lib/image-pages";
import { parseJsonText } from "@/lib/json-text";
import { photoFileName } from "@/lib/photo-name";
import { preparePlainText } from "@/lib/plain-text";
import {
  MAX_PAGES,
  planSheet,
  PRINT_LINE_HEIGHT,
  PRINT_PADDING,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from "@/lib/plan-pages";
import { SAMPLE_JSON } from "@/lib/sample-json";
import { SAMPLE_TEXT } from "@/lib/sample-text";
import { cn } from "cn";

const PHOTO_START_KEY = "lenta-photo-start";

const readPhotoStart = (): number => {
  try {
    const value = Number(window.localStorage.getItem(PHOTO_START_KEY));
    if (!Number.isInteger(value) || value < 0 || value > 99999) return 0;
    return value;
  } catch {
    return 0;
  }
};

const writePhotoStart = (value: number): void => {
  try {
    window.localStorage.setItem(PHOTO_START_KEY, String(value));
  } catch {
    // A private window can refuse storage. The number still works for this visit.
  }
};

let photoStartValue = 0;
let photoStartLoaded = false;
const photoStartListeners = new Set<() => void>();

const subscribePhotoStart = (listener: () => void): (() => void) => {
  if (!photoStartLoaded && typeof window !== "undefined") {
    photoStartValue = readPhotoStart();
    photoStartLoaded = true;
  }
  photoStartListeners.add(listener);
  return () => photoStartListeners.delete(listener);
};

const getPhotoStart = (): number => photoStartValue;

const setStoredPhotoStart = (value: number): void => {
  photoStartValue = value;
  photoStartLoaded = true;
  writePhotoStart(value);
  photoStartListeners.forEach((listener) => listener());
};

const MIN_FONT = 44;
const MAX_FONT = 76;
const FONT_STEP = 4;
const DEFAULT_FONT = 56;

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

type StudioMode = "json" | "text" | "image";

const STEPS = [
  "Скачай PHO00000.JPG. Лист 2000×960: этот размер камера уже печатала. Браузер спросит папку, имя файла не меняй.",
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

const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsText(file);
  });

const isJsonFile = (file: File): boolean => file.name.toLowerCase().endsWith(".json");

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

const JPEG_PICKER_TYPE = {
  description: "Снимок камеры",
  accept: { "image/jpeg": [".JPG", ".jpg"] },
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const writeBlob = async (handle: FileSystemFileHandle, blob: Blob): Promise<void> => {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
};

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    id?: string;
  }) => Promise<FileSystemDirectoryHandle>;
};

const pickJpegFile = async (
  filename: string,
): Promise<FileSystemFileHandle | "fallback" | "cancelled"> => {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (typeof picker !== "function") return "fallback";
  try {
    return await picker({
      suggestedName: filename,
      types: [JPEG_PICKER_TYPE],
    });
  } catch (error) {
    if (isAbort(error)) return "cancelled";
    return "fallback";
  }
};

const pickFolder = async (): Promise<FileSystemDirectoryHandle | "fallback" | "cancelled"> => {
  const picker = (window as SavePickerWindow).showDirectoryPicker;
  if (typeof picker !== "function") return "fallback";
  try {
    return await picker({ mode: "readwrite", id: "camera-card" });
  } catch (error) {
    if (isAbort(error)) return "cancelled";
    return "fallback";
  }
};

export const PrintStudio = ({ monoFamily }: PrintStudioProps) => {
  const jsonId = useId();
  const errorId = useId();
  const textId = useId();
  const textErrorId = useId();
  const sizeId = useId();
  const photoId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const printFont = primaryFontFamily(monoFamily);

  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [pretty, setPretty] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);
  const photoStart = useSyncExternalStore(subscribePhotoStart, getPhotoStart, () => 0);
  const setPhotoStart = (value: number | ((current: number) => number)): void => {
    const next = typeof value === "function" ? value(getPhotoStart()) : value;
    setStoredPhotoStart(next);
  };
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
  const [imageInk, setImageInk] = useState<ImageInk>("screenshot");
  const [imageName, setImageName] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const parsed = useMemo(() => parseJsonText(source), [source]);
  const plain = useMemo(() => preparePlainText(note), [note]);
  const printable =
    mode === "text"
      ? plain.kind === "ok"
        ? plain.text
        : ""
      : parsed.kind === "ok"
        ? pretty
          ? parsed.pretty
          : parsed.raw
        : "";
  const plan = useMemo(() => {
    if (!charWidth || !printable) return null;
    return planSheet(printable, {
      fontSize,
      lineHeight: PRINT_LINE_HEIGHT,
      charWidth,
      padding: PRINT_PADDING,
      maxPages: MAX_PAGES,
    });
  }, [charWidth, fontSize, printable]);

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
      const result = prepareImagePages(raster, { ink: imageInk });
      imagePages.push(...result.pages);
      remaining -= result.pages.length;
      truncated = truncated || result.truncated;
      inverted = inverted || result.inverted;
    }

    return { pages: imagePages, truncated, inverted };
  }, [imageInk, rasters]);
  const previewFrames = useMemo((): PreviewFrame[] => {
    if (mode === "image") {
      return (preparedImages?.pages ?? []).map((page) => ({
        kind: "image" as const,
        width: SHEET_WIDTH,
        height: SHEET_HEIGHT,
        sourceWidth: page.sourceWidth,
        sourceHeight: page.sourceHeight,
        data: page.data,
      }));
    }
    return pages.map((page) => ({
      kind: "text" as const,
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      page,
    }));
  }, [mode, pages, preparedImages]);
  const activeIndex =
    previewFrames.length === 0 ? 0 : Math.min(active, previewFrames.length - 1);
  const activeFrame = previewFrames[activeIndex];
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
      if (frame.kind === "text" && fontState !== "ready") return;
      renderFrame(canvas, frame, `"${printFont}"`);
    });
  }, [fontState, previewFrames, printFont]);

  const handleSource = (value: string) => {
    setFileError(null);
    setNotice(null);
    setSource(value);
  };

  const handleNote = (value: string) => {
    setFileError(null);
    setNotice(null);
    setNote(value);
  };

  const readTextFiles = async (files: File[], target: "json" | "text") => {
    const oversized = files.find((file) => file.size > 100_000);
    if (oversized) {
      setFileError(
        target === "json"
          ? "Файл больше 100 КБ. Раздели JSON на части."
          : "Файл больше 100 КБ. Раздели текст на части.",
      );
      return;
    }
    try {
      const contents = await Promise.all(files.map((file) => readFileText(file)));
      setFileError(null);
      setNotice(null);
      const joined = contents.join("\n\n");
      if (target === "json") setSource(joined);
      else setNote(joined);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Не удалось прочитать файл.");
    }
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
    const texts = files.filter((file) => !isImageFile(file));
    const only = texts[0];
    if (!only) return;
    const target = texts.length === 1 && isJsonFile(only) ? "json" : "text";
    setMode(target);
    void readTextFiles(texts, target);
  };

  const blobForFrame = async (frame: PreviewFrame): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    renderFrame(canvas, frame, `"${printFont}"`);
    return canvasToJpeg(canvas);
  };

  const downloadFrame = async (index: number) => {
    const frame = previewFrames[index];
    if (!frame || (frame.kind === "text" && fontState !== "ready")) {
      setNotice("Кадр ещё не собран. Подожди секунду и повтори.");
      return;
    }
    const filename = photoFileName(photoStart + index);
    setBusy(true);
    setNotice(null);
    try {
      const picked = await pickJpegFile(filename);
      if (picked === "cancelled") {
        setNotice("Сохранение отменено.");
        return;
      }
      const blob = await blobForFrame(frame);
      if (picked === "fallback") {
        downloadBlob(blob, filename);
        setNotice(
          `${filename} уходит в папку «Загрузки»: этот браузер не открывает окно выбора.`,
        );
      } else {
        await writeBlob(picked, blob);
        setNotice(`Сохранён ${filename}`);
      }
      setPhotoStart((current) => Math.min(99999, current + index + 1));
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

    const first = photoFileName(photoStart);
    const last = photoFileName(photoStart + previewFrames.length - 1);
    setBusy(true);
    setNotice(null);
    try {
      const folder = await pickFolder();
      if (folder === "cancelled") {
        setNotice("Сохранение отменено.");
        return;
      }
      if (folder !== "fallback") {
        for (let index = 0; index < previewFrames.length; index += 1) {
          const frame = previewFrames[index];
          if (!frame) throw new Error("Кадр ещё не собран. Подожди секунду и повтори.");
          const name = photoFileName(photoStart + index);
          const handle = await folder.getFileHandle(name, { create: true });
          await writeBlob(handle, await blobForFrame(frame));
        }
        setPhotoStart((current) => Math.min(99999, current + previewFrames.length));
        setNotice(`В выбранной папке лежат ${first}–${last}.`);
        return;
      }

      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < previewFrames.length; index += 1) {
        const frame = previewFrames[index];
        if (!frame) throw new Error("Кадр ещё не собран. Подожди секунду и повтори.");
        const blob = await blobForFrame(frame);
        entries[photoFileName(photoStart + index)] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(entries, { level: 0 });
      const zipName = `${first.replace(/\.JPG$/, "")}.zip`;
      downloadBlob(new Blob([Uint8Array.from(zipped)]), zipName);
      setPhotoStart((current) => Math.min(99999, current + previewFrames.length));
      setNotice(
        `${zipName} уходит в «Загрузки». На карту копируй сами JPG, не архив.`,
      );
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
            Камера печатает лист 2000×960. Свой огромный снимок она показывает,
            а чужой файл того же размера открывает чёрным и в печать не берёт.
            JSON, текст и картинка собираются в лист, который она уже печатала:
            строка идёт вдоль ленты, текст у края, который выходит первым.
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
              onClick={() => {
                setFileError(null);
                setMode("json");
              }}
            >
              JSON
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              variant={mode === "text" ? "default" : "outline"}
              onClick={() => {
                setFileError(null);
                setMode("text");
              }}
            >
              Текст
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "image"}
              variant={mode === "image" ? "default" : "outline"}
              onClick={() => {
                setFileError(null);
                setMode("image");
              }}
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
          </>
          ) : mode === "text" ? (
          <>
          <div className="space-y-2">
            <Label htmlFor={textId}>Текст</Label>
            <Textarea
              id={textId}
              value={note}
              onChange={(event) => handleNote(event.target.value)}
              placeholder="Записка, список или любое сообщение"
              translate="no"
              aria-invalid={plain.kind === "error" || Boolean(fileError)}
              aria-describedby={textErrorId}
              className="field-sizing-fixed h-80 min-h-64 resize-y text-sm leading-6"
            />
            <p
              id={textErrorId}
              role={fileError || plain.kind === "error" ? "alert" : undefined}
              className="min-h-5 text-sm text-destructive"
            >
              {fileError ?? (plain.kind === "error" ? plain.message : "")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleNote(SAMPLE_TEXT)}
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
            <p className="text-sm text-muted-foreground">
              Картинка ложится на тот же лист {SHEET_WIDTH}×{SHEET_HEIGHT}, пропорции
              сохраняются.
            </p>
          </div>
          )}

          {mode !== "image" ? (
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
              Крупнее надёжнее читается на термоленте. Файл всегда {SHEET_WIDTH}×
              {SHEET_HEIGHT}. Буквы повёрнуты, чтобы строка шла вдоль ленты.
            </p>
          </div>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            multiple
            accept={FILE_ACCEPT}
            className="sr-only"
            aria-label="Открыть JSON, текст или картинку"
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
          className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className="space-y-1">
            <h2 className="text-sm font-medium">Кадры</h2>
            <p className="break-all text-sm text-muted-foreground" aria-live="polite">
              {mode === "image"
                ? preparedImages && previewFrames.length > 0
                  ? `${previewFrames.length} ${framesWord(previewFrames.length)}${imageName ? ` · ${imageName}` : ""}${preparedImages.inverted ? " · тёмный фон стал белым" : ""}`
                  : "Перетащи снимок экрана: TIFF, PNG, JPEG и другие."
                : plan && pages.length > 0
                  ? `${pages.length} ${framesWord(pages.length)} · ${SHEET_WIDTH}×${SHEET_HEIGHT} · ${plan.maxChars} символов в строке · до ${plan.contentLineBudget} строк на кадр`
                  : "Здесь появится снимок для альбома камеры."}
            </p>
            {mode !== "image" && plan?.truncated ? (
              <p role="status" className="text-sm text-destructive">
                На снимок попали первые {MAX_PAGES} кадров. Уменьши шрифт или разрежь{" "}
                {mode === "json" ? "JSON" : "текст"}.
              </p>
            ) : null}
            {previewFrames[0] ? (
              <p role="status" className="text-sm text-muted-foreground">
                Каждый файл — {SHEET_WIDTH}×{SHEET_HEIGHT}. Камера печатает этот лист.
                Текст стоит у края, который выходит первым.
              </p>
            ) : null}
            {mode !== "image" && pages.length > 1 ? (
              <p role="status" className="text-sm text-muted-foreground">
                Печатай {photoFileName(photoStart)} и следующие по порядку.
              </p>
            ) : null}
            {mode === "image" && preparedImages?.truncated ? (
              <p role="status" className="text-sm text-destructive">
                На снимок попали первые {MAX_PAGES} кадров.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={photoId}>Номер файла</Label>
            <input
              id={photoId}
              type="number"
              min={0}
              max={99999}
              step={1}
              inputMode="numeric"
              value={photoStart}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setPhotoStart(Math.min(99999, Math.max(0, Math.trunc(value))));
              }}
              className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Камера берёт только имена вида PHO00000.JPG. Номер запоминается в этом
              браузере. Следующий файл — {photoFileName(photoStart)}.
            </p>
          </div>

          {previewFrames.length > 0 ? (
            <Button
              type="button"
              className="h-auto min-h-10 w-full whitespace-normal py-2"
              disabled={busy || imageBusy || (mode !== "image" && fontState !== "ready")}
              onClick={() => void handleDownloadAll()}
            >
              <Download aria-hidden="true" />
              {previewFrames.length === 1
                ? `Скачать ${photoFileName(photoStart)}`
                : `Скачать ${photoFileName(photoStart)} и следующие`}
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
                    : mode === "json" && parsed.kind === "error"
                      ? "Исправь JSON, и кадр появится снова."
                      : mode === "text" && plain.kind === "error"
                        ? "Сократи текст, и кадр появится снова."
                        : fontState === "loading" &&
                            (mode === "text" ? note : source).trim()
                          ? "Подбираю шрифт для термопечати…"
                          : mode === "text"
                            ? "Напиши текст слева. Снимок соберётся здесь."
                            : "Вставь JSON слева. Снимок соберётся здесь."
              }
            />
          ) : (
            <div className="space-y-6">
              {previewFrames.map((frame, index) => (
                <figure key={`${frame.kind}-${index}`} className="space-y-2">
                  <div className="w-full overflow-hidden border border-black bg-white shadow-[6px_6px_0_0_#1c1915]">
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
                      {photoFileName(photoStart + index)} · {frame.width}×{frame.height}
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
  <div className="flex aspect-[25/12] items-center justify-center border border-black bg-white p-6 text-center shadow-[6px_6px_0_0_#1c1915]">
    <p className="max-w-48 text-sm leading-6 text-neutral-600">{message}</p>
  </div>
);

type FullscreenFrameProps = {
  frame: PreviewFrame;
  index: number;
  total: number;
  monoFamily: string;
  fontReady: boolean;
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
    if (frame.kind === "text" && !fontReady) return;
    renderFrame(canvas, frame, monoFamily);
  }, [fontReady, monoFamily, frame]);

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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-white p-3">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Кадр ${index + 1} из ${total}`}
          className="block h-auto max-h-[calc(100dvh-7rem)] w-auto max-w-[96vw]"
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
