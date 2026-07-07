import seed from "./seed.json";
import type { Snapshot } from "../generated/energy_pb";

type State = typeof seed;
type Power = State["telemetry"];
const storageKey = "thermavolt-pages-demo-v1";

function freshState(): State {
    const state = structuredClone(seed);
    const today = new Date();
    const source = new Date(seed.clock);
    const days = Math.round(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
            Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate())) /
            86400000,
    );
    const shift = (value: string) =>
        new Date(new Date(value).getTime() + days * 86400000).toISOString();
    state.clock = shift(state.clock);
    state.readings.forEach((reading) => (reading.time = shift(reading.time)));
    state.activity.forEach((entry) => (entry.time = shift(entry.time)));
    state.daily.forEach(
        (daily) =>
            (daily.date = shift(daily.date + "T12:00:00Z").slice(0, 10)),
    );
    state.transport = "Browser demo · sample data";
    return state;
}

function loadState(): State {
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved) as State;
            if (parsed.configuration && parsed.telemetry && parsed.readings) {
                return parsed;
            }
        }
    } catch {
        // A browser without storage still gets an in-memory demo.
    }
    return freshState();
}

let state: State | undefined;
const current = () => (state ??= loadState());
const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));

function effectiveMode(s: State, system: "ev" | "water"): string {
    const selected = s.controls[system === "ev" ? "evMode" : "waterMode"];
    if (selected !== "schedule") return selected;
    const at = new Date(s.clock);
    const day = (at.getDay() + 6) % 7;
    const minute = at.getHours() * 60 + at.getMinutes();
    return (
        s.schedules.find(
            (block) =>
                block.enabled &&
                block.system === system &&
                block.days.includes(day) &&
                minute >= block.start &&
                minute < block.end,
        )?.source ?? "off"
    );
}

function power(s: State, hours = 1 / 60): Power {
    const c = s.configuration;
    const sun =
        s.environment.lighting === "day"
            ? { sunny: 1, cloudy: 0.15, rainy: 0.05 }[
                  s.environment.weather as "sunny" | "cloudy" | "rainy"
              ] ?? 0
            : 0;
    const variation = c.variation
        ? 1 + Math.sin(Date.parse(s.clock) / 60000 * 0.71) * 0.08
        : 1;
    const solarAvailable = c.solarCapacity * sun * variation;
    let remaining = solarAvailable;
    const homeDemand = s.controls.homeMode === "off" ? 0 : c.homeDemand * variation;
    let solarHome = 0;
    let gridHome = 0;
    let batteryDischarge = 0;
    let unmetHome = 0;
    if (s.controls.homeMode === "grid") {
        gridHome = homeDemand;
    } else if (s.controls.homeMode === "auto") {
        solarHome = Math.min(remaining, homeDemand);
        remaining -= solarHome;
        const usable = Math.max(0, s.batteryKwh - c.batteryCapacity * c.batteryReserve / 100);
        batteryDischarge = Math.min(
            homeDemand - solarHome,
            c.batteryMaxDischarge,
            usable * 0.95 / hours,
        );
        unmetHome = Math.max(0, homeDemand - solarHome - batteryDischarge);
        if (s.controls.gridFallback) {
            gridHome = unmetHome;
            unmetHome = 0;
        }
    }
    const evMode = effectiveMode(s, "ev");
    const evRoom = Math.max(0, (c.evTarget - s.evPercent) / 100 * c.evCapacity);
    const evLimit = Math.min(c.evChargePower, evRoom / (hours * 0.92));
    let solarEv = evMode === "solar" ? Math.min(remaining, evLimit) : 0;
    if (solarEv < Math.min(1.4, evLimit)) solarEv = 0;
    remaining -= solarEv;
    const gridEv = evMode === "grid" ? evLimit : 0;
    const evPower = solarEv + gridEv;
    const waterMode = effectiveMode(s, "water");
    const thermalPower = Math.min(2.5 * sun, Math.max(0, (85 - s.waterTemperature) * 0.2326 / hours));
    const heatLoss = Math.max(0, (s.waterTemperature - 20) * 0.002) + 0.12;
    const waterPower =
        waterMode === "grid"
            ? Math.min(2, Math.max(0, (c.waterTarget - s.waterTemperature) * 0.2326 / hours + heatLoss - thermalPower))
            : 0;
    const room = Math.max(0, c.batteryCapacity - s.batteryKwh);
    const batteryCharge = batteryDischarge > 0 ? 0 : Math.min(remaining, c.batteryMaxCharge, room / (hours * 0.95));
    remaining -= batteryCharge;
    const gridExport = s.controls.exportEnabled ? remaining : 0;
    const curtailed = remaining - gridExport;
    return {
        solarAvailable,
        solarGenerated: solarAvailable - curtailed,
        solarHome,
        solarEv,
        homeDemand,
        homeSupplied: homeDemand - unmetHome,
        evPower,
        waterPower,
        thermalPower,
        gridImport: gridHome + gridEv + waterPower,
        gridExport,
        batteryCharge,
        batteryDischarge,
        curtailed,
        unmetHome,
        gridHome,
        gridEv,
        batteryPercent: s.batteryKwh / c.batteryCapacity * 100,
        batteryStatus: batteryDischarge > 0.001 ? "Discharging" : batteryCharge > 0.001 ? "Charging" : "Idle",
        batteryReason: batteryDischarge > 0.001 ? "Covering the home solar shortfall" : batteryCharge > 0.001 ? "Storing surplus rooftop solar" : "Home demand covered",
        evStatus: s.evPercent >= c.evTarget ? "Charge limit reached" : evPower > 0 ? "Charging" : evMode === "solar" ? "Paused · low solar" : "Off",
        effectiveEvMode: evMode,
        effectiveWaterMode: waterMode,
    };
}

function log(s: State, title: string, detail: string, kind = "control") {
    s.activity.unshift({ id: crypto.randomUUID(), time: s.clock, title, detail, kind });
    s.activity = s.activity.slice(0, 50);
}

function save(s: State): Snapshot {
    s.telemetry = power(s);
    s.revision++;
    try {
        localStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
        // Keep the demo usable when storage is disabled.
    }
    return structuredClone(s) as unknown as Snapshot;
}

function step(s: State, seconds: number) {
    const hours = seconds / 3600;
    const p = power(s, hours);
    const c = s.configuration;
    s.batteryKwh = clamp(s.batteryKwh + (p.batteryCharge * 0.95 - p.batteryDischarge / 0.95) * hours, 0, c.batteryCapacity);
    s.evPercent = clamp(s.evPercent + p.evPower * hours * 0.92 / c.evCapacity * 100, 0, 100);
    const loss = Math.max(0, (s.waterTemperature - 20) * 0.002) + 0.12;
    s.waterTemperature = clamp(s.waterTemperature + (p.thermalPower + p.waterPower - loss) * hours / 0.2326, 20, 85);
    const date = s.clock.slice(0, 10);
    let daily = s.daily.find((item) => item.date === date);
    if (!daily) {
        daily = { ...seed.daily[0], date };
        for (const key of Object.keys(daily) as (keyof typeof daily)[]) {
            if (key !== "date") (daily[key] as number) = 0;
        }
        s.daily.push(daily);
    }
    const values = {
        solar: p.solarGenerated, grid: p.gridImport, exported: p.gridExport,
        home: p.homeSupplied, ev: p.evPower, water: p.waterPower,
        thermal: p.thermalPower, batteryCharged: p.batteryCharge,
        batteryDischarged: p.batteryDischarge,
        batteryLosses: p.batteryCharge * 0.05 + p.batteryDischarge * (1 / 0.95 - 1),
        curtailed: p.curtailed, unmet: p.unmetHome,
        savings: (p.solarHome + p.solarEv + p.batteryDischarge) * c.gridRate,
        carbon: (p.solarHome + p.solarEv + p.batteryDischarge) * c.carbonFactor,
    };
    for (const [key, value] of Object.entries(values)) {
        (daily as unknown as Record<string, number>)[key] += value * hours;
    }
    s.clock = new Date(Date.parse(s.clock) + seconds * 1000).toISOString();
    const latest = power(s);
    s.readings.push({
        time: s.clock, solar: latest.solarGenerated, home: latest.homeSupplied,
        grid: latest.gridImport, batteryCharge: latest.batteryCharge,
        batteryDischarge: latest.batteryDischarge, ev: latest.evPower,
        waterTemperature: s.waterTemperature, batteryPercent: latest.batteryPercent,
        exported: latest.gridExport,
    });
    s.readings = s.readings.slice(-1152);
    s.daily = s.daily.slice(-31);
}

export function demoClient() {
    return {
        async getState(_request: { token: string }): Promise<Snapshot> {
            return save(current());
        },
        async setEnvironment(request: { token: string; [key: string]: unknown }): Promise<Snapshot> {
            const { token: _token, ...patch } = request;
            const s = current();
            Object.assign(s.environment, patch);
            log(s, "Environment updated", `${s.environment.weather} · ${s.environment.lighting}`, "weather");
            return save(s);
        },
        async setControls(request: { token: string; [key: string]: unknown }): Promise<Snapshot> {
            const { token: _token, ...patch } = request;
            const s = current();
            Object.assign(s.controls, patch);
            log(s, "Controls updated", "Device sources changed");
            return save(s);
        },
        async configure(request: { token: string; [key: string]: unknown }): Promise<Snapshot> {
            const { token: _token, batteryPercent, evPercent, waterTemperature, ...patch } = request;
            const s = current();
            Object.assign(s.configuration, patch);
            s.batteryKwh = batteryPercent === undefined
                ? Math.min(s.batteryKwh, s.configuration.batteryCapacity)
                : Number(batteryPercent) / 100 * s.configuration.batteryCapacity;
            if (evPercent !== undefined) s.evPercent = Number(evPercent);
            if (waterTemperature !== undefined) s.waterTemperature = Number(waterTemperature);
            log(s, "Simulation parameters saved", "Demo inputs changed", "simulation");
            return save(s);
        },
        async advanceTime(request: { token: string; seconds: number }): Promise<Snapshot> {
            const s = current();
            let remaining = clamp(Math.floor(request.seconds), 1, 86400);
            while (remaining > 0) {
                const seconds = Math.min(remaining, 600);
                step(s, seconds);
                remaining -= seconds;
            }
            return save(s);
        },
        async saveSchedule(request: { token: string; blocks: State["schedules"] }): Promise<Snapshot> {
            const s = current();
            s.schedules = structuredClone(request.blocks);
            log(s, "Schedule saved", `${s.schedules.length} time blocks`, "schedule");
            return save(s);
        },
        async resetSimulation(_request: { token: string }): Promise<Snapshot> {
            state = freshState();
            return save(state);
        },
    };
}
