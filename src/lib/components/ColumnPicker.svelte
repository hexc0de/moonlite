<script lang="ts">
  import Icon from './Icon.svelte';
  import { i18n } from '../i18n.svelte';
  import type { ColumnSet } from '../columns.svelte';

  let { columns }: { columns: ColumnSet } = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="column-picker" bind:this={root}>
  <button
    class="picker-btn"
    class:active={open}
    onclick={() => (open = !open)}
    title={i18n.t('columns_btn')}
    aria-haspopup="true"
    aria-expanded={open}
  >
    <Icon name="columns" />
    <span class="picker-label">{i18n.t('columns_btn')}</span>
  </button>

  {#if open}
    <div class="picker-panel" role="menu">
      {#each columns.defs as col (col.id)}
        <label class="picker-row">
          <input type="checkbox" checked={columns.has(col.id)} onchange={() => columns.toggle(col.id)} />
          <span>{i18n.t(col.label)}</span>
        </label>
      {/each}
      <button class="picker-reset" onclick={() => columns.reset()}>{i18n.t('columns_reset')}</button>
    </div>
  {/if}
</div>

<style>
  .column-picker {
    position: relative;
  }

  .picker-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    background: #151619;
    border: 1px solid #282a30;
    color: #9ca3af;
    font-size: 0.78rem;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .picker-btn:hover,
  .picker-btn.active {
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .picker-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 50;
    min-width: 200px;
    background: #1e2025;
    border: 1px solid #374151;
    border-radius: 8px;
    padding: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
  }

  .picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 0.82rem;
    color: #e5e7eb;
    cursor: pointer;
    white-space: nowrap;
  }
  .picker-row:hover {
    background: #2b2e36;
  }
  .picker-row input {
    accent-color: #0284c7;
    margin: 0;
  }

  .picker-reset {
    margin-top: 4px;
    border: none;
    border-top: 1px solid #282a30;
    background: none;
    color: #9ca3af;
    font-size: 0.75rem;
    padding: 8px 8px 4px;
    text-align: left;
    cursor: pointer;
  }
  .picker-reset:hover {
    color: #38bdf8;
  }

  @media (max-width: 600px) {
    .picker-label {
      display: none;
    }
  }
</style>
