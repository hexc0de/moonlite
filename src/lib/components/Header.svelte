<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n, LOCALE_NAMES, type Locale } from '../i18n.svelte';

  let isEditingHost = $state(false);
  let inputHost = $state(moonraker.host);
  let inputPort = $state(moonraker.port);
  let isLangOpen = $state(false);

  function saveHost() {
    // An empty host returns to automatic detection (same origin in production).
    moonraker.setHost(inputHost.trim(), inputPort.trim());
    isEditingHost = false;
  }

  function startEditingHost() {
    inputHost = moonraker.autoHost ? '' : moonraker.host;
    inputPort = moonraker.autoHost ? '7125' : moonraker.port;
    isEditingHost = true;
  }

  // No confirmation: an emergency stop must act on the first click.
  function handleEmergencyStop() {
    moonraker.emergencyStop();
  }

  $effect(() => {
    if (!isLangOpen) return;
    const close = () => { isLangOpen = false; };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  });

  const locales: Locale[] = ['en', 'ru', 'pl', 'be'];
</script>

<header class="header">
  <div class="left-status">
    <div class="connection-status">
      {#if moonraker.connected}
        <span class="badge badge-success">
          <span class="dot dot-online"></span>
          {i18n.t('connected')} ({moonraker.state.klippy})
        </span>
      {:else if moonraker.connecting}
        <span class="badge badge-warning">
          <span class="dot dot-connecting"></span>
          {i18n.t('connecting')}
        </span>
      {:else}
        <span class="badge badge-danger">
          <span class="dot dot-offline"></span>
          {i18n.t('disconnected')}
        </span>
      {/if}

      {#if !isEditingHost}
        <button class="btn-text" onclick={startEditingHost} title={i18n.t('host_edit_hint')}>
          {moonraker.address}{moonraker.autoHost ? ' (auto)' : ''} <Icon name="edit" />
        </button>
      {:else}
        <div class="host-editor">
          <input type="text" bind:value={inputHost} placeholder={i18n.t('host_auto_placeholder')} class="input-mini" onkeydown={(e) => e.key === 'Enter' && saveHost()} />
          <input type="text" bind:value={inputPort} placeholder={i18n.t('port_placeholder')} class="input-mini port" onkeydown={(e) => e.key === 'Enter' && saveHost()} />
          <button class="btn btn-primary btn-xs" onclick={saveHost}>OK</button>
          <button class="btn btn-secondary btn-xs" onclick={() => isEditingHost = false}><Icon name="close" /></button>
        </div>
      {/if}
    </div>
  </div>

  <div class="right-actions">
    <!-- SVG Globe Language Dropdown -->
    <div class="lang-dropdown-container">
      <button 
        class="lang-trigger" 
        class:open={isLangOpen}
        onclick={(e) => { e.stopPropagation(); isLangOpen = !isLangOpen; }}
        title={i18n.t('hint_language')}
      >
        <Icon name="globe" size={16} />
        <span class="lang-cur">{i18n.locale.toUpperCase()}</span>
        <span class="chevron"><Icon name="chevron-down" /></span>
      </button>

      {#if isLangOpen}
        <div class="lang-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.key === 'Escape' && (isLangOpen = false)}>
          {#each locales as loc}
            <button 
              class="lang-item" 
              class:selected={i18n.locale === loc}
              onclick={() => { i18n.setLocale(loc); isLangOpen = false; }}
            >
              <span>{LOCALE_NAMES[loc]}</span>
              {#if i18n.locale === loc}
                <span class="check"><Icon name="check" /></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Safety Lock Switch -->
    <label class="safety-toggle" title={i18n.t('hint_safety_lock')}>
      <input type="checkbox" bind:checked={moonraker.safetyLock} />
      <span class="safety-label">
        {#if moonraker.safetyLock}
          <Icon name="lock" /> {i18n.t('safety_on')}
        {:else}
          <Icon name="lock-open" /> {i18n.t('safety_off')}
        {/if}
      </span>
    </label>

    <button class="btn btn-danger" onclick={handleEmergencyStop} title={i18n.t('hint_estop')}>
      <Icon name="emergency" /> {i18n.t('emergency_stop')}
    </button>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    background: #18191c;
    border-bottom: 1px solid #282a30;
    flex-wrap: wrap;
    gap: 12px;
  }

  .left-status {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot-online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .dot-connecting { background: #eab308; animation: pulse 1s infinite; }
  .dot-offline { background: #ef4444; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  .badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
  .badge-warning { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
  .badge-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

  .btn-text {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .btn-text:hover {
    color: #f3f4f6;
    background: #23252b;
  }

  .host-editor {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .input-mini {
    background: #23252b;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    width: 120px;
  }
  .input-mini.port {
    width: 60px;
  }

  .right-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .lang-dropdown-container {
    position: relative;
  }

  .lang-trigger {
    display: flex;
    align-items: center;
    gap: 7px;
    background: #23252b;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 6px 11px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }
  .lang-trigger:hover, .lang-trigger.open {
    background: #2a2d34;
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .lang-cur {
    font-weight: 600;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .chevron {
    font-size: 0.65rem;
    color: #9ca3af;
    transition: transform 0.15s ease;
  }
  .lang-trigger.open .chevron {
    transform: rotate(180deg);
  }

  .lang-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 4px;
    min-width: 175px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lang-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    color: #d1d5db;
    padding: 8px 12px;
    border-radius: 5px;
    font-size: 0.82rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.1s ease;
  }
  .lang-item:hover {
    background: #23252b;
    color: #ffffff;
  }
  .lang-item.selected {
    background: rgba(2, 132, 199, 0.15);
    color: #38bdf8;
    font-weight: 600;
  }
  .check {
    color: #38bdf8;
    font-weight: 700;
  }

  .safety-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    background: #23252b;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #374151;
    font-size: 0.8rem;
    color: #f3f4f6;
    user-select: none;
  }

  .safety-toggle input {
    cursor: pointer;
    accent-color: #38bdf8;
  }

  .btn {
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .btn-xs {
    padding: 3px 8px;
    font-size: 0.75rem;
  }
  .btn-primary { background: #0284c7; color: white; }
  .btn-primary:hover { background: #0369a1; }
  .btn-secondary { background: #374151; color: white; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-danger:hover { background: #b91c1c; }
</style>
