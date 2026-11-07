<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  // bind:value on a number input yields a number, or null once the field is emptied.
  let customExtruderTarget = $state<number | string | null>('');
  let customBedTarget = $state<number | string | null>('');

  const hasValue = (v: number | string | null) => v !== '' && v !== null && !Number.isNaN(Number(v));
  let canvasRef = $state<HTMLCanvasElement | null>(null);

  let extruder = $derived(moonraker.state.extruder);
  let bed = $derived(moonraker.state.heater_bed);
  let sensors = $derived(moonraker.state.sensors);

  // Friendly labels for common sensor names; anything else shows its Klipper name.
  const SENSOR_LABELS: Record<string, string> = {
    mcu_temp: 'sensor_mcu',
    soc: 'sensor_soc',
    toolhead_temp: 'sensor_toolhead',
  };

  let sensorRows = $derived(
    Object.entries(sensors)
      .filter(([, v]) => typeof v.temperature === 'number')
      .map(([key, v]) => {
        const name = key.slice(key.indexOf(' ') + 1);
        const labelKey = SENSOR_LABELS[name.toLowerCase()];
        return { key, label: labelKey ? i18n.t(labelKey) : name, temperature: v.temperature as number };
      }),
  );

  function setExtruder(target: number) {
    moonraker.setExtruderTemp(target);
    customExtruderTarget = '';
  }

  function setBed(target: number) {
    moonraker.setBedTemp(target);
    customBedTarget = '';
  }

  function cooldown() {
    moonraker.cooldown();
  }

  // Draw lightweight 60-point temperature history graph
  $effect(() => {
    const history = moonraker.tempHistory;
    if (!canvasRef || history.length === 0) return;

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    // Render at device resolution so the graph stays sharp on HiDPI screens.
    const dpr = window.devicePixelRatio || 1;
    const width = canvasRef.clientWidth || 420;
    const height = canvasRef.clientHeight || 110;
    if (canvasRef.width !== Math.round(width * dpr) || canvasRef.height !== Math.round(height * dpr)) {
      canvasRef.width = Math.round(width * dpr);
      canvasRef.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear background
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, width, height);

    // Draw horizontal grid lines (0, 100, 200, 300°C)
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#23252b';
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px monospace';

    const maxTemp = 320;
    const gridTemps = [0, 100, 200, 300];

    for (const t of gridTemps) {
      const y = height - (t / maxTemp) * (height - 16) - 8;
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(width - 8, y);
      ctx.stroke();
      ctx.fillText(`${t}°`, 6, y + 3);
    }

    if (history.length < 2) return;

    const plotWidth = width - 38;
    const stepX = plotWidth / (Math.max(60, history.length) - 1);
    const startX = 32 + (60 - history.length) * stepX;

    // Helper to calculate Y coordinate
    const getY = (val: number) => height - (Math.min(maxTemp, Math.max(0, val)) / maxTemp) * (height - 16) - 8;

    // 1. Bed target line (dashed blue)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = startX + i * stepX;
      const y = getY(pt.bedTarget);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 2. Extruder target line (dashed red)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = startX + i * stepX;
      const y = getY(pt.extruderTarget);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.setLineDash([]); // Reset to solid lines

    // 3. Bed actual temp line (solid cyan/blue)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = startX + i * stepX;
      const y = getY(pt.bed);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 4. Extruder actual temp line (solid red/orange)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    history.forEach((pt, i) => {
      const x = startX + i * stepX;
      const y = getY(pt.extruder);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
</script>

<div class="card">
  <div class="card-header">
    <div class="title-with-icon">
      <h3><Icon name="flame" /> {i18n.t('temperatures')}</h3>
    </div>
    <button class="cooldown-btn" onclick={cooldown} title="Turn off all heaters (M104 S0, M140 S0)">
      <Icon name="snowflake" /> {i18n.t('cooldown')}
    </button>
  </div>

  <!-- Mainsail-style Temperatures Table -->
  <div class="temp-table-wrapper">
    <table class="temp-table">
      <thead>
        <tr>
          <th class="col-name">{i18n.t('temp_name')}</th>
          <th class="col-state">{i18n.t('temp_state')}</th>
          <th class="col-curr">{i18n.t('temp_current')}</th>
          <th class="col-target">{i18n.t('temp_target')}</th>
        </tr>
      </thead>
      <tbody>
        <!-- Extruder (Hotend) -->
        <tr>
          <td class="col-name">
            <span class="icon-heater ext"><Icon name="nozzle" /></span> {i18n.t('extruder')}
          </td>
          <td class="col-state font-mono">
            {extruder.power ? `${Math.round(extruder.power * 100)}%` : '—'}
          </td>
          <td class="col-curr font-mono highlight-ext">
            <strong>{extruder.temperature?.toFixed(1) || '0.0'}°C</strong>
          </td>
          <td class="col-target">
            <div class="target-control">
              <!-- The current target lives in the placeholder (as in Mainsail) to keep the table narrow. -->
              <input
                type="number"
                min="0"
                max="999"
                placeholder={String(Math.round(extruder.target))}
                title={`${i18n.t('temp_target')}: ${Math.round(extruder.target)}°C`}
                aria-label={i18n.t('temp_target')}
                class:heating={extruder.target > 0}
                bind:value={customExtruderTarget} 
                class="compact-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && hasValue(customExtruderTarget)) setExtruder(Number(customExtruderTarget));
                  else if (e.key === 'Escape') customExtruderTarget = '';
                }}
              />
              <button
                class="btn-mini"
                disabled={!hasValue(customExtruderTarget)}
                onclick={() => setExtruder(Number(customExtruderTarget))}
                title={i18n.t('temp_apply')}
              ><Icon name="check" /></button>
              <button
                class="btn-mini btn-clear"
                disabled={!hasValue(customExtruderTarget)}
                onclick={() => (customExtruderTarget = '')}
                title={i18n.t('temp_clear')}
              ><Icon name="close" /></button>
            </div>
          </td>
        </tr>

        <!-- Heater Bed -->
        <tr>
          <td class="col-name">
            <span class="icon-heater bed"><Icon name="bed" /></span> {i18n.t('bed')}
          </td>
          <td class="col-state font-mono">
            {bed.power ? `${Math.round(bed.power * 100)}%` : '—'}
          </td>
          <td class="col-curr font-mono highlight-bed">
            <strong>{bed.temperature?.toFixed(1) || '0.0'}°C</strong>
          </td>
          <td class="col-target">
            <div class="target-control">
              <!-- The current target lives in the placeholder (as in Mainsail) to keep the table narrow. -->
              <input
                type="number"
                min="0"
                max="999"
                placeholder={String(Math.round(bed.target))}
                title={`${i18n.t('temp_target')}: ${Math.round(bed.target)}°C`}
                aria-label={i18n.t('temp_target')}
                class:heating={bed.target > 0}
                bind:value={customBedTarget} 
                class="compact-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter' && hasValue(customBedTarget)) setBed(Number(customBedTarget));
                  else if (e.key === 'Escape') customBedTarget = '';
                }}
              />
              <button
                class="btn-mini"
                disabled={!hasValue(customBedTarget)}
                onclick={() => setBed(Number(customBedTarget))}
                title={i18n.t('temp_apply')}
              ><Icon name="check" /></button>
              <button
                class="btn-mini btn-clear"
                disabled={!hasValue(customBedTarget)}
                onclick={() => (customBedTarget = '')}
                title={i18n.t('temp_clear')}
              ><Icon name="close" /></button>
            </div>
          </td>
        </tr>

        <!-- Sensors -->
        {#each sensorRows as sensor (sensor.key)}
          <tr class="sensor-row">
            <td class="col-name"><span class="icon-sensor"><Icon name="thermometer" /></span> {sensor.label}</td>
            <td class="col-state">—</td>
            <td class="col-curr font-mono">{sensor.temperature.toFixed(1)}°C</td>
            <td class="col-target muted">—</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Quick Presets Bar -->
  <div class="presets-row">
    <div class="preset-group">
      <span class="p-lbl">{i18n.t('extruder')}:</span>
      <button class="p-btn off" onclick={() => setExtruder(0)}>{i18n.t('off')}</button>
      <button class="p-btn" onclick={() => setExtruder(210)}>PLA 210</button>
      <button class="p-btn" onclick={() => setExtruder(235)}>PETG 235</button>
      <button class="p-btn" onclick={() => setExtruder(250)}>ABS 250</button>
    </div>
    <div class="preset-group">
      <span class="p-lbl">{i18n.t('bed')}:</span>
      <button class="p-btn off" onclick={() => setBed(0)}>{i18n.t('off')}</button>
      <button class="p-btn" onclick={() => setBed(60)}>PLA 60</button>
      <button class="p-btn" onclick={() => setBed(75)}>PETG 75</button>
      <button class="p-btn" onclick={() => setBed(105)}>ABS 105</button>
    </div>
  </div>

  <!-- Real-Time Temperature History Canvas Graph -->
  <div class="chart-container">
    <div class="chart-header">
      <span class="chart-title">{i18n.t('temp_history')}</span>
      <div class="chart-legend">
        <span class="legend-tag ext"><span class="tag-dot ext"></span> {i18n.t('extruder')}</span>
        <span class="legend-tag bed"><span class="tag-dot bed"></span> {i18n.t('bed')}</span>
      </div>
    </div>
    <canvas 
      bind:this={canvasRef} 
      width="420" 
      height="110" 
      class="temp-canvas"
    ></canvas>
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
    margin-bottom: 10px;
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

  .cooldown-btn {
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cooldown-btn:hover {
    background: rgba(56, 189, 248, 0.25);
    border-color: #38bdf8;
  }

  .temp-table-wrapper {
    overflow-x: auto;
    margin-bottom: 10px;
  }

  .temp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .temp-table th {
    text-align: left;
    color: #9ca3af;
    font-weight: 500;
    padding: 6px 8px;
    border-bottom: 1px solid #282a30;
    font-size: 0.75rem;
  }

  .temp-table td {
    padding: 7px 8px;
    border-bottom: 1px solid #23252b;
    vertical-align: middle;
  }

  .sensor-row td {
    color: #9ca3af;
    font-size: 0.78rem;
  }

  .col-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }

  .icon-heater.ext { color: #ef4444; }
  .icon-heater.bed { color: #38bdf8; }
  .icon-sensor { font-size: 0.8rem; }

  .font-mono {
    font-family: monospace;
  }

  .highlight-ext strong {
    color: #f87171;
    font-size: 0.95rem;
  }

  .highlight-bed strong {
    color: #38bdf8;
    font-size: 0.95rem;
  }

  .muted {
    color: #4b5563;
  }

  .target-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .compact-input {
    /* 3 digits + the native spinner */
    width: 64px;
    background: #141518;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 3px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
  }
  .compact-input::placeholder {
    color: #6b7280;
  }
  .compact-input.heating::placeholder {
    color: #f3f4f6;
  }
  .compact-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .btn-mini {
    background: #0284c7;
    border: none;
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .btn-mini.btn-clear {
    background: #dc2626;
  }
  .btn-mini.btn-clear:hover:not(:disabled) {
    background: #ef4444;
  }
  .btn-mini:disabled {
    background: #282a30;
    color: #4b5563;
    cursor: not-allowed;
  }

  .presets-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #151619;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #282a30;
    margin-bottom: 12px;
  }

  .preset-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .p-lbl {
    font-size: 0.72rem;
    color: #9ca3af;
    width: 60px;
  }

  .p-btn {
    background: #23252b;
    border: 1px solid #374151;
    color: #d1d5db;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.1s ease;
  }
  .p-btn:hover {
    background: #2e323b;
    border-color: #38bdf8;
    color: #ffffff;
  }
  .p-btn.off:hover {
    border-color: #ef4444;
    color: #f87171;
  }

  .chart-container {
    background: #141518;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .chart-title {
    font-size: 0.72rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .chart-legend {
    display: flex;
    gap: 10px;
    font-size: 0.7rem;
  }

  .legend-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #9ca3af;
  }
  .tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .tag-dot.ext { background: #ef4444; }
  .tag-dot.bed { background: #38bdf8; }

  .temp-canvas {
    width: 100%;
    height: 105px;
    display: block;
    border-radius: 4px;
  }
</style>
