<script lang="ts">
  // How many times a file was printed (completed jobs), failed/cancelled ones in red.
  import Icon from './Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import { printCounts } from '../printCounts.svelte';

  let { filename }: { filename: string } = $props();

  let count = $derived(printCounts.get(filename));
</script>

{#if count}
  <span
    class="print-count"
    class:zero={count.completed === 0}
    title={i18n.t('print_count_hint', { ok: count.completed, failed: count.failed })}
  >
    <span class="ok"><Icon name="check" size="1em" />{count.completed}</span>
    {#if count.failed > 0}
      <span class="failed"><Icon name="close" size="1em" />{count.failed}</span>
    {/if}
  </span>
{:else}
  <span class="none">…</span>
{/if}

<style>
  .print-count {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    font-family: monospace;
    font-size: 0.82rem;
  }
  .ok,
  .failed {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .ok {
    color: #22c55e;
    font-weight: 600;
  }
  .zero .ok {
    color: #6b7280;
    font-weight: 400;
  }
  .failed {
    color: #ef4444;
  }
  .none {
    color: #6b7280;
  }
</style>
