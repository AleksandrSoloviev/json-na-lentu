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
import { canvasToJpeg, drawPage } from "@/lib/draw-page";
import { parseJsonText } from "@/lib/json-text";
import {
  frameGeometry,
  MAX_PAGES,
  MAX_STRIP_HEIGHT,
  planPages,
  PRINT_LINE_HEIGHT,
  PRINT_PADDING,
  type FrameShape,
  type PagePlan,
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

const frameFileName = (index: number): string =>
  `json-${String(index + 1).padStart(2, "0")}.jpg`;

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
  const [charWidth, setCharWidth] = useState<number | null>(null);
  const [fontState, setFontState] = useState<FontState>("loading");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [active, setActive] = useState(0);

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
  const activeIndex = pages.length === 0 ? 0 : Math.min(active, pages.length - 1);
  const shapeHint = SHAPES.find((item) => item.id === shape)?.hint ?? "";

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
    if (fontState !== "ready") return;
    pages.forEach((page, index) => {
      const canvas = canvasRefs.current[index];
      if (!canvas) return;
      drawPage(canvas, page, `"${printFont}"`);
    });
  }, [fontState, pages, printFont]);

  const handleSource = (value: string) => {
    setFileError(null);
    setNotice(null);
    setSource(value);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
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
      const filename = frameFileName(index);
      downloadBlob(blob, filename);
      setNotice(`Браузер сохраняет ${filename}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось скачать кадр");
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAll = async () => {
    if (pages.length === 0) return;
    if (pages.length === 1) {
      await downloadFrame(0);
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < pages.length; index += 1) {
        const canvas = canvasRefs.current[index];
        if (!canvas) throw new Error("Кадр ещё не собран. Подожди секунду и повтори.");
        const blob = await canvasToJpeg(canvas);
        entries[frameFileName(index)] = new Uint8Array(await blob.arrayBuffer());
      }
      const zipped = zipSync(entries, { level: 0 });
      downloadBlob(new Blob([Uint8Array.from(zipped)]), "json-kadry.zip");
      setNotice(`Браузер сохраняет архив из ${pages.length} кадров`);
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
              JSON на ленту
            </h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            Детская камера печатает снимок из своего альбома. Этот экран
            собирает из JSON чёрно-белую фотографию: буквы крупные и без
            серого, поэтому после термопечати их ещё можно прочитать.
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
            handleFile(event.dataTransfer.files[0]);
          }}
        >
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
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,text/plain"
              className="sr-only"
              aria-label="Открыть JSON-файл"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
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
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {plan && pages.length > 0
                ? `${pages.length} ${framesWord(pages.length)} · ${plan.maxChars} символов в строке · до ${plan.contentLineBudget} строк на кадр`
                : "Здесь появится снимок для альбома камеры."}
            </p>
            {plan?.truncated ? (
              <p role="status" className="text-sm text-destructive">
                На снимок попали первые {MAX_PAGES} кадров. Уменьши шрифт или
                разрежь JSON.
              </p>
            ) : null}
          </div>

          {pages.length > 0 ? (
            <Button
              type="button"
              className="h-10 w-full"
              disabled={busy || fontState !== "ready"}
              onClick={() => void handleDownloadAll()}
            >
              <Download aria-hidden="true" />
              {pages.length === 1 ? "Скачать JPEG" : "Скачать все кадры"}
            </Button>
          ) : null}

          <p role="status" className="min-h-5 text-sm text-muted-foreground">
            {notice ?? ""}
          </p>

          {pages.length === 0 ? (
            <EmptySheet
              message={
                fontState === "error"
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
              {pages.map((page, index) => (
                <figure key={index} className="space-y-2">
                  <div className="border border-black bg-white shadow-[6px_6px_0_0_#1c1915]">
                    <canvas
                      ref={(node) => {
                        canvasRefs.current[index] = node;
                      }}
                      role="img"
                      aria-label={`Кадр ${index + 1} из ${pages.length}`}
                      className="block h-auto w-full"
                    />
                  </div>
                  <figcaption className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {page.width}×{page.height}
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

      {fullscreen && pages[activeIndex] ? (
        <FullscreenFrame
          page={pages[activeIndex] as PagePlan}
          index={activeIndex}
          total={pages.length}
          monoFamily={`"${printFont}"`}
          fontReady={fontState === "ready"}
          onClose={() => setFullscreen(false)}
          onPrev={() => setActive((current) => Math.max(0, current - 1))}
          onNext={() =>
            setActive((current) => Math.min(pages.length - 1, current + 1))
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
  page: PagePlan;
  index: number;
  total: number;
  monoFamily: string;
  fontReady: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const FullscreenFrame = ({
  page,
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
    if (!fontReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPage(canvas, page, monoFamily);
  }, [fontReady, monoFamily, page]);

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
            width: `min(96vw, calc((100dvh - 7rem) * ${page.width / page.height}))`,
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
