<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  let commandInput = $state('');
  let autoScroll = $state(true);
  let logContainer = $state<HTMLDivElement | null>(null);

  // Command history buffer (up to 30 items)
  let history: string[] = [];
  let historyIndex = -1;

  $effect(() => {
    // When new logs arrive and autoScroll is on, scroll smoothly to bottom
    if (autoScroll && logContainer && moonraker.logs.length) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });

  function sendCommand() {
    const cmd = commandInput.trim();
    if (!cmd) return;

    // Add to history
    history.push(cmd);
    if (history.length > 30) history.shift();
    historyIndex = history.length;

    // Errors are shown in the console itself (Klipper echoes them as "!! ..."), no toast.
    moonraker.sendGcode(cmd, { quiet: true });
    commandInput = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      sendCommand();
    } else if (e.key === 'ArrowUp') {
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        commandInput = history[historyIndex];
      } else if (historyIndex === -1) {
        historyIndex = history.length - 1;
        commandInput = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex < history.length - 1 && historyIndex !== -1) {
        historyIndex++;
        commandInput = history[historyIndex];
      } else {
        historyIndex = -1;
        commandInput = '';
      }
    }
  }

  function sendQuick(cmd: string) {
    moonraker.sendGcode(cmd, { quiet: true });
  }
</script>

<div class="card">
  <div class="card-header">
    <div class="title-left">
      <h3><Icon name="terminal" /> {i18n.t('console')}</h3>
      <span class="count-badge">{moonraker.logs.length}/100</span>
    </div>

    <div class="header-actions">
      <label class="autoscroll-label">
        <input type="checkbox" bind:checked={autoScroll} />
        {i18n.t('autoscroll')}
      </label>
      <button class="btn-clear" onclick={() => moonraker.clearLogs()} title={i18n.t('clear')}>
        {i18n.t('clear')}
      </button>
    </div>
  </div>

  <!-- Terminal Window -->
  <div class="terminal" bind:this={logContainer}>
    {#if moonraker.logs.length === 0}
      <div class="empty-state">{i18n.t('terminal_ready')}</div>
    {/if}
    {#each moonraker.logs as log (log.id)}
      <div class="log-line {log.type}">
        <span class="time">{log.time}</span>
        <span class="prefix">
          {#if log.type === 'out'}
            &gt;
          {:else if log.type === 'err'}
            !
          {:else}
            &lt;
          {/if}
        </span>
        <span class="text">{log.text}</span>
      </div>
    {/each}
  </div>

  <!-- Quick Command Pills -->
  <div class="quick-pills">
    <button class="pill" onclick={() => sendQuick('STATUS')}>STATUS</button>
    <button class="pill" onclick={() => sendQuick('M105')}>M105</button>
    <button class="pill" onclick={() => sendQuick('GET_POSITION')}>GET_POSITION</button>
    <button class="pill" onclick={() => sendQuick('M115')}>M115</button>
  </div>

  <!-- Command Input Bar -->
  <div class="input-bar">
    <input
      type="text"
      placeholder={i18n.t('console_placeholder')}
      bind:value={commandInput}
      onkeydown={handleKeydown}
      class="gcode-input"
    />
    <button class="btn-send" onclick={sendCommand} disabled={!commandInput.trim()}>
      {i18n.t('send')}
    </button>
  </div>
</div>

<style>
  .card {
    background: #1e2025;
    border-radius: 10px;
    padding: 16px;
    border: 1px solid #282a30;
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .title-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #f3f4f6;
  }

  .count-badge {
    font-size: 0.7rem;
    background: #282a30;
    color: #9ca3af;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .autoscroll-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: #9ca3af;
    cursor: pointer;
  }
  .autoscroll-label input {
    accent-color: #38bdf8;
  }

  .btn-clear {
    background: none;
    border: 1px solid #374151;
    color: #9ca3af;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .btn-clear:hover {
    color: #f3f4f6;
    background: #282a30;
  }

  .terminal {
    background: #111215;
    border: 1px solid #282a30;
    border-radius: 6px;
    height: 220px;
    overflow-y: auto;
    padding: 8px 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .empty-state {
    color: #4b5563;
    font-style: italic;
    padding: 20px 0;
    text-align: center;
  }

  .log-line {
    display: flex;
    gap: 8px;
    line-height: 1.4;
    word-break: break-all;
  }

  .log-line.out {
    color: #38bdf8;
  }
  .log-line.in {
    color: #e5e7eb;
  }
  .log-line.err {
    color: #f87171;
  }

  .time {
    color: #4b5563;
    font-size: 0.75rem;
    user-select: none;
  }

  .prefix {
    color: #6b7280;
    user-select: none;
    font-weight: bold;
  }

  .quick-pills {
    display: flex;
    gap: 6px;
    margin: 8px 0;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .pill {
    background: #151619;
    border: 1px solid #374151;
    color: #9ca3af;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.1s ease;
  }
  .pill:hover {
    background: #23252b;
    color: #f3f4f6;
    border-color: #4b5563;
  }

  .input-bar {
    display: flex;
    gap: 8px;
  }

  .gcode-input {
    flex: 1;
    background: #151619;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.85rem;
  }
  .gcode-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .btn-send {
    background: #0284c7;
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-send:hover:not(:disabled) {
    background: #0369a1;
  }
  .btn-send:disabled {
    background: #374151;
    color: #6b7280;
    cursor: not-allowed;
  }
</style>
