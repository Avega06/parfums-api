export const stringMatched = (term: string, regex: RegExp) => {
  const result = term.match(regex);
  if (result) return result;
};

export const cleanText = (term: string, reg: RegExp) => {
  return term.replace(reg, "").replace(/\s+/g, " ").trim();
};
export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const normalizeUrl = (url?: string): string => {
  if (!url) return "";
  let cleaned = url.trim();
  if (cleaned.startsWith("https:https://")) {
    cleaned = cleaned.replace("https:https://", "https://");
  }
  return cleaned;
};

export const normalizeImageSrcset = (url?: string): string => {
  if (!url) return "";
  const cleaned = normalizeUrl(url);
  const parts = cleaned.split(",").map((part) => part.trim());
  parts.sort(); // Ordena alfabéticamente para evitar diferencias por orden.
  return parts.join(", ");
};

export const slugify = (text: string): string => {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};
