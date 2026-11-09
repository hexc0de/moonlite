<script lang="ts">
  // Filament type from slicer metadata, with the slicer's filament color as a dot.
  let { type, colors }: { type?: string; colors?: string[] } = $props();

  const HEX = /^#[0-9a-f]{3,8}$/i;
  // Multi-material files list types as "PLA;PETG".
  let label = $derived(
    (type ?? '')
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t, i, all) => all.indexOf(t) === i)
      .join(', '),
  );
  let dots = $derived((colors ?? []).filter((c) => HEX.test(c)).slice(0, 4));
</script>

{#if label}
  <span class="material" title={type}>
    {#each dots as color}
      <span class="dot" style:background={color}></span>
    {/each}
    {label}
  </span>
{:else}
  <span class="none">—</span>
{/if}

<style>
  .material {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 600;
    color: #e5e7eb;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 4px;
    padding: 2px 7px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }
  .none {
    color: #6b7280;
  }
</style>
