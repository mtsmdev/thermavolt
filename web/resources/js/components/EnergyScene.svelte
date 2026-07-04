<script lang="ts">
    import DeviceArt from "./DeviceArt.svelte";
    import Icon from "./Icon.svelte";
    import { number, temperature, pvLabel } from "../lib/format";
    import type { Snapshot } from "../generated/energy_pb";
    import { flowDuration } from "../lib/simulation-runtime";
    let {
        simulation,
        speed,
        playing,
    }: { simulation: Snapshot; speed: number; playing: boolean } = $props();
    const p = $derived(simulation.telemetry!),
        env = $derived(simulation.environment!);
</script>

<div
    class="energy-scene"
    class:night={env.lighting === "night"}
    class:flow-paused={!playing}
    style:--flow-duration={flowDuration(speed) + "s"}
    aria-label="Live energy flow between rooftop PV, the home, solar water heater, EV, battery and grid"
>
    <div class="scene-floor"></div>
    <div class="art-home"><DeviceArt device="home" /></div>
    <div class="art-water"><DeviceArt device="water" /></div>
    <div class="art-ev"><DeviceArt device="ev" /></div>
    <div class="art-battery"><DeviceArt device="battery" /></div>
    <span class="rooftop-label">Rooftop PV</span>
    <svg
        class="energy-paths"
        viewBox="0 0 1000 520"
        preserveAspectRatio="none"
        aria-hidden="true"
    >
        <defs>
            <marker
                id="flow-green"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
                ><path
                    d="M1 1 8 5 1 9"
                    fill="none"
                    stroke="#00f27c"
                    stroke-width="2"
                /></marker
            >
            <marker
                id="flow-cyan"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
                ><path
                    d="M1 1 8 5 1 9"
                    fill="none"
                    stroke="#00d5f4"
                    stroke-width="2"
                /></marker
            >
            <marker
                id="flow-orange"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
                ><path
                    d="M1 1 8 5 1 9"
                    fill="none"
                    stroke="#ffa51c"
                    stroke-width="2"
                /></marker
            >
        </defs>
        <path d="M275 62 H884 V205" class="wire inactive-route" />
        <path
            d="M275 62 H884 V205"
            class="wire solar"
            class:active={p.solarEv > 0.01}
            marker-end={p.solarEv > 0.01 ? "url(#flow-green)" : undefined}
        />
        <path
            d="M207 128 V269"
            class="wire solar"
            class:active={p.solarHome > 0.01}
            marker-end={p.solarHome > 0.01 ? "url(#flow-green)" : undefined}
        />
        <path
            d="M406 390 H208 V345"
            class="wire storage"
            class:active={p.batteryDischarge > 0.01}
            marker-end={p.batteryDischarge > 0.01
                ? "url(#flow-cyan)"
                : undefined}
        />
        <path
            d="M208 345 V390 H406"
            class="wire storage"
            class:active={p.batteryCharge > 0.01}
            marker-end={p.batteryCharge > 0.01 ? "url(#flow-cyan)" : undefined}
        />
        <path
            d="M436 240 492 113"
            class="wire thermal"
            class:active={p.thermalPower > 0.01}
            marker-end={p.thermalPower > 0.01 ? "url(#flow-orange)" : undefined}
        />
        <path
            d="M70 438 H884"
            class="wire grid"
            class:active={p.gridImport > 0.01 || p.gridExport > 0.01}
        />
        <path
            d="M208 438 V345"
            class="wire grid"
            class:active={p.gridHome > 0.01}
        />
        <path
            d="M830 438 V345"
            class="wire grid"
            class:active={p.gridEv > 0.01}
        />
        <path
            d="M495 438 V345"
            class="wire grid"
            class:active={p.waterPower > 0.01}
        />
    </svg>
    <div class="device-label home-label">
        <span class="blue"><Icon name="home" size={24} /><b>Home</b></span
        ><strong>{number(p.homeSupplied)} kW</strong>{#if p.unmetHome > 0.01}<em
                class="amber">{number(p.unmetHome)} kW unmet</em
            >{/if}
    </div>
    <div class="device-label water-label">
        <span class="cyan"><Icon name="water" size={23} /><b>Water</b></span
        ><strong>{temperature(simulation.waterTemperature, env.unit)}</strong>
    </div>
    <div class="device-label ev-label">
        <span class="green"><Icon name="ev" size={24} /><b>EV</b></span><strong
            >{number(p.evPower)} kW</strong
        ><em>{pvLabel(p.evStatus)}</em>
    </div>
    <div class="device-label battery-label">
        <span>Home battery</span><strong>{number(p.batteryPercent, 0)}%</strong
        ><b
            >{number(simulation.batteryKwh)} / {number(
                simulation.configuration!.batteryCapacity,
                0,
            )} kWh</b
        ><em class="cyan"
            >{p.batteryStatus} · {number(p.batteryDischarge || p.batteryCharge)} kW</em
        >
    </div>
    <div class="scene-grid-meter">
        <Icon name="grid" size={58} />
        <div>
            <span>Grid</span><b>{number(p.gridImport || p.gridExport)} kW</b
            >{#if p.gridExport > 0.01}<small>Exporting</small>{/if}
        </div>
    </div>
</div>
