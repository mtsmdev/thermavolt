<script lang="ts">
    import { onMount } from "svelte";
    import { Link } from "@inertiajs/svelte";
    import { simulationRuntime } from "../lib/simulation";
    import { simulationSpeeds } from "../lib/simulation-runtime";
    import { time, clockDate } from "../lib/format";
    import type { Snapshot } from "../generated/energy_pb";
    import Icon from "../components/Icon.svelte";

    import Dashboard from "../components/Dashboard.svelte";
    import ControlCenter from "../components/ControlCenter.svelte";

    import Scheduler from "../components/Scheduler.svelte";
    import Analytics from "../components/Analytics.svelte";
    import SimulationLab from "../components/SimulationLab.svelte";
    let { token = "", view = "dashboard" }: { token?: string; view?: string } =
        $props();
    const runtimeState = simulationRuntime.state;
    const simulation = $derived($runtimeState.simulation),
        busy = $derived($runtimeState.busy),
        playing = $derived($runtimeState.playing),
        speed = $derived($runtimeState.speed),
        connected = $derived($runtimeState.connected),
        error = $derived($runtimeState.error),
        toast = $derived($runtimeState.toast);
    let weatherOpen = $state(false),
        mobileNav = $state(false),
        resetOpen = $state(false);
    const client = simulationRuntime.client;
    let resetGeneration = $state(0);
    const titles: Record<string, { title: string; subtitle: string }> = {
        dashboard: {
            title: "Energy overview",
            subtitle: "Every watt, working together.",
        },
        "control-center": {
            title: "Control Center",
            subtitle: "Manage each system independently",
        },
        "smart-scheduler": {
            title: "Smart Scheduler",
            subtitle:
                "Choose when each system uses PV, solar heat, grid, or stays off",
        },
        analytics: {
            title: "Analytics",
            subtitle: "Energy history, savings and environmental impact",
        },
        "simulation-lab": {
            title: "Simulation Lab",
            subtitle: "Explore the possibilities.",
        },
    };
    const nav = [
        { id: "dashboard", label: "Dashboard", icon: "dashboard", url: "/" },
        {
            id: "control-center",
            label: "Control Center",
            icon: "controls",
            url: "/control-center",
        },
        {
            id: "smart-scheduler",
            label: "Smart Scheduler",
            icon: "schedule",
            url: "/smart-scheduler",
        },
        {
            id: "analytics",
            label: "Analytics",
            icon: "analytics",
            url: "/analytics",
        },
    ];
    const p = $derived(simulation?.telemetry),
        c = $derived(simulation?.configuration),
        env = $derived(simulation?.environment),
        ctrl = $derived(simulation?.controls);
    const today = $derived(
        simulation?.daily.find(
            (d) => d.date === simulation?.clock.slice(0, 10),
        ),
    );
    function showModal(node: HTMLDialogElement) {
        node.showModal();
    }
    const run = (task: () => Promise<Snapshot>, message = "") =>
        simulationRuntime.run(task, message);
    const setEnvironment = (patch: any) =>
        run(
            () => client.setEnvironment({ token, ...patch }),
            "Simulation conditions updated",
        );
    const setControls = (patch: any) =>
        run(() => client.setControls({ token, ...patch }), "Controls saved");
    const configure = (patch: any) =>
        run(
            () => client.configure({ token, ...patch }),
            "Simulation inputs saved",
        );
    const resetEv = () =>
        run(
            () =>
                client.configure({
                    token: simulationRuntime.token,
                    evPercent: 10,
                }),
            "EV battery reset to 10% · ready for another charging test",
        );
    function advance(seconds: number) {
        simulationRuntime.setPlaying(false);
        run(
            () => client.advanceTime({ token, seconds }),
            "Advanced simulated time",
        );
    }
    function weatherIcon(weather?: string) {
        return weather === "sunny"
            ? "sun"
            : weather === "rainy"
              ? "rain"
              : "cloud";
    }
    onMount(() => {
        void simulationRuntime.connect(token);
    });
</script>

<svelte:head
    ><title>{titles[view]?.title || "ThermaVoltFlow"} · ThermaVoltFlow</title
    ></svelte:head
>
<svelte:window
    onkeydown={(e) => {
        if (e.key === "Escape") {
            weatherOpen = false;
            resetOpen = false;
            mobileNav = false;
        }
    }}
    onpointerdown={(e) => {
        if (weatherOpen && !(e.target as Element).closest(".weather-select"))
            weatherOpen = false;
    }}
/>

{#snippet environmentPicker()}
    <div class="environment-controls">
        <div class="segmented light-switch">
            {#each ["day", "night"] as lighting}<button
                    class:active={env?.lighting === lighting}
                    aria-pressed={env?.lighting === lighting}
                    disabled={busy || !simulation}
                    onclick={() => setEnvironment({ lighting })}
                    ><Icon
                        name={lighting === "day" ? "sun" : "moon"}
                        size={22}
                    />{lighting === "day" ? "Day" : "Night"}</button
                >{/each}
        </div>
        <div class="weather-select">
            <button
                class="weather-trigger"
                aria-haspopup="menu"
                aria-expanded={weatherOpen}
                disabled={busy || !simulation}
                onclick={() => (weatherOpen = !weatherOpen)}
                ><Icon name={weatherIcon(env?.weather)} size={29} /><span
                    >{env?.weather
                        ? env.weather[0].toUpperCase() + env.weather.slice(1)
                        : "Cloudy"}</span
                ><Icon name="chevron" size={17} /></button
            >
            {#if weatherOpen}<div class="weather-menu" role="menu">
                    <small>Simulation weather</small
                    >{#each ["sunny", "cloudy", "rainy"] as weather}<button
                            role="menuitemradio"
                            aria-checked={env?.weather === weather}
                            disabled={busy}
                            onclick={() => {
                                weatherOpen = false;
                                setEnvironment({ weather });
                            }}
                            ><Icon
                                name={weatherIcon(weather)}
                                size={27}
                            />{weather[0].toUpperCase() +
                                weather.slice(
                                    1,
                                )}{#if env?.weather === weather}<Icon
                                    name="check"
                                    size={20}
                                />{/if}</button
                        >{/each}
                </div>{/if}
        </div>
        <div class="segmented temperature-switch">
            {#each ["C", "F"] as unit}<button
                    class:active={env?.unit === unit}
                    aria-label={unit === "C" ? "Celsius" : "Fahrenheit"}
                    aria-pressed={env?.unit === unit}
                    disabled={busy || !simulation}
                    onclick={() => setEnvironment({ unit })}>°{unit}</button
                >{/each}
        </div>
    </div>
{/snippet}

<div class="app-shell">
    {#if mobileNav}<button
            class="nav-scrim"
            aria-label="Close navigation"
            onclick={() => (mobileNav = false)}
        ></button>{/if}
    <aside class="sidebar" class:mobile-open={mobileNav}>
        <Link href="/" class="brand">Therma<span>VoltFlow</span></Link>
        <nav aria-label="Main navigation">
            {#each nav as item}<Link
                    href={item.url}
                    class={"nav-item " + (view === item.id ? "selected" : "")}
                    onclick={() => (mobileNav = false)}
                    ><Icon
                        name={item.id === "dashboard" ? "home" : item.icon}
                        size={26}
                    /><span>{item.label}</span></Link
                >{/each}
        </nav>
        <div class="sidebar-bottom">
            <Link
                href="/simulation-lab"
                class={"nav-item " +
                    (view === "simulation-lab" ? "selected" : "")}
                onclick={() => (mobileNav = false)}
                ><Icon name="lab" size={23} /><span>Simulation Lab</span></Link
            ><span class="sidebar-connection"
                ><i class:offline={!connected}></i>{connected
                    ? "Simulation online"
                    : "Connecting…"}</span
            >
        </div>
    </aside>
    <main>
        <div
            class="page-content"
            class:dashboard-page={view === "dashboard"}
            class:analytics-page={view === "analytics"}
            class:scheduler-page={view === "smart-scheduler"}
            class:control-page={view === "control-center"}
        >
            <header class="page-header">
                <div class="page-title">
                    <div>
                        <button
                            class="mobile-menu icon-button"
                            aria-label="Open navigation"
                            onclick={() => (mobileNav = !mobileNav)}
                            ><Icon name="menu" /></button
                        >
                        <h1>{titles[view]?.title}</h1>
                        <span class="demo-badge">DEMO DATA</span>
                    </div>
                    {#if view !== "dashboard"}<p>
                            {titles[view]?.subtitle}
                        </p>{/if}
                </div>
                {#if view === "dashboard"}{@render environmentPicker()}{:else if view === "control-center"}<span
                        class="systems-online"><i></i>All systems online</span
                    >{/if}
            </header>
            {#if error}<div class="error-banner" role="alert">
                    <Icon name="alert" size={19} /><span>{error}</span><button
                        onclick={() => run(() => client.getState({ token }))}
                        >Reconnect</button
                    >
                </div>{/if}
            {#if simulation && p && c && env && ctrl}
                {#if view === "dashboard"}
                    <Dashboard
                        {simulation}
                        {busy}
                        {speed}
                        {playing}
                        oncontrols={setControls}
                        onresetEv={resetEv}
                    />
                {:else if view === "control-center"}
                    <ControlCenter
                        {simulation}
                        {busy}
                        oncontrols={setControls}
                        onconfigure={configure}
                        onresetEv={resetEv}
                    />
                {:else if view === "smart-scheduler"}
                    {#key resetGeneration}<Scheduler
                            {simulation}
                            {busy}
                            onsave={(blocks) =>
                                run(
                                    () =>
                                        client.saveSchedule({ token, blocks }),
                                    "Schedule saved",
                                )}
                        />{/key}
                {:else if view === "analytics"}
                    <Analytics {simulation} />
                {:else if view === "simulation-lab"}
                    {#key resetGeneration}<SimulationLab
                            {simulation}
                            {busy}
                            onconfigure={configure}
                            onresetEv={resetEv}
                            onpreset={(weather, lighting) =>
                                setEnvironment({ weather, lighting })}
                            onreset={() => {
                                simulationRuntime.setPlaying(false);
                                resetOpen = true;
                            }}
                        />{/key}
                {/if}
                <div class="simulation-tools">
                    <div class="simulation-clock">
                        <span
                            ><Icon name="clock" size={16} />{clockDate(
                                simulation.clock,
                            )}<b>{time(simulation.clock)}</b><small
                                >simulation time</small
                            ></span
                        >
                        <div>
                            <button
                                class:running={playing}
                                disabled={busy && !playing}
                                onclick={() =>
                                    simulationRuntime.setPlaying(!playing)}
                                ><Icon
                                    name={playing ? "pause" : "play"}
                                    size={15}
                                />{playing ? "Pause" : "Run simulation"}</button
                            ><select
                                aria-label="Simulation speed"
                                value={speed}
                                onchange={(e) =>
                                    simulationRuntime.setSpeed(
                                        +e.currentTarget.value,
                                    )}
                                >{#each simulationSpeeds as multiplier}<option
                                        value={multiplier}>{multiplier}×</option
                                    >{/each}</select
                            ><button
                                disabled={busy}
                                onclick={() => advance(3600)}>+1 hour</button
                            ><button
                                class="icon-button"
                                aria-label="Reset demo"
                                onclick={() => {
                                    simulationRuntime.setPlaying(false);
                                    resetOpen = true;
                                }}><Icon name="reset" size={16} /></button
                            >
                        </div>
                    </div>
                    {#if view !== "dashboard"}{@render environmentPicker()}{/if}
                </div>
                <footer class="page-footer">
                    <span
                        ><Icon name="info" size={14} />Educational simulation ·
                        No physical devices connected</span
                    ><span
                        ><i
                            class="connection-dot"
                            class:disconnected={!connected}
                        ></i>gRPC {connected
                            ? "connected"
                            : "disconnected"}</span
                    >
                </footer>
            {:else}
                <div class="loading-state">
                    <span class="loading-logo"
                        ><Icon name="zap" size={38} /></span
                    >
                    <h2>Connecting your energy ecosystem</h2>
                    <p>Loading your private simulation…</p>
                    <div class="loading-line"></div>
                </div>
            {/if}
        </div>
    </main>
</div>
{#if toast}<div class="toast" role="status">
        <Icon name="check" size={18} />{toast}
    </div>{/if}
{#if resetOpen}<dialog
        class="modal"
        use:showModal
        onclose={() => (resetOpen = false)}
        aria-labelledby="reset-title"
    >
        <button
            class="modal-close icon-button"
            aria-label="Close reset dialog"
            onclick={() => (resetOpen = false)}><Icon name="close" /></button
        ><span class="modal-icon"><Icon name="reset" size={27} /></span>
        <h2 id="reset-title">Start with a clean slate?</h2>
        <p>
            This resets your simulation inputs, schedules and readings, then
            generates a fresh week of demo history. Other sessions are
            unaffected.
        </p>
        <div class="button-row">
            <button class="secondary" onclick={() => (resetOpen = false)}
                >Keep exploring</button
            ><button
                class="primary"
                disabled={busy}
                onclick={async () => {
                    if (
                        await run(
                            () => client.resetSimulation({ token }),
                            "Your demo has been reset",
                        )
                    ) {
                        resetOpen = false;
                        resetGeneration++;
                    }
                }}>Reset my demo</button
            >
        </div>
    </dialog>{/if}
