<script lang="ts">
    import { Link } from "@inertiajs/svelte";
    import type { Snapshot } from "../generated/energy_pb";
    import Icon from "./Icon.svelte";
    import Toggle from "./Toggle.svelte";
    import EnergyScene from "./EnergyScene.svelte";
    import PowerChart from "./PowerChart.svelte";
    import EvBatteryReset from "./EvBatteryReset.svelte";
    import { number, temperature, sourceLabel, pvLabel } from "../lib/format";
    let {
        simulation,
        busy,
        oncontrols,
        onresetEv,
        speed,
        playing,
    }: {
        simulation: Snapshot;
        busy: boolean;
        oncontrols: (patch: any) => Promise<boolean>;
        onresetEv: () => Promise<boolean>;
        speed: number;
        playing: boolean;
    } = $props();
    const p = $derived(simulation.telemetry!),
        c = $derived(simulation.configuration!),
        env = $derived(simulation.environment!),
        ctrl = $derived(simulation.controls!);
    const today = $derived(
        simulation.daily.find((d) => d.date === simulation.clock.slice(0, 10)),
    );
</script>

{#snippet sources(system: string, options: string[], selected: string)}
    <div class="source-options">
        {#each options as mode}<button
                class:active={selected === mode}
                aria-pressed={selected === mode}
                disabled={busy}
                onclick={() => oncontrols({ [system + "Mode"]: mode })}
                >{sourceLabel(mode, system)}</button
            >{/each}
    </div>
{/snippet}

<div class="metric-grid dashboard-metrics">
    {#each [{ label: "PV electricity", icon: "sun", value: p.solarGenerated, tone: "green" }, { label: "Home load", icon: "home", value: p.homeSupplied, tone: "blue" }, { label: "EV charging", icon: "ev", value: p.evPower, tone: "green" }, { label: "Grid import", icon: "grid", value: p.gridImport, tone: "amber" }] as metric}
        <section
            class="panel metric-card"
            title={metric.label + " · current simulated power"}
        >
            <span class={"metric-icon " + metric.tone}
                ><Icon name={metric.icon} size={34} /></span
            >
            <div>
                <span class="metric-caption">{metric.label}</span><strong
                    class="metric-value"
                    >{number(metric.value)} <span>kW</span></strong
                >
            </div>
        </section>
    {/each}
</div>
<div class="dashboard-main">
    <EnergyScene {simulation} {speed} {playing} />
    <div class="dashboard-charts">
        <section class="panel power-panel">
            <div class="panel-heading">
                <h3>Daily power <span>(24 hours)</span></h3>
                <Link
                    href="/analytics"
                    class="chart-more"
                    aria-label="View energy analytics"
                    ><Icon name="arrow" size={18} /></Link
                >
            </div>
            <PowerChart readings={simulation.readings} />
        </section>
        <section class="panel today-panel">
            <h3>Daily energy statistics</h3>
            {#each [{ icon: "sun", label: "PV today", value: today?.solar || 0, tone: "amber" }, { icon: "storage", label: "Battery stored", value: simulation.batteryKwh, tone: "cyan" }, { icon: "grid", label: "Export today", value: today?.exported || 0, tone: "amber" }] as item}
                <div class="today-stat">
                    <span class={item.tone}
                        ><Icon name={item.icon} size={28} /></span
                    ><span>{item.label}</span><strong
                        >{number(item.value)} <small>kWh</small></strong
                    >
                </div>
            {/each}
        </section>
    </div>
</div>
<aside class="device-column" aria-label="Quick device controls">
    <section class="panel quick-device">
        <h3><Icon name="home" size={25} />Home electricity</h3>
        {@render sources("home", ["auto", "grid", "off"], ctrl.homeMode)}
        <div class="device-detail">
            <span
                >{ctrl.homeMode === "auto"
                    ? "PV + battery"
                    : ctrl.homeMode === "grid"
                      ? "Utility electricity"
                      : "Supply disabled"}</span
            ><span
                >{ctrl.homeMode === "auto" ? "Automatic home backup" : ""}</span
            >
        </div>
        {#if p.unmetHome > 0.01}<div class="shortfall">
                <Icon name="alert" size={14} />{number(p.unmetHome)} kW unmet · reserve
                protected
            </div>{/if}
    </section>
    <section class="panel quick-device">
        <h3>
            <span class="cyan"><Icon name="water" size={26} /></span>Water
            heating
        </h3>
        {@render sources(
            "water",
            ["solar", "grid", "off", "schedule"],
            ctrl.waterMode,
        )}
        <div class="device-reading">
            <span>Water temperature</span><strong
                >{temperature(simulation.waterTemperature, env.unit)}</strong
            >
        </div>
        <div class="device-reading">
            <span>Electric backup</span><b
                >{p.waterPower > 0.01 ? number(p.waterPower) + " kW" : "Off"}</b
            >
        </div>
    </section>
    <section class="panel quick-device">
        <h3>
            <span class="green"><Icon name="ev" size={26} /></span>EV charging
        </h3>
        {@render sources(
            "ev",
            ["solar", "grid", "off", "schedule"],
            ctrl.evMode,
        )}
        <div class="ev-status">{pvLabel(p.evStatus)}</div>
        <div class="ev-level">
            <span>EV battery</span><strong
                >{number(simulation.evPercent, 0)}%</strong
            >
            <div class="progress-track">
                <span style:width={simulation.evPercent + "%"}></span>
            </div>
        </div>
        <EvBatteryReset {busy} onreset={onresetEv} />
    </section>
    <section class="panel battery-widget">
        <div class="panel-heading">
            <h3><Icon name="battery" size={25} />Home battery</h3>
            <span class="battery-auto"><b>AUTO</b>Home only</span>
        </div>
        <div class="battery-level">
            <strong>{number(p.batteryPercent, 0)}%</strong>
            <div class="progress-track">
                <span style:width={p.batteryPercent + "%"}></span><i
                    style:left={c.batteryReserve + "%"}
                    title="Minimum reserve"
                ></i>
            </div>
        </div>
        <div class="battery-data">
            <div>
                <small>Stored</small><b>{number(simulation.batteryKwh)} kWh</b>
            </div>
            <div>
                <small>Capacity</small><b>{number(c.batteryCapacity, 0)} kWh</b>
            </div>
            <div>
                <small>Reserve</small><b>{number(c.batteryReserve, 0)}%</b>
            </div>
            <div>
                <small class="cyan">{p.batteryStatus}</small><b class="cyan"
                    >{number(p.batteryDischarge || p.batteryCharge)} kW</b
                >
            </div>
        </div>
    </section>
    <section class="panel export-widget">
        <div>
            <h3>Export surplus</h3>
            <p>Send surplus PV electricity to the grid</p>
            <small><Icon name="info" size={16} />User opt-in</small>
        </div>
        <Toggle
            checked={ctrl.exportEnabled}
            label="Export surplus electricity"
            disabled={busy}
            onchange={(v) => oncontrols({ exportEnabled: v })}
        />
    </section>
    <section class="panel auto-status">
        <h3><Icon name="settings" size={25} />Automatic home supply</h3>
        <div>
            <span>Mode</span><b class="green"
                >{ctrl.homeMode[0].toUpperCase() + ctrl.homeMode.slice(1)}</b
            >
        </div>
        <div>
            <span>Weather</span><b
                ><Icon
                    name={env.weather === "sunny"
                        ? "sun"
                        : env.weather === "rainy"
                          ? "rain"
                          : "cloud"}
                    size={17}
                />{env.weather[0].toUpperCase() + env.weather.slice(1)}</b
            >
        </div>
        <div>
            <span>Time of day</span><b
                ><Icon
                    name={env.lighting === "day" ? "sun" : "moon"}
                    size={17}
                />{env.lighting === "day" ? "Day" : "Night"}</b
            >
        </div>
        <div>
            <span>PV available</span><b>{number(p.solarAvailable)} kW</b>
        </div>
        <div><span>Home demand</span><b>{number(p.homeDemand)} kW</b></div>
        <div>
            <span>Battery supplies</span><b class="cyan"
                >{number(p.batteryDischarge)} kW</b
            >
        </div>
        <p><Icon name="info" size={18} />{pvLabel(p.batteryReason)}.</p>
    </section>
</aside>
