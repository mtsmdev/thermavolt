<script lang="ts">
    let { values, color = "#00ef7d" }: { values: number[]; color?: string } =
        $props();
    const id = $props.id();
    const points = $derived.by(() => {
        const max = Math.max(1, ...values);
        return values
            .map(
                (value, index) =>
                    `${index ? "L" : "M"}${(index / Math.max(1, values.length - 1)) * 240},${39 - (value / max) * 33}`,
            )
            .join(" ");
    });
</script>

<svg
    class="kpi-spark"
    viewBox="0 0 240 44"
    preserveAspectRatio="none"
    aria-hidden="true"
>
    <defs
        ><linearGradient {id} x1="0" y1="0" x2="0" y2="1"
            ><stop offset="0%" stop-color={color} stop-opacity=".3" /><stop
                offset="100%"
                stop-color={color}
                stop-opacity="0"
            /></linearGradient
        ></defs
    >
    {#if values.length > 1}<path
            d={points + " L240 44 L0 44 Z"}
            fill={`url(#${id})`}
        /><path
            d={points}
            fill="none"
            stroke={color}
            stroke-width="1.6"
            vector-effect="non-scaling-stroke"
        />{:else if values.length === 1}<circle
            cx="0"
            cy={39 - (values[0] / Math.max(1, values[0])) * 33}
            r="2"
            fill={color}
        />{/if}
</svg>
