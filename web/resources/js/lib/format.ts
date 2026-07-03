export const number = (n: number, digits = 1) =>
    new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(n);
export const sourceLabel = (mode: string, system: string) =>
    mode === "solar"
        ? system === "water"
            ? "Thermal"
            : "PV"
        : mode[0].toUpperCase() + mode.slice(1);
export const pvLabel = (text: string) => text.replace(/\bsolar\b/gi, "PV");
export const temperature = (c: number, unit: string) =>
    number(unit === "F" ? (c * 9) / 5 + 32 : c, unit === "F" ? 1 : 0) +
    "°" +
    unit;
export const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Amsterdam",
    });
export const clockDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "Europe/Amsterdam",
    });
export const minuteLabel = (m: number) =>
    Math.floor(m / 60)
        .toString()
        .padStart(2, "0") +
    ":" +
    (m % 60).toString().padStart(2, "0");
export const minuteValue = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
};
export const money = (n: number) =>
    new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
    }).format(n);
export const dayName = (day: string) =>
    new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "short",
    });
