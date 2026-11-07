<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  let isLocked = $derived(moonraker.motionLocked);

  let extrudeFactor = $derived(Math.round((moonraker.state.gcode_move?.extrude_factor || 1) * 100));

  let filamentLength = $state(25);
  let filamentSpeed = $state(5);

  function adjustFlow(delta: number) {
    const next = Math.max(10, extrudeFactor + delta);
    moonraker.setFlowFactor(next);
  }

  // onchange (on release), not oninput: one M221 per adjustment instead of one per pixel.
  function onFlowChange(e: Event) {
    const target = e.target as HTMLInputElement;
    moonraker.setFlowFactor(Number(target.value));
  }

  function handleExtrude() {
    if (isLocked) return;
    moonraker.extrude(filamentLength, filamentSpeed);
  }

  function handleRetract() {
    if (isLocked) return;
    moonraker.retract(filamentLength, filamentSpeed);
  }
</script>

<div class="card">
  <div class="card-header">
    <div class="title-with-icon">
      <h3><Icon name="nozzle" /> {i18n.t('extruder')}</h3>
    </div>
  </div>

  <!-- Extrusion Factor (Flow) Slider -->
  <div class="section-box">
    <div class="section-header">
      <span class="lbl">{i18n.t('extrusion_flow')}</span>
      <span class="val font-mono">{extrudeFactor}%</span>
    </div>
    <div class="slider-row">
      <button class="step-btn" onclick={() => adjustFlow(-5)}>−</button>
      <input 
        type="range" 
        min="50" 
        max="150" 
        value={extrudeFactor} 
        onchange={onFlowChange} 
        class="slider"
      />
      <button class="step-btn" onclick={() => adjustFlow(5)}>+</button>
    </div>
  </div>

  <!-- Extrude / Retract Controls -->
  <div class="section-box">
    <!-- Filament Length presets -->
    <div class="preset-row">
      <span class="row-label">{i18n.t('length')}</span>
      <div class="btn-group">
        {#each [50, 25, 10, 5, 1] as len}
          <button 
            class="pill-btn" 
            class:active={filamentLength === len} 
            onclick={() => filamentLength = len}
          >{len} mm</button>
        {/each}
      </div>
    </div>

    <!-- Feedrate presets -->
    <div class="preset-row">
      <span class="row-label">{i18n.t('feedrate')}</span>
      <div class="btn-group">
        {#each [10, 5, 2, 1] as spd}
          <button 
            class="pill-btn" 
            class:active={filamentSpeed === spd} 
            onclick={() => filamentSpeed = spd}
          >{spd} mm/s</button>
        {/each}
      </div>
    </div>

    <!-- Retract / Extrude Action Buttons -->
    <div class="extrude-actions">
      <button 
        class="ext-btn retract" 
        disabled={isLocked} 
        onclick={handleRetract}
        title="Retract filament"
      >
        <Icon name="arrow-up" /> {i18n.t('retract')}
      </button>
      <button 
        class="ext-btn extrude" 
        disabled={isLocked} 
        onclick={handleExtrude}
        title="Extrude filament"
      >
        <Icon name="arrow-down" /> {i18n.t('extrude')}
      </button>
    </div>
    {#if isLocked}
      <div class="lock-hint"><Icon name="lock" /> {i18n.t('manual_extrude_locked')}</div>
    {/if}
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

  .section-box {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #9ca3af;
    margin-bottom: 6px;
  }

  .font-mono {
    font-family: monospace;
    color: #38bdf8;
    font-weight: 600;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider {
    flex: 1;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .step-btn {
    background: #23252b;
    border: 1px solid #374151;
    color: #f3f4f6;
    width: 26px;
    height: 26px;
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

  .preset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .row-label {
    font-size: 0.75rem;
    color: #9ca3af;
    width: 60px;
  }

  .btn-group {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  .pill-btn {
    flex: 1;
    background: #1e2025;
    border: 1px solid #282a30;
    color: #9ca3af;
    padding: 4px 0;
    border-radius: 4px;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .pill-btn:hover {
    background: #2a2d34;
    color: #f3f4f6;
  }
  .pill-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: white;
    font-weight: 600;
  }

  .extrude-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .ext-btn {
    flex: 1;
    padding: 8px 0;
    border-radius: 5px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid #374151;
  }
  .ext-btn.retract {
    background: #1e2025;
    color: #d1d5db;
  }
  .ext-btn.retract:hover:not(:disabled) {
    background: #2a2d34;
    border-color: #f59e0b;
    color: #f59e0b;
  }
  .ext-btn.extrude {
    background: #0284c7;
    color: white;
    border-color: #38bdf8;
  }
  .ext-btn.extrude:hover:not(:disabled) {
    background: #0369a1;
  }
  .ext-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lock-hint {
    margin-top: 6px;
    font-size: 0.7rem;
    color: #f59e0b;
    text-align: center;
  }
</style>
