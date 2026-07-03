import { writable } from "svelte/store";
import type { Snapshot } from "../generated/energy_pb";
import type { energyClient } from "./api";

export const simulationSpeeds = [1, 60, 360, 1440] as const;

export function flowDuration(speed: number): number {
    return (
        ({ 1: 1.6, 60: 0.75, 360: 0.35, 1440: 0.14 } as Record<number, number>)[
            speed
        ] ?? 1.6
    );
}

type EnergyClient = ReturnType<typeof energyClient>;
type RuntimeState = {
    simulation: Snapshot | null;
    playing: boolean;
    speed: number;
    busy: boolean;
    connected: boolean;
    error: string;
    toast: string;
};
type RuntimeClock = {
    now: () => number;
    start: (tick: () => void) => () => void;
};

export class SimulationRuntime {
    private value: RuntimeState = {
        simulation: null,
        playing: false,
        speed: 60,
        busy: false,
        connected: false,
        error: "",
        toast: "",
    };
    readonly state = writable(this.value);
    private clientFactory: () => EnergyClient;
    private clock: RuntimeClock;
    private activeClient?: EnergyClient;
    private stopTimer?: () => void;
    private toastTimer?: ReturnType<typeof setTimeout>;
    private lastTick = 0;
    private pendingSeconds = 0;
    token = "";

    constructor(clientFactory: () => EnergyClient, clock?: RuntimeClock) {
        this.clientFactory = clientFactory;
        this.clock = clock ?? {
            now: () => performance.now(),
            start: (tick) => {
                const timer = setInterval(tick, 1000);
                return () => clearInterval(timer);
            },
        };
    }

    get client(): EnergyClient {
        return (this.activeClient ??= this.clientFactory());
    }

    private update(patch: Partial<RuntimeState>): void {
        this.value = { ...this.value, ...patch };
        this.state.set(this.value);
    }

    async connect(token: string): Promise<void> {
        this.token = token;
        if (!this.stopTimer) {
            this.lastTick = this.clock.now();
            this.stopTimer = this.clock.start(() => {
                void this.tick();
            });
        }
        if (!this.value.simulation || !this.value.connected) {
            await this.run(() => this.client.getState({ token: this.token }));
        }
    }

    private accumulate(): void {
        const now = this.clock.now();
        if (this.value.playing) {
            this.pendingSeconds +=
                (Math.max(0, now - this.lastTick) / 1000) * this.value.speed;
        }
        this.lastTick = now;
    }

    setPlaying(playing: boolean): void {
        if (playing && (!this.value.simulation || !this.value.connected))
            return;
        this.accumulate();
        if (!playing) this.pendingSeconds = 0;
        this.update({ playing });
    }

    setSpeed(speed: number): void {
        if (!simulationSpeeds.some((value) => value === speed)) return;
        this.accumulate();
        this.update({ speed });
    }

    async tick(): Promise<void> {
        this.accumulate();
        if (!this.value.playing || this.value.busy) return;
        const seconds = Math.min(86400, Math.floor(this.pendingSeconds));
        if (seconds < 1) return;
        this.pendingSeconds -= seconds;
        await this.run(() =>
            this.client.advanceTime({ token: this.token, seconds }),
        );
    }

    async run(task: () => Promise<Snapshot>, message = ""): Promise<boolean> {
        if (this.value.busy) return false;
        this.update({ busy: true });
        try {
            const simulation = await task();
            this.update({ simulation, error: "", connected: true });
            if (message) {
                clearTimeout(this.toastTimer);
                this.update({ toast: message });
                this.toastTimer = setTimeout(
                    () => this.update({ toast: "" }),
                    3500,
                );
            }
            return true;
        } catch (error) {
            const failure = error as { rawMessage?: string; message?: string };
            this.setPlaying(false);
            this.update({
                error:
                    failure.rawMessage ||
                    failure.message ||
                    "Could not reach the simulation.",
                connected: false,
            });
            return false;
        } finally {
            this.update({ busy: false });
        }
    }

    dispose(): void {
        this.setPlaying(false);
        this.stopTimer?.();
        this.stopTimer = undefined;
        clearTimeout(this.toastTimer);
    }
}
