export const MAX_TEXT_CHARS = 100_000;

export type PlainText =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; text: string };

export const preparePlainText = (source: string): PlainText => {
  if (source.length > MAX_TEXT_CHARS) {
    return {
      kind: "error",
      message: "Слишком длинный текст. Оставь до 100 000 символов.",
    };
  }

  const text = source.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (text.trim() === "") return { kind: "empty" };
  return { kind: "ok", text };
};
