<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  let isLocked = $derived(moonraker.motionLocked);
  let machineLocked = $derived(moonraker.machineLocked);
  let toolhead = $derived(moonraker.state.toolhead);
  let speedFactor = $derived(Math.round((moonraker.state.gcode_move?.speed_factor || 1) * 100));

  function move(axis: 'X' | 'Y' | 'Z', distance: number) {
    if (isLocked) return;
    moonraker.move(axis, distance);
  }

  function home(axes: string = '') {
    if (isLocked) return;
    moonraker.home(axes);
  }

  function zTilt() {
    moonraker.machineGcode('Z_TILT_ADJUST');
  }

  function adjustZ(delta: number) {
    moonraker.babyStep(delta);
  }

  function setSpeed(pct: number) {
    moonraker.setSpeedFactor(pct);
  }
</script>

<div class="card">
  <div class="card-header">
    <div class="title-with-tag">
      <h3><Icon name="move" /> {i18n.t('toolhead')}</h3>
    </div>
    {#if isLocked}
      <span class="lock-indicator" title={i18n.t('hint_locked_moves')}>
        <Icon name="lock" /> {i18n.t('locked_printing')}
      </span>
    {/if}
  </div>

  <!-- Coordinates Bar -->
  <div class="coords-row">
    <div class="coord-box">
      <span class="axis-lbl">X</span>
      <span class="axis-val">{toolhead.position?.[0]?.toFixed(2) || '0.00'}</span>
    </div>
    <div class="coord-box">
      <span class="axis-lbl">Y</span>
      <span class="axis-val">{toolhead.position?.[1]?.toFixed(2) || '0.00'}</span>
    </div>
    <div class="coord-box">
      <span class="axis-lbl">Z</span>
      <span class="axis-val">{toolhead.position?.[2]?.toFixed(3) || '0.000'}</span>
    </div>
  </div>

  <!-- Homing & Align buttons -->
  <div class="home-actions-bar">
    <button class="home-btn home-all wide" disabled={isLocked} onclick={() => home()} title={i18n.t('home_all')}>
      <Icon name="home" /> ALL
    </button>
    <button class="home-btn wide" disabled={machineLocked} onclick={zTilt} title={i18n.t('hint_ztilt')}>
      <Icon name="level" /> Z-TILT
    </button>
    <button class="home-btn" disabled={isLocked} onclick={() => home('x')}>X</button>
    <button class="home-btn" disabled={isLocked} onclick={() => home('y')}>Y</button>
    <button class="home-btn" disabled={isLocked} onclick={() => home('z')}>Z</button>
    <button class="home-btn motors-off" disabled={machineLocked} onclick={() => moonraker.motorsOff()} title={i18n.t('motors_off')}>
      M84
    </button>
  </div>

  <!-- X Axis Row -->
  <div class="axis-control-row">
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', -100)}>-100</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', -10)}>-10</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', -1)}>-1</button>
    <div class="axis-center-badge">X</div>
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', 1)}>+1</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', 10)}>+10</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('X', 100)}>+100</button>
  </div>

  <!-- Y Axis Row -->
  <div class="axis-control-row">
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', -100)}>-100</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', -10)}>-10</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', -1)}>-1</button>
    <div class="axis-center-badge">Y</div>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', 1)}>+1</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', 10)}>+10</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Y', 100)}>+100</button>
  </div>

  <!-- Z Axis Row -->
  <div class="axis-control-row">
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', -25)}>-25</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', -1)}>-1</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', -0.1)}>-0.1</button>
    <div class="axis-center-badge z">Z</div>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', 0.1)}>+0.1</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', 1)}>+1</button>
    <button class="step-btn" disabled={isLocked} onclick={() => move('Z', 25)}>+25</button>
  </div>

  <!-- Z-Offset Babystepping -->
  <div class="zoffset-section">
    <div class="zoffset-title">
      <span><Icon name="ruler" /> {i18n.t('zoffset_title')}</span>
    </div>
    <div class="zoffset-grid">
      <button class="z-btn down" onclick={() => adjustZ(-0.05)}>-0.05</button>
      <button class="z-btn down" onclick={() => adjustZ(-0.025)}>-0.025</button>
      <button class="z-btn down" onclick={() => adjustZ(-0.01)}>-0.01</button>
      <button class="z-btn down" onclick={() => adjustZ(-0.005)}>-0.005</button>
      <button class="z-btn up" onclick={() => adjustZ(0.005)}>+0.005</button>
      <button class="z-btn up" onclick={() => adjustZ(0.01)}>+0.01</button>
      <button class="z-btn up" onclick={() => adjustZ(0.025)}>+0.025</button>
      <button class="z-btn up" onclick={() => adjustZ(0.05)}>+0.05</button>
    </div>
  </div>

  <!-- Speed Factor Slider -->
  <div class="speed-slider-box">
    <div class="slider-header">
      <span><Icon name="speed" /> {i18n.t('print_speed')}</span>
      <strong>{speedFactor}%</strong>
    </div>
    <input 
      type="range" 
      min="20" 
      max="250" 
      value={speedFactor} 
      class="slider" 
      onchange={(e) => setSpeed(Number((e.target as HTMLInputElement).value))}
    />
  </div>
</div>

<style>
  .card {
    background: #18191c;
    border-radius: 8px;
    padding: 14px;
    border: 1px solid #282a30;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .title-with-tag {
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

  .lock-indicator {
    font-size: 0.75rem;
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .coords-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .coord-box {
    background: #111215;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .axis-lbl {
    font-size: 0.8rem;
    color: #9ca3af;
    font-weight: 600;
  }

  .axis-val {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.95rem;
    font-weight: 700;
    color: #38bdf8;
  }

  .home-actions-bar {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
  }

  .home-btn {
    flex: 1;
    background: #23252b;
    border: 1px solid #374151;
    color: #d1d5db;
    padding: 6px 0;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  }
  .home-btn.wide {
    flex: 1.6;
  }
  .home-btn:hover:not(:disabled) {
    background: #2e323b;
    color: #f3f4f6;
    border-color: #4b5563;
  }
  .home-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .home-btn.home-all {
    background: #0f374d;
    border-color: #0284c7;
    color: #38bdf8;
  }
  .home-btn.motors-off:hover:not(:disabled) {
    border-color: #ef4444;
    color: #f87171;
  }

  .axis-control-row {
    display: flex;
    gap: 4px;
    margin-bottom: 6px;
  }

  .step-btn {
    flex: 1;
    background: #1e2025;
    border: 1px solid #282a30;
    color: #d1d5db;
    padding: 7px 0;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .step-btn:hover:not(:disabled) {
    background: #2a2d34;
    color: #38bdf8;
    border-color: #38bdf8;
  }
  .step-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .axis-center-badge {
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #111215;
    border: 1px solid #374151;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
    color: #9ca3af;
  }
  .axis-center-badge.z {
    color: #38bdf8;
  }

  .zoffset-section {
    background: #111215;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 10px;
    margin: 12px 0 10px 0;
  }

  .zoffset-title {
    font-size: 0.75rem;
    color: #9ca3af;
    margin-bottom: 6px;
  }

  .zoffset-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  .z-btn {
    background: #1e2025;
    border: 1px solid #282a30;
    color: #d1d5db;
    padding: 5px 0;
    border-radius: 3px;
    font-size: 0.7rem;
    font-family: monospace;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .z-btn:hover {
    background: #2a2d34;
  }
  .z-btn.down:hover {
    color: #38bdf8;
    border-color: #38bdf8;
  }
  .z-btn.up:hover {
    color: #f59e0b;
    border-color: #f59e0b;
  }

  .speed-slider-box {
    margin-top: 10px;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #9ca3af;
    margin-bottom: 4px;
  }
  .slider-header strong {
    color: #38bdf8;
  }

  .slider {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
  }
</style>
