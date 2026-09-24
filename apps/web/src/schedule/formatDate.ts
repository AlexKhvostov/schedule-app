const MONTHS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

const MONTHS_RU_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

const MONTHS_RU_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTHS_EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Sunday = 0, same as Date#getDay() */
const WEEKDAYS_RU_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;
const WEEKDAYS_RU_LONG = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"] as const;
const WEEKDAYS_EN_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAYS_EN_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function isEn(lang: string) {
  return lang.toLowerCase().startsWith("en");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function monthName(monthIndex: number, lang: string, form: "long" | "short" | "gen" = "long") {
  const i = Math.min(11, Math.max(0, monthIndex));
  if (isEn(lang)) return form === "short" ? MONTHS_EN_SHORT[i] : MONTHS_EN[i];
  if (form === "short") return MONTHS_RU_SHORT[i];
  if (form === "gen") return MONTHS_RU_GEN[i];
  return MONTHS_RU[i];
}

export function monthTitle(year: number, monthIndex: number, lang: string) {
  return `${titleCase(monthName(monthIndex, lang, "long"))} ${year}`;
}

export function monthShort(monthIndex: number, lang: string) {
  return monthName(monthIndex, lang, "short");
}

export function weekdayShort(dow: number, lang: string) {
  const i = ((dow % 7) + 7) % 7;
  return isEn(lang) ? WEEKDAYS_EN_SHORT[i] : WEEKDAYS_RU_SHORT[i];
}

export function weekdayLong(dow: number, lang: string) {
  const i = ((dow % 7) + 7) % 7;
  return isEn(lang) ? WEEKDAYS_EN_LONG[i] : WEEKDAYS_RU_LONG[i];
}

export function weekdayLabelsMonFirst(lang: string) {
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => weekdayShort(dow, lang));
}

export function formatDayLabel(year: number, monthIndex: number, day: number, lang: string) {
  const date = new Date(year, monthIndex, day);
  const wd = titleCase(weekdayShort(date.getDay(), lang));
  const month = monthName(monthIndex, lang, isEn(lang) ? "short" : "short");
  return `${wd} ${day} ${month}`;
}

export function formatDayLong(year: number, monthIndex: number, day: number, lang: string) {
  const date = new Date(year, monthIndex, day);
  const wd = titleCase(weekdayLong(date.getDay(), lang));
  if (isEn(lang)) return `${wd}, ${day} ${monthName(monthIndex, lang, "long")}`;
  return `${wd}, ${day} ${monthName(monthIndex, lang, "gen")}`;
}
