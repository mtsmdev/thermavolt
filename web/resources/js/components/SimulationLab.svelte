<script lang="ts">
    import { untrack } from "svelte";
    import Icon from "./Icon.svelte";
    import Toggle from "./Toggle.svelte";
    import EvBatteryReset from "./EvBatteryReset.svelte";
    import { temperature } from "../lib/format";
    import type { Snapshot } from "../generated/energy_pb";
    let {
        simulation,
        onconfigure,
        onpreset,
        onreset,
        onresetEv,
        busy,
    }: {
        simulation: Snapshot;
        onconfigure: (patch: any) => Promise<boolean>;
        onpreset: (weather: string, lighting: string) => void;
        onreset: () => void;
        onresetEv: () => Promise<boolean>;
        busy: boolean;
    } = $props();
    let draft = $state<any>(untrack(() => ({ ...simulation.configuration })));
    let override = $state(false);
    let battery = $state(76),
        ev = $state(68),
        water = $state(54);
    let saved = $state(false);
    const fields = [
        {
            key: "homeDemand",
            name: "Home demand",
            unit: "kW",
            min: 0,
            max: 15,
            step: 0.1,
        },
        {
            key: "solarCapacity",
            name: "Rooftop PV capacity",
            unit: "kW",
            min: 0,
            max: 20,
            step: 0.1,
        },
        {
            key: "batteryCapacity",
            name: "Battery capacity",
            unit: "kWh",
            min: 1,
            max: 40,
            step: 0.5,
        },
        {
            key: "batteryReserve",
            name: "Minimum battery reserve",
            unit: "%",
            min: 0,
            max: 90,
            step: 1,
        },
        {
            key: "batteryMaxCharge",
            name: "Maximum charge power",
            unit: "kW",
            min: 0.1,
            max: 10,
            step: 0.1,
        },
        {
            key: "batteryMaxDischarge",
            name: "Maximum discharge power",
            unit: "kW",
            min: 0.1,
            max: 10,
            step: 0.1,
        },
        {
            key: "evChargePower",
            name: "EV charging power",
            unit: "kW",
            min: 1.4,
            max: 22,
            step: 0.1,
        },
        {
            key: "evTarget",
            name: "EV charge limit",
            unit: "%",
            min: 20,
            max: 100,
            step: 1,
        },
        {
            key: "gridRate",
            name: "Electricity tariff",
            unit: "€/kWh",
            min: 0,
            max: 2,
            step: 0.01,
        },
        {
            key: "carbonFactor",
            name: "Carbon estimate factor",
            unit: "kg/kWh",
            min: 0,
            max: 2,
            step: 0.01,
        },
    ];
    async function apply() {
        const patch = { ...draft };
        delete patch.$typeName;
        if (override) {
            patch.batteryPercent = battery;
            patch.evPercent = ev;
            patch.waterTemperature = water;
        }
        saved = await onconfigure(patch);
    }
</script>

<div class="lab-intro">
    <div class="lab-symbol"><Icon name="lab" size={30} /></div>
    <div>
        <span class="eyebrow">YOUR EXPERIMENT SPACE</span>
        <h2>Make the conditions your own.</h2>
        <p>
            Change the inputs. Watch the system respond. Every reading is
            calculated in PHP and delivered over gRPC.
        </p>
    </div>
</div>
<div class="scenario-grid">
    {#each [{ name: "Sunny afternoon", icon: "sun", weather: "sunny", lighting: "day", text: "Power your home and EV. Store the surplus." }, { name: "Cloudy day", icon: "cloud", weather: "cloudy", lighting: "day", text: "Watch the battery cover the home shortfall." }, { name: "Rainy day", icon: "rain", weather: "rainy", lighting: "day", text: "Less PV. More automatic home backup." }, { name: "After dark", icon: "moon", weather: "cloudy", lighting: "night", text: "Zero PV. Home battery takes over." }] as scenario}<button
            class="panel scenario"
            onclick={() => onpreset(scenario.weather, scenario.lighting)}
            disabled={busy}
            ><Icon name={scenario.icon} size={27} /><b>{scenario.name}</b><span
                >{scenario.text}</span
            ><Icon name="arrow" size={17} /></button
        >{/each}
</div>
<section class="panel lab-form">
    <div class="ev-test-reset">
        <div>
            <h3>Repeat an EV charging test</h3>
            <p class="muted tiny">
                Reset only the car battery. Its power source, charge limit and
                saved history stay in place.
            </p>
        </div>
        <EvBatteryReset {busy} onreset={onresetEv} />
    </div>
    <div class="panel-heading">
        <div>
            <h3>Simulation parameters</h3>
            <p class="muted tiny">
                These are educational model settings, not hardware
                specifications.
            </p>
        </div>
        <button class="primary" onclick={apply} disabled={busy}
            ><Icon name={saved ? "check" : "save"} size={16} />{saved
                ? "Inputs saved"
                : "Apply inputs"}</button
        >
    </div>
    <div class="input-grid">
        {#each fields as field}<label
                >{field.name}
                <div class="unit-input">
                    <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        bind:value={draft[field.key]}
                        oninput={() => (saved = false)}
                    /><span>{field.unit}</span>
                </div></label
            >{/each}
    </div>
    <div class="setting-line">
        <div>
            <b>Natural variation</b><small
                >Add repeatable small fluctuations to sunlight and demand.</small
            >
        </div>
        <Toggle
            checked={draft.variation}
            label="Natural variation"
            onchange={(v) => {
                draft.variation = v;
                saved = false;
            }}
        />
    </div>
    <div class="setting-line">
        <div>
            <b>Set stored state manually</b><small
                >Override charge levels and water temperature when applying
                inputs.</small
            >
        </div>
        <Toggle
            checked={override}
            label="Override stored state"
            onchange={(v) => {
                override = v;
                saved = false;
            }}
        />
    </div>
    {#if override}<div class="input-grid stored-inputs">
            <label
                >Home battery charge
                <div class="unit-input">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        bind:value={battery}
                    /><span>%</span>
                </div></label
            ><label
                >EV battery charge
                <div class="unit-input">
                    <input
                        type="number"
                        min="0"
                        max="100"
                        bind:value={ev}
                    /><span>%</span>
                </div></label
            ><label
                >Water temperature
                <div class="unit-input">
                    <input
                        type="number"
                        min={simulation.environment?.unit === "F" ? 68 : 20}
                        max={simulation.environment?.unit === "F" ? 185 : 85}
                        step="0.1"
                        value={simulation.environment?.unit === "F"
                            ? (water * 9) / 5 + 32
                            : water}
                        oninput={(e) =>
                            (water =
                                simulation.environment?.unit === "F"
                                    ? ((+e.currentTarget.value - 32) * 5) / 9
                                    : +e.currentTarget.value)}
                    /><span>°{simulation.environment?.unit}</span>
                </div></label
            >
        </div>{/if}
</section>
<div class="lab-bottom">
    <section class="panel">
        <div class="panel-heading">
            <h3>How this simulation works</h3>
            <Icon name="info" size={18} />
        </div>
        <ol class="simulation-steps">
            <li>
                <span>01</span>
                <div>
                    <b>Conditions set the available PV</b>
                    <p>
                        Sunny, cloudy and rainy presets adjust sunlight. Night
                        always produces zero PV power.
                    </p>
                </div>
            </li>
            <li>
                <span>02</span>
                <div>
                    <b>The home comes first</b>
                    <p>
                        Rooftop panels supply the house. The battery
                        automatically covers any deficit within its reserve.
                    </p>
                </div>
            </li>
            <li>
                <span>03</span>
                <div>
                    <b>Surplus has a destination</b>
                    <p>
                        Remaining PV electricity can charge the EV, then the
                        home battery. Export happens only when enabled.
                    </p>
                </div>
            </li>
            <li>
                <span>04</span>
                <div>
                    <b>History follows simulated time</b>
                    <p>
                        Weather controls do not move the clock. Use the speed
                        selector or advance time to test schedules.
                    </p>
                </div>
            </li>
        </ol>
    </section>
    <section class="panel reset-panel">
        <Icon name="reset" size={28} />
        <h3>A clean start</h3>
        <p>
            Reset your own demo to the starting conditions and regenerate seven
            days of sample history.
        </p>
        <p class="tiny muted">
            Other visitors have separate sessions. No physical devices are
            connected.
        </p>
        <button class="danger-outline" onclick={onreset}>Reset my demo</button>
    </section>
</div>
