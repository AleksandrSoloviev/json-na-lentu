export const MAX_JSON_CHARS = 100_000;

export type JsonText =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; raw: string; pretty: string };

export const parseJsonText = (source: string): JsonText => {
  if (source.length > MAX_JSON_CHARS) {
    return {
      kind: "error",
      message: "Слишком длинный текст. Оставь до 100 000 символов.",
    };
  }

  const raw = source.replace(/^\uFEFF/, "").trim();
  if (!raw) return { kind: "empty" };

  try {
    const pretty = JSON.stringify(JSON.parse(raw), null, 2);
    return { kind: "ok", raw, pretty };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не получилось прочитать JSON";
    return { kind: "error", message: `JSON не читается: ${message}` };
  }
};
