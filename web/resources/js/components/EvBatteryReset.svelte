<script lang="ts">
    import Icon from "./Icon.svelte";
    let { busy, onreset }: { busy: boolean; onreset: () => Promise<boolean> } =
        $props();
</script>

<button
    class="ev-reset"
    disabled={busy}
    onclick={onreset}
    title="Set the simulated EV battery to 10%. Keeps its selected source, schedule and saved history."
>
    <Icon name="reset" size={15} />Reset EV to 10%
</button>
