import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/ru";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("ru");

export const fmtTime = (iso: string) => dayjs(iso).format("HH:mm");
export const fmtDate = (iso: string) => dayjs(iso).format("dd, D MMMM");
export const fmtDateTime = (iso: string) => dayjs(iso).format("D MMMM, HH:mm");

/** Таймзона браузера по умолчанию (напр. "Europe/Moscow"). */
export const browserTz = () => dayjs.tz.guess();

/** Время слота в выбранной таймзоне, напр. "09:15". */
export const fmtTimeTz = (iso: string, tz: string) => dayjs(iso).tz(tz).format("HH:mm");

/** Дата (YYYY-MM-DD) слота в выбранной таймзоне — ключ для группировки по дням. */
export const dateKeyTz = (iso: string, tz: string) => dayjs(iso).tz(tz).format("YYYY-MM-DD");

/** Читаемая дата+время слота в таймзоне, напр. "10 июля 2026, 09:15". */
export const fmtDateTimeTz = (iso: string, tz: string) =>
  dayjs(iso).tz(tz).format("D MMMM YYYY, HH:mm");

/** Читаемая дата дня, напр. "пятница, 10 июля". */
export const fmtDayLong = (iso: string, tz: string) =>
  dayjs(iso).tz(tz).format("dddd, D MMMM");

export function fmtPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
