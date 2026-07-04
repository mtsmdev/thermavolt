<script lang="ts">
    import { number, time } from "../lib/format";
    import type { Reading } from "../generated/energy_pb";
    let {
        readings,
        kind = "power",
        unit = "C",
    }: {
        readings: Reading[];
        kind?: "power" | "battery" | "water" | "home";
        unit?: string;
    } = $props();
    let hover = $state<number | null>(null);
    const data = $derived.by(() => {
        if (!readings.length) return [];
        const end = new Date(readings.at(-1)!.time).getTime();
        return readings.filter(
            (r) => end - new Date(r.time).getTime() <= 86400000,
        );
    });
    const series = $derived(
        kind === "home" ? [{ key: "home", color: "#00e978", name: "Home load" }] : kind === "battery"
            ? [
                  {
                      key: "batteryPercent",
                      color: "#54ceee",
                      name: "State of charge",
                  },
              ]
            : kind === "water"
              ? [
                    {
                        key: "waterTemperature",
                        color: "#ffae24",
                        name: "Water temperature",
                    },
                ]
              : [
                    { key: "solar", color: "#00ef7d", name: "PV" },
                    {
                        key: "batteryDischarge",
                        color: "#00d9f4",
                        name: "Battery output",
                    },
                    { key: "grid", color: "#ffcf00", name: "Grid" },
                ],
    );
    const value = (r: Reading, key: string) =>
        key === "waterTemperature" && unit === "F"
            ? (r.waterTemperature * 9) / 5 + 32
            : Number(r[key as keyof Reading]);
    const max = $derived(
        kind === "battery"
            ? 100
            : Math.max(
                  kind === "water" ? (unit === "F" ? 150 : 70) : 4,
                  ...data.flatMap((r) => series.map((s) => value(r, s.key))),
              ) * 1.1,
    );
    const firstTime = $derived(
        data.length ? new Date(data[0].time).getTime() : 0,
    );
    const duration = $derived(
        data.length
            ? Math.max(1, new Date(data.at(-1)!.time).getTime() - firstTime)
            : 1,
    );
    const x = (r: Reading) =>
        44 + ((new Date(r.time).getTime() - firstTime) / duration) * 636;
    const path = (key: string) =>
        data
            .map(
                (r, i) =>
                    (i ? "L" : "M") +
                    x(r).toFixed(1) +
                    "," +
                    (180 - (value(r, key) / max) * 150).toFixed(1),
            )
            .join(" ");
    const selected = $derived(
        hover !== null ? data[Math.min(data.length - 1, hover)] : null,
    );
</script>

<div class="chart-legend">
    {#each series as s}<span><i style:background={s.color}></i>{s.name}</span
        >{/each}<span class="chart-unit"
        >{kind === "battery" ? "%" : kind === "water" ? "°" + unit : "kW"}</span
    >
</div>
<div
    class="line-chart"
    onpointermove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const target =
            firstTime +
            (((e.clientX - box.left) / box.width - 0.062) / 0.896) * duration;
        hover = data.reduce(
            (best, r, i) =>
                Math.abs(new Date(r.time).getTime() - target) <
                Math.abs(new Date(data[best].time).getTime() - target)
                    ? i
                    : best,
            0,
        );
    }}
    onpointerleave={() => (hover = null)}
    role="img"
    aria-label={(kind === "power" || kind === "home")
        ? "Power history from saved simulation readings"
        : kind + " history"}
>
    <svg viewBox="0 0 710 215" preserveAspectRatio="none">
        <defs
            >{#each series as s}<linearGradient
                    id={"fill-" + kind + "-" + s.key}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                    ><stop
                        offset="0%"
                        stop-color={s.color}
                        stop-opacity=".22"
                    /><stop
                        offset="100%"
                        stop-color={s.color}
                        stop-opacity=".01"
                    /></linearGradient
                >{/each}</defs
        >
        {#each [0, 1, 2, 3, 4] as i}<line
                x1="44"
                x2="680"
                y1={180 - i * 37.5}
                y2={180 - i * 37.5}
                stroke="#193543"
                stroke-dasharray="3 5"
            /><text x="30" y={184 - i * 37.5} text-anchor="end"
                >{number((max * i) / 4, (kind === "power" || kind === "home") ? 1 : 0)}</text
            >{/each}
        {#each series as s}<path
                d={path(s.key) + " L680,180 L44,180 Z"}
                fill={"url(#fill-" + kind + "-" + s.key + ")"}
            /><path
                d={path(s.key)}
                fill="none"
                stroke={s.color}
                stroke-width="2.3"
                vector-effect="non-scaling-stroke"
            />{/each}
        {#each [0, 0.25, 0.5, 0.75, 1] as fraction}<text
                x={44 + fraction * 636}
                y="207"
                text-anchor="middle"
                >{data.length
                    ? time(
                          new Date(
                              firstTime + fraction * duration,
                          ).toISOString(),
                      )
                    : "00:00"}</text
            >{/each}
        {#if selected && hover !== null}<line
                x1={x(selected)}
                x2={x(selected)}
                y1="24"
                y2="180"
                stroke="#78918a"
                stroke-dasharray="4 4"
            />{/if}
    </svg>
    {#if selected}<div class="chart-tooltip">
            <b>{time(selected.time)}</b>{#each series as s}<span
                    style:color={s.color}
                    >{s.name}
                    {number(value(selected, s.key))}{(kind === "power" || kind === "home")
                        ? " kW"
                        : kind === "battery"
                          ? "%"
                          : "°" + unit}</span
                >{/each}
        </div>{/if}
</div>

