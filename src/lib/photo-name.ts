const PHOTO_MAX = 99999;

export const photoFileName = (index: number): string => {
  const safe = Math.min(PHOTO_MAX, Math.max(0, Math.trunc(index)));
  return `PHO${String(safe).padStart(5, "0")}.JPG`;
};
