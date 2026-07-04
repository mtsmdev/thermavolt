<script lang="ts">
    import { untrack } from "svelte";
    import Icon from "./Icon.svelte";
    import DeviceArt from "./DeviceArt.svelte";
    import { minuteLabel, sourceLabel } from "../lib/format";
    import type { Snapshot, ScheduleBlock } from "../generated/energy_pb";
    let {
        simulation,
        onsave,
        busy,
    }: {
        simulation: Snapshot;
        onsave: (blocks: any[]) => Promise<boolean>;
        busy: boolean;
    } = $props();
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let draft = $state<any[]>(
        untrack(() =>
            simulation.schedules.map((b) => ({ ...b, days: [...b.days] })),
        ),
    );
    let dirty = $state(false),
        selectedDay = $state(3),
        week = $state(false),
        editing = $state(""),
        system = $state("ev"),
        source = $state("solar"),
        start = $state(660),
        end = $state(960),
        repeat = $state([0, 1, 2, 3, 4]),
        error = $state("");
    function edit(b: any) {
        editing = b.id;
        system = b.system;
        source = b.source;
        start = b.start;
        end = b.end;
        repeat = [...b.days];
        error = "";
    }
    function newBlock() {
        editing = "";
        system = "ev";
        source = "solar";
        start = 660;
        end = 960;
        repeat = [selectedDay];
        error = "";
    }
    function apply() {
        error = "";
        if (end <= start || !repeat.length) {
            error = "Choose an end after the start and at least one day.";
            return;
        }
        if (
            draft.some(
                (b) =>
                    b.id !== editing &&
                    b.enabled &&
                    b.system === system &&
                    b.days.some((d: number) => repeat.includes(d)) &&
                    Math.max(start, b.start) < Math.min(end, b.end),
            )
        ) {
            error =
                "This block overlaps an existing rule. Choose an unused time or edit that rule.";
            return;
        }
        const block = {
            id: editing || crypto.randomUUID(),
            system,
            source,
            start,
            end,
            days: [...repeat],
            enabled: true,
        };
        draft = editing
            ? draft.map((b) => (b.id === editing ? block : b))
            : [...draft, block];
        editing = block.id;
        dirty = true;
    }
    async function save() {
        if (await onsave(draft)) {
            dirty = false;
        }
    }
    const visibleDays = $derived(week ? [0, 1, 2, 3, 4, 5, 6] : [selectedDay]);
    function offPeriods(device: string, day: number) {
        const blocks = draft
            .filter(
                (b) => b.system === device && b.enabled && b.days.includes(day),
            )
            .sort((a, b) => a.start - b.start);
        const gaps: { start: number; end: number }[] = [];
        let cursor = 0;
        for (const block of blocks) {
            if (block.start > cursor)
                gaps.push({ start: cursor, end: block.start });
            cursor = Math.max(cursor, block.end);
        }
        if (cursor < 1440) gaps.push({ start: cursor, end: 1440 });
        return gaps;
    }
</script>

<div class="page-toolbar">
    <div>
        <span class="pill"
            ><Icon name="shield" size={14} />Home battery stays automatic</span
        >
        <p class="muted">
            Set source windows for EV charging and water backup. Unscheduled
            periods are off.
        </p>
    </div>
    <button class="primary" onclick={save} disabled={busy || !dirty}
        ><Icon name="save" size={16} />{dirty
            ? "Save schedule"
            : "Schedule saved"}</button
    >
</div>
<div class="scheduler-layout">
    <section class="panel timeline-panel">
        <div class="schedule-toolbar">
            <div class="segmented">
                <button class:active={!week} onclick={() => (week = false)}
                    >Day</button
                ><button class:active={week} onclick={() => (week = true)}
                    >Week</button
                >
            </div>
            <div class="day-picker">
                {#each days as day, i}<button
                        class:active={selectedDay === i}
                        onclick={() => {
                            selectedDay = i;
                            week = false;
                        }}>{day}</button
                    >{/each}
            </div>
            <button
                class="icon-button"
                aria-label="Add time block"
                onclick={newBlock}><Icon name="plus" /></button
            >
        </div>
        <div class="timeline-scroll">
            <div class="timeline-axis">
                <span></span>
                <div>
                    {#each [0, 3, 6, 9, 12, 15, 18, 21, 24] as hour}<span
                            style:left={(hour / 24) * 100 + "%"}
                            >{String(hour).padStart(2, "0")}</span
                        >{/each}
                </div>
            </div>
            {#each visibleDays as day}
                {#if week}<p class="week-day-label">{days[day]}</p>{/if}
                <div class="timeline-row">
                    <div class="timeline-label">
                        <DeviceArt device="home" /><b>Home</b>
                    </div>
                    <div class="timeline-track">
                        <div class="auto-timeline">
                            <Icon name="shield" size={19} />Automatic · PV +
                            home battery
                        </div>
                    </div>
                </div>
                {#each ["water", "ev"] as device}
                    <div class="timeline-row">
                        <div class="timeline-label">
                            <DeviceArt
                                device={device === "ev" ? "ev" : "water"}
                            /><b
                                >{device === "ev"
                                    ? "EV charging"
                                    : "Water heating"}</b
                            >
                        </div>
                        <div class="timeline-track">
                            {#each offPeriods(device, day) as gap}
                                <div
                                    class="off-segment"
                                    style:left={(gap.start / 1440) * 100 + "%"}
                                    style:width={((gap.end - gap.start) /
                                        1440) *
                                        100 +
                                        "%"}
                                    title={"Off " +
                                        minuteLabel(gap.start) +
                                        "–" +
                                        minuteLabel(gap.end)}
                                >
                                    <b>Off</b><small
                                        >{minuteLabel(gap.start)} – {minuteLabel(
                                            gap.end,
                                        )}</small
                                    >
                                </div>
                            {/each}
                            {#each draft.filter((b) => b.system === device && b.enabled && b.days.includes(day)) as block}<button
                                    class="time-block {block.source}"
                                    class:selected={editing === block.id}
                                    style:left={(block.start / 1440) * 100 +
                                        "%"}
                                    style:width={((block.end - block.start) /
                                        1440) *
                                        100 +
                                        "%"}
                                    title={sourceLabel(block.source, device) +
                                        " " +
                                        minuteLabel(block.start) +
                                        "–" +
                                        minuteLabel(block.end)}
                                    onclick={() => edit(block)}
                                    ><strong
                                        >{sourceLabel(
                                            block.source,
                                            device,
                                        )}</strong
                                    ><small
                                        >{minuteLabel(block.start)} – {minuteLabel(
                                            block.end,
                                        )}</small
                                    ></button
                                >{/each}
                        </div>
                    </div>
                {/each}
            {/each}
        </div>
        <div class="timeline-footer">
            <div class="chart-legend">
                <span><i class="solar-dot"></i>PV / solar thermal</span><span
                    ><i class="grid-dot"></i>Grid</span
                ><span><i class="off-dot"></i>Off</span>
            </div>
            <small>Click a block to edit</small>
        </div>
        <div class="inline-note">
            <Icon name="info" size={17} /><span
                >Water uses solar thermal heat. Grid mode powers its electric
                backup. The home battery never supplies either device.</span
            >
        </div>
    </section>
    <section class="panel block-editor">
        <div class="panel-heading">
            <h3>{editing ? "Edit time block" : "New time block"}</h3>
            <Icon name="schedule" size={18} />
        </div>
        <label
            >System<select bind:value={system}
                ><option value="ev">EV charging</option><option value="water"
                    >Water heating</option
                ></select
            ></label
        >
        <span class="field-label" id="source-label">Power source</span>
        <div
            class="segmented source-picker"
            role="group"
            aria-labelledby="source-label"
        >
            {#each ["solar", "grid", "off"] as s}<button
                    class:active={source === s}
                    onclick={() => (source = s)}
                    ><Icon
                        name={s === "solar"
                            ? "sun"
                            : s === "grid"
                              ? "grid"
                              : "power"}
                        size={16}
                    />{sourceLabel(s, system)}</button
                >{/each}
        </div>
        <div class="form-pair">
            <label
                >Start time<select bind:value={start}
                    >{#each Array.from({ length: 48 }, (_, i) => i * 30) as m}<option
                            value={m}>{minuteLabel(m)}</option
                        >{/each}</select
                ></label
            ><label
                >End time<select bind:value={end}
                    >{#each Array.from({ length: 48 }, (_, i) => (i + 1) * 30) as m}<option
                            value={m}>{minuteLabel(m)}</option
                        >{/each}</select
                ></label
            >
        </div>
        <span class="field-label" id="repeat-label">Repeat on</span>
        <div class="repeat-days" role="group" aria-labelledby="repeat-label">
            {#each days as d, i}<button
                    class:active={repeat.includes(i)}
                    aria-pressed={repeat.includes(i)}
                    onclick={() =>
                        (repeat = repeat.includes(i)
                            ? repeat.filter((n) => n !== i)
                            : [...repeat, i])}>{d.slice(0, 2)}</button
                >{/each}
        </div>
        <div class="repeat-shortcuts">
            <button onclick={() => (repeat = [0, 1, 2, 3, 4])}>Weekdays</button
            ><button onclick={() => (repeat = [5, 6])}>Weekend</button><button
                onclick={() => (repeat = [0, 1, 2, 3, 4, 5, 6])}
                >Every day</button
            >
        </div>
        {#if error}<p class="form-error" role="alert">{error}</p>{/if}
        <button class="primary full" onclick={apply}
            ><Icon name="check" size={16} />Apply block</button
        >
        {#if editing}<button
                class="danger-text full"
                onclick={() => {
                    draft = draft.filter((b) => b.id !== editing);
                    editing = "";
                    dirty = true;
                }}><Icon name="trash" size={16} />Delete block</button
            >{/if}
        <p class="tiny muted">
            Apply your edits, then save the schedule. Set a device to Schedule
            in Control Center to activate its rules.
        </p>
    </section>
</div>
<section class="panel schedule-summary">
    <div class="panel-heading">
        <h3>Active automation</h3>
        <span class="pill green">Always watching</span>
    </div>
    <div class="automation-cards">
        <div>
            <Icon name="battery" /><span
                ><b>Automatic home backup</b><small
                    >PV shortfall → home battery, within reserve.</small
                ></span
            >
        </div>
        <div>
            <Icon name="ev" /><span
                ><b>EV charge limit · {simulation.configuration?.evTarget}%</b
                ><small
                    >Charging stops automatically at the configured limit.</small
                ></span
            >
        </div>
        <div>
            <Icon name="clock" /><span
                ><b>Simulation clock</b><small
                    >Rules follow simulated time, not your computer clock.</small
                ></span
            >
        </div>
    </div>
</section>
