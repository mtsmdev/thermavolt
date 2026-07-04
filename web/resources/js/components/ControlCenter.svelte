<script lang="ts">
    import { Link } from "@inertiajs/svelte";
    import type { Snapshot } from "../generated/energy_pb";
    import Icon from "./Icon.svelte";
    import DeviceArt from "./DeviceArt.svelte";
    import Toggle from "./Toggle.svelte";
    import PowerChart from "./PowerChart.svelte";
    import EvBatteryReset from "./EvBatteryReset.svelte";
    import {
        number,
        temperature,
        time,
        sourceLabel,
        pvLabel,
    } from "../lib/format";
    let {
        simulation,
        busy,
        oncontrols,
        onconfigure,
        onresetEv,
    }: {
        simulation: Snapshot;
        busy: boolean;
        oncontrols: (patch: any) => Promise<boolean>;
        onconfigure: (patch: any) => Promise<boolean>;
        onresetEv: () => Promise<boolean>;
    } = $props();
    const p = $derived(simulation.telemetry!),
        c = $derived(simulation.configuration!),
        env = $derived(simulation.environment!),
        ctrl = $derived(simulation.controls!);
</script>

<div class="control-summary panel">
    <div>
        <Icon name="sun" size={38} /><span
            >PV electricity<strong>{number(p.solarGenerated)} kW</strong></span
        >
    </div>
    <div>
        <Icon name="grid" size={38} /><span
            >Grid import<strong>{number(p.gridImport)} kW</strong></span
        >
    </div>
    <div>
        <Icon name="network" size={32} /><strong>3 systems online</strong>
    </div>
    <button
        class="danger-outline"
        disabled={busy}
        onclick={() =>
            oncontrols({ homeMode: "off", evMode: "off", waterMode: "off" })}
        ><Icon name="power" size={20} />Turn all off</button
    >
</div>
<div class="control-cards">
    {#each [{ id: "home" as const, name: "Home electricity", options: ["auto", "grid", "off"], mode: ctrl.homeMode, status: ctrl.homeMode === "off" ? "Off" : ctrl.homeMode === "grid" ? "Grid active" : p.batteryDischarge > 0.01 ? "Battery backup" : "PV active" }, { id: "water" as const, name: "Water heating", options: ["solar", "grid", "off", "schedule"], mode: ctrl.waterMode, status: p.waterPower > 0.01 ? "Electric backup" : p.thermalPower > 0.01 ? "Solar thermal" : "Standby" }, { id: "ev" as const, name: "EV charging", options: ["solar", "grid", "off", "schedule"], mode: ctrl.evMode, status: p.evStatus }] as device}
        <section class="panel control-card">
            <div class="panel-heading">
                <h3><Icon name={device.id} size={30} />{device.name}</h3>
                <span
                    class="device-status"
                    class:inactive={device.mode === "off"}
                    ><i></i>{device.id === "water"
                        ? device.status
                        : pvLabel(device.status)}</span
                >
            </div>
            <div class="control-illustration">
                <DeviceArt device={device.id} />
            </div>
            <div class="control-reading">
                <small
                    >{device.id === "home"
                        ? "Current load"
                        : device.id === "water"
                          ? "Water temperature"
                          : "Charging power"}</small
                ><strong
                    >{device.id === "water"
                        ? temperature(simulation.waterTemperature, env.unit)
                        : number(
                              device.id === "home" ? p.homeSupplied : p.evPower,
                          ) + " kW"}</strong
                >
            </div>
            <div class="source-options">
                {#each device.options as mode}<button
                        class:active={device.mode === mode}
                        aria-pressed={device.mode === mode}
                        disabled={busy}
                        onclick={() =>
                            oncontrols({ [device.id + "Mode"]: mode })}
                        >{sourceLabel(mode, device.id)}</button
                    >{/each}
            </div>
            {#if device.id === "home"}
                <div class="setting-line">
                    <div>
                        <b>Grid fallback</b><small
                            >When PV and the home battery are insufficient</small
                        >
                    </div>
                    <Toggle
                        checked={ctrl.gridFallback}
                        label="Enable home grid fallback"
                        disabled={busy}
                        onchange={(v) => oncontrols({ gridFallback: v })}
                    />
                </div>
                <div class="device-mini-chart">
                    <div class="mini-chart-title">
                        <span>Home load · last 24 hours</span><small
                            >Now {number(p.homeSupplied)} kW</small
                        >
                    </div>
                    <PowerChart readings={simulation.readings} kind="home" />
                </div>
                <div class="control-footnote">
                    <Icon name="shield" size={16} />Battery backup is automatic
                    and home only.
                </div>
            {:else if device.id === "water"}
                <label class="range-label"
                    >Target temperature<strong
                        >{temperature(c.waterTarget, env.unit)}</strong
                    ><input
                        type="range"
                        min="30"
                        max="75"
                        step="1"
                        value={c.waterTarget}
                        aria-valuetext={temperature(c.waterTarget, env.unit)}
                        disabled={busy}
                        onchange={(e) =>
                            onconfigure({
                                waterTarget: +e.currentTarget.value,
                            })}
                    /><span class="range-limits"
                        ><span>{temperature(30, env.unit)}</span><span
                            >{temperature(75, env.unit)}</span
                        ></span
                    ></label
                >
                <div class="setting-line relay-line">
                    <div>
                        <b>Electric backup relay</b><small
                            >Off disables powered heating</small
                        >
                    </div>
                    <Toggle
                        checked={p.waterPower > 0.01}
                        label="Electric water backup"
                        disabled={busy}
                        onchange={(v) =>
                            oncontrols({ waterMode: v ? "grid" : "off" })}
                    />
                </div>
                <div class="device-mini-chart">
                    <div class="mini-chart-title">
                        <span>Water temperature · 24 hours</span>
                    </div>
                    <PowerChart
                        readings={simulation.readings}
                        kind="water"
                        unit={env.unit}
                    />
                </div>
            {:else}
                <div class="ev-level">
                    <span>Battery charge</span><strong
                        >{number(simulation.evPercent, 0)}%</strong
                    >
                    <div class="progress-track">
                        <span style:width={simulation.evPercent + "%"}></span>
                    </div>
                </div>
                <label class="range-label"
                    >Charge limit<strong>{number(c.evTarget, 0)}%</strong><input
                        type="range"
                        min="20"
                        max="100"
                        step="1"
                        value={c.evTarget}
                        disabled={busy}
                        onchange={(e) =>
                            onconfigure({ evTarget: +e.currentTarget.value })}
                    /><span class="range-limits"
                        ><span>20%</span><span>100%</span></span
                    ></label
                >
                <button
                    class="danger-outline full stop-charge"
                    disabled={busy}
                    onclick={() => oncontrols({ evMode: "off" })}
                    ><Icon name="square" size={17} />Stop charging</button
                >
                <EvBatteryReset {busy} onreset={onresetEv} />
                <p class="control-footnote">
                    Powered by shared rooftop PV or the utility grid.
                </p>
            {/if}
            {#if device.id !== "home"}<Link
                    href="/smart-scheduler"
                    class="text-link control-schedule"
                    >Edit schedule<Icon name="arrow" size={18} /></Link
                >{/if}
        </section>
    {/each}
</div>
<div class="control-bottom">
    <section class="panel grid-export-panel">
        <h3>
            <span class="amber"><Icon name="grid" size={30} /></span>Grid export
        </h3>
        <div class="grid-export-body">
            <div>
                <div class="export-setting">
                    <span>Export surplus electricity</span><Toggle
                        checked={ctrl.exportEnabled}
                        label="Export surplus"
                        disabled={busy}
                        onchange={(v) => oncontrols({ exportEnabled: v })}
                    />
                </div>
                <small>PV electricity only · User opt-in</small>
            </div>
            <div>
                <span class="green">Export</span><strong
                    >{number(p.gridExport)} kW</strong
                >
            </div>
        </div>
    </section>
    <section class="panel">
        <div class="panel-heading">
            <h3><Icon name="activity" size={25} />Recent activity</h3>
        </div>
        <div class="activity-list">
            {#each simulation.activity.slice(0, 3) as item}<div>
                    <time>{time(item.time)}</time><Icon
                        name={item.kind === "weather"
                            ? "cloud"
                            : item.kind === "schedule"
                              ? "clock"
                              : "home"}
                        size={20}
                    /><span
                        ><b>{item.title}</b><small>{item.detail}</small></span
                    >
                </div>{/each}
        </div>
    </section>
</div>
<section class="panel reserve-settings">
    <h3><Icon name="battery" size={23} />Automatic home battery</h3>
    <span
        >{number(simulation.batteryKwh)} / {number(c.batteryCapacity, 0)} kWh stored
        · {p.batteryStatus}</span
    ><label class="range-label"
        >Minimum reserve<strong>{number(c.batteryReserve, 0)}%</strong><input
            type="range"
            min="0"
            max="90"
            value={c.batteryReserve}
            disabled={busy}
            onchange={(e) =>
                onconfigure({ batteryReserve: +e.currentTarget.value })}
        /></label
    >
</section>
