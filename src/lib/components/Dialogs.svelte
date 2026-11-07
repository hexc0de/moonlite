<script lang="ts">
  import { ui } from '../ui.svelte';
  import { i18n } from '../i18n.svelte';

  let okButton = $state<HTMLButtonElement | null>(null);

  $effect(() => {
    if (ui.dialog && okButton) okButton.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (!ui.dialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      ui.dialog.resolve(false);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if ui.dialog}
  {@const dialog = ui.dialog}
  <div class="backdrop" role="presentation" onclick={() => dialog.resolve(false)}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dialog-message"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <p id="dialog-message" class="message">{dialog.message}</p>
      <div class="actions">
        <button class="btn btn-cancel" onclick={() => dialog.resolve(false)}>{i18n.t('dialog_cancel')}</button>
        <button
          class="btn btn-ok"
          class:danger={dialog.danger}
          bind:this={okButton}
          onclick={() => dialog.resolve(true)}
        >
          {i18n.t('dialog_ok')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if ui.toasts.length > 0}
  <div class="toasts" role="status" aria-live="polite">
    {#each ui.toasts as toast (toast.id)}
      <button class="toast {toast.type}" onclick={() => ui.dismiss(toast.id)} title={i18n.t('dismiss')}>
        {toast.text}
      </button>
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 16px;
  }

  .dialog {
    background: #1e2025;
    border: 1px solid #2f323a;
    border-radius: 10px;
    padding: 18px 20px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    outline: none;
  }

  .message {
    margin: 0 0 18px;
    color: #e5e7eb;
    font-size: 0.92rem;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-cancel {
    background: #2a2d34;
    color: #d1d5db;
    border-color: #3a3d46;
  }

  .btn-ok {
    background: #0284c7;
    color: #fff;
  }

  .btn-ok.danger {
    background: #dc2626;
  }

  .toasts {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 110;
    max-width: min(380px, calc(100vw - 32px));
  }

  .toast {
    text-align: left;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #f3f4f6;
    background: #23252b;
    border: 1px solid #3a3d46;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .toast.error {
    background: #450a0a;
    border-color: #991b1b;
    color: #fecaca;
  }

  .toast.success {
    background: #052e16;
    border-color: #166534;
    color: #bbf7d0;
  }
</style>
