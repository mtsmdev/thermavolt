<script lang="ts">
    let {
        checked,
        label,
        onchange,
        disabled = false,
    }: {
        checked: boolean;
        label: string;
        onchange: (value: boolean) => void;
        disabled?: boolean;
    } = $props();
</script>

<button
    class="toggle"
    class:on={checked}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    {disabled}
    onclick={() => onchange(!checked)}><span></span></button
>
