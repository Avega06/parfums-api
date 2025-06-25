export const parseCurrencyWithLocale = (
  value: string,
  locale: string = "en-US"
): number => {
  const formatter = new Intl.NumberFormat(locale);
  const parts = formatter
    .formatToParts(1234.56)
    .find((part) => part.type === "decimal")?.value;
  const cleanedValue = value.replace(new RegExp(`[^0-9${parts}-]`, "g"), "");
  return parseFloat(cleanedValue.replace(parts || ".", "."));
};
