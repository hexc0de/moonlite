<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  let fanSpeedPct = $derived(Math.round((moonraker.state.fan?.speed || 0) * 100));
  let cameralight = $derived(Boolean(moonraker.state.misc?.cameralight));
  let hotendFanSpeed = $derived(Math.round((moonraker.state.misc?.hotend_fan_speed || 0) * 100));
  let boardFanSpeed = $derived(Math.round((moonraker.state.misc?.board_fan_speed || 0) * 100));
  let misc = $derived(moonraker.state.misc);
  let machineLocked = $derived(moonraker.machineLocked);

  function adjustFan(delta: number) {
    const next = Math.min(100, Math.max(0, fanSpeedPct + delta));
    moonraker.setPartFan(next);
  }

  // onchange (on release), not oninput: one M106 per adjustment instead of one per pixel.
  function onFanChange(e: Event) {
    const target = e.target as HTMLInputElement;
    moonraker.setPartFan(Number(target.value));
  }
</script>

<div class="card">
  <div class="card-header">
    <div class="title-with-icon">
      <h3><Icon name="sliders" /> {i18n.t('misc_title')}</h3>
    </div>
  </div>

  <div class="misc-items">
    <!-- Part Cooling Fan with slider & +/- -->
    <div class="misc-row fan-row">
      <div class="item-label">
        <span class="fan-icon"><Icon name="fan" /></span>
        <span>{i18n.t('fan_speed')}</span>
      </div>
      <div class="fan-control-group">
        <button class="step-btn" onclick={() => adjustFan(-5)}>−</button>
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={fanSpeedPct} 
          onchange={onFanChange} 
          class="fan-slider"
        />
        <button class="step-btn" onclick={() => adjustFan(5)}>+</button>
        <span class="readout-pill">{fanSpeedPct}%</span>
      </div>
    </div>

    <!-- Cameralight Toggle -->
    {#if moonraker.hasLight}
    <div class="misc-row">
      <div class="item-label">
        <span><Icon name="light" /></span>
        <span>{i18n.t('cameralight')}</span>
      </div>
      <div class="toggle-wrapper">
        <button 
          class="switch-btn" 
          class:active={cameralight}
          onclick={() => moonraker.toggleCameralight()}
        >
          {cameralight ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
    {/if}

    <!-- Fans Info -->
    <div class="misc-grid-stats">
      {#if misc.hotend_fan_speed !== undefined}
        <div class="stat-cell">
          <span class="stat-name">{i18n.t('hotend_fan')}</span>
          <span class="stat-val highlight">{hotendFanSpeed}%</span>
        </div>
      {/if}
      {#if misc.board_fan_speed !== undefined}
        <div class="stat-cell">
          <span class="stat-name">{i18n.t('board_fan')}</span>
          <span class="stat-val">{boardFanSpeed}%</span>
        </div>
      {/if}
      {#if misc.filament_detected !== undefined}
        <div class="stat-cell">
          <span class="stat-name">{i18n.t('filament_sensor')}</span>
          <span class="stat-val status-tag" class:detected={misc.filament_detected}>
            <span class="dot"></span>
            {misc.filament_detected ? i18n.t('filament_detected') : i18n.t('filament_empty')}
          </span>
        </div>
      {/if}
    </div>

    <!-- Quick Macros Bar -->
    <div class="macros-section">
      <div class="macros-title">{i18n.t('quick_macros')}</div>
      <div class="macro-btns">
        <button class="m-btn" disabled={machineLocked} onclick={() => moonraker.machineGcode('Z_TILT_ADJUST')}>Z-TILT</button>
        <button class="m-btn" disabled={machineLocked} onclick={() => moonraker.machineGcode('BED_MESH_CALIBRATE')}>Bed Mesh</button>
        <button class="m-btn" disabled={machineLocked} onclick={() => moonraker.motorsOff()}>Motors Off</button>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    background: #1e2025;
    border-radius: 10px;
    padding: 14px 16px;
    border: 1px solid #282a30;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #f3f4f6;
  }

  .misc-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .misc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #151619;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #282a30;
  }

  .item-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: #d1d5db;
    font-weight: 500;
  }

  .fan-control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .fan-slider {
    width: 110px;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .step-btn {
    background: #23252b;
    border: 1px solid #374151;
    color: #f3f4f6;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .step-btn:hover {
    background: #2e323b;
    border-color: #38bdf8;
  }

  .readout-pill {
    font-size: 0.8rem;
    font-family: monospace;
    font-weight: 600;
    color: #38bdf8;
    min-width: 38px;
    text-align: right;
  }

  .switch-btn {
    background: #23252b;
    border: 1px solid #374151;
    color: #9ca3af;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .switch-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
  }

  .misc-grid-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat-cell {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-name {
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .stat-val {
    font-size: 0.85rem;
    font-weight: 600;
    color: #e5e7eb;
    font-family: monospace;
  }
  .stat-val.highlight {
    color: #38bdf8;
  }

  .status-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: #ef4444;
  }
  .status-tag.detected {
    color: #22c55e;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .macros-section {
    background: #111215;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .macros-title {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-bottom: 6px;
  }

  .macro-btns {
    display: flex;
    gap: 6px;
  }

  .m-btn {
    flex: 1;
    background: #1e2025;
    border: 1px solid #282a30;
    color: #d1d5db;
    padding: 6px 4px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .m-btn:hover:not(:disabled) {
    background: #2a2d34;
    border-color: #38bdf8;
    color: #38bdf8;
  }
  .m-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
