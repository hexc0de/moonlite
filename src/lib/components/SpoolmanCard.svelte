<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';

  let spool = $derived(moonraker.spoolman.spool);
  let spoolId = $derived(moonraker.spoolman.spool_id);
  let loading = $derived(moonraker.spoolman.loading);

  let colorHex = $derived.by(() => {
    if (spool?.filament?.color_hex) {
      const hex = spool.filament.color_hex.trim();
      return hex.startsWith('#') ? hex : `#${hex}`;
    }
    if (spool?.color_hex) {
      const hex = spool.color_hex.trim();
      return hex.startsWith('#') ? hex : `#${hex}`;
    }
    if (spool?.colors && spool.colors.length > 0) {
      const c = spool.colors[0];
      return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }
    return '#f5f5f5';
  });

  let remainingWeight = $derived(
    typeof spool?.remaining_weight === 'number'
      ? Math.round(spool.remaining_weight)
      : (typeof spool?.remaining_filament === 'number' ? Math.round(spool.remaining_filament) : 0)
  );

  // Spoolman: spool.initial_weight (net filament weight of this spool) or filament.weight
  // (net weight of a full spool of this filament). 0 = unknown.
  let totalWeight = $derived.by(() => {
    const w = spool?.initial_weight ?? spool?.filament?.weight ?? spool?.net_weight;
    return typeof w === 'number' && w > 0 ? Math.round(w) : 0;
  });

  let remainingLengthM = $derived(
    typeof spool?.remaining_length === 'number'
      ? Math.round(spool.remaining_length / 1000)
      : 0
  );

  let pctRemaining = $derived(
    totalWeight > 0 ? Math.min(100, Math.max(0, Math.round((remainingWeight / totalWeight) * 100))) : 0
  );

  let vendorName = $derived(spool?.filament?.vendor?.name || spool?.filament?.manufacturer || '');

  let filamentName = $derived(spool?.filament?.name || i18n.t('spoolman_unnamed'));

  let material = $derived(spool?.filament?.material || '');

  let totalWeightLabel = $derived(
    totalWeight >= 1000
      ? `${parseFloat((totalWeight / 1000).toFixed(2))}kg`
      : `${totalWeight}g`
  );
</script>

<div class="card">
  <div class="card-header">
    <div class="title-with-icon">
      <span class="spool-icon"><Icon name="spool" /></span>
      <h3>{i18n.t('spoolman_title')}</h3>
      {#if spoolId}
        <span class="spool-id-badge font-mono">#{spoolId}</span>
      {/if}
    </div>
    <button 
      class="refresh-btn" 
      onclick={() => moonraker.fetchSpoolmanData()} 
      title={i18n.t('refresh')}
      disabled={loading}
    >
      <span class:spin={loading}><Icon name="refresh" /></span>
    </button>
  </div>

  {#if spoolId && spool}
    <div class="spoolman-body">
      <!-- Mainsail-style Spool Info Banner -->
      <div class="spool-card-main">
        <div class="spool-info-left">
          <div class="spool-meta-top font-mono">
            #{spoolId}{#if vendorName} &nbsp;|&nbsp; {vendorName.toUpperCase()}{/if}
          </div>
          <div class="spool-title" title={filamentName}>
            {filamentName}
          </div>
          <div class="spool-meta-sub">
            {#if material}
              <span class="mat-badge">{material}</span>
            {/if}
            <span class="stats-text">
              {remainingWeight}g{#if totalWeight} / {totalWeightLabel}{/if}{#if remainingLengthM} &nbsp;|&nbsp; {remainingLengthM}m{/if}
            </span>
          </div>
        </div>

        <!-- Authentic 3-Spoke 3D Printer Spool SVG Graphic -->
        <div class="spool-graphic-wrap" title={`${i18n.t('spool_color')}: ${colorHex}`}>
          <svg width="56" height="56" viewBox="0 0 100 100" class="spool-svg">
            <!-- Outer spool rim -->
            <circle cx="50" cy="50" r="48" fill="#2d3038" stroke="#3d424e" stroke-width="2" />
            
            <!-- 3 Rounded Filament Windows showcasing actual color -->
            <circle 
              cx="50" 
              cy="50" 
              r="30" 
              fill="none" 
              stroke={colorHex} 
              stroke-width="24" 
              stroke-dasharray="46 16.83" 
              stroke-dashoffset="8"
              stroke-linecap="round"
            />

            <!-- Inner Flange Hub & Center Spindle Hole -->
            <circle cx="50" cy="50" r="16" fill="#2d3038" stroke="#3d424e" stroke-width="1.5" />
            <circle cx="50" cy="50" r="7" fill="#151619" />
          </svg>
        </div>
      </div>

      <!-- Filament Remaining Progress Bar (only when the full weight is known) -->
      {#if totalWeight}
      <div class="spool-progress-section">
        <div class="progress-bar-header">
          <span class="prog-lbl">{i18n.t('spoolman_remaining')}</span>
          <span class="prog-val font-mono">{pctRemaining}%</span>
        </div>
        <div class="progress-track">
          <div 
            class="progress-fill" 
            style="width: {pctRemaining}%; background: {colorHex === '#ffffff' || colorHex.toLowerCase() === '#f5f5f5' ? '#38bdf8' : colorHex}"
          ></div>
        </div>
      </div>
      {/if}

      <!-- Recommended Temperatures Badge (if available) -->
      {#if spool.filament?.settings_extruder_temp || spool.filament?.settings_bed_temp}
        <div class="temps-footer">
          {#if spool.filament?.settings_extruder_temp}
            <span class="temp-item"><Icon name="nozzle" /> {i18n.t('nozzle')}: <strong>{spool.filament.settings_extruder_temp}°C</strong></span>
          {/if}
          {#if spool.filament?.settings_bed_temp}
            <span class="temp-item"><Icon name="bed" /> {i18n.t('bed')}: <strong>{spool.filament.settings_bed_temp}°C</strong></span>
          {/if}
        </div>
      {/if}
    </div>
  {:else if loading}
    <div class="empty-spool">
      <span class="spin"><Icon name="refresh" /></span>
      <span class="empty-text">{i18n.t('spoolman_loading')}</span>
    </div>
  {:else}
    <div class="empty-spool">
      <span class="empty-icon"><Icon name="spool" /></span>
      <span class="empty-text">{i18n.t('spoolman_no_spool')}</span>
    </div>
  {/if}
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

  .spool-icon {
    font-size: 1.1rem;
    color: #38bdf8;
    line-height: 1;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #f3f4f6;
  }

  .spool-id-badge {
    font-size: 0.72rem;
    color: #9ca3af;
    background: #151619;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #282a30;
  }

  .refresh-btn {
    background: #151619;
    border: 1px solid #282a30;
    color: #9ca3af;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }
  .refresh-btn:hover:not(:disabled) {
    color: #38bdf8;
    border-color: #38bdf8;
  }
  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spin {
    display: inline-block;
    animation: rotate 1s linear infinite;
  }
  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spoolman-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .spool-card-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 12px 14px;
    gap: 12px;
  }

  .spool-info-left {
    flex: 1;
    min-width: 0;
  }

  .spool-meta-top {
    font-size: 0.72rem;
    color: #9ca3af;
    letter-spacing: 0.03em;
    margin-bottom: 2px;
  }

  .spool-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.25;
    margin-bottom: 4px;
  }

  .spool-meta-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: #9ca3af;
  }

  .mat-badge {
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #38bdf8;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .stats-text {
    font-family: monospace;
    font-size: 0.78rem;
    color: #9ca3af;
  }

  .spool-graphic-wrap {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spool-svg {
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
  }

  .spool-progress-section {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 10px;
  }

  .progress-bar-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: #9ca3af;
    margin-bottom: 5px;
  }

  .progress-track {
    height: 6px;
    background: #111215;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid #282a30;
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease;
    border-radius: 3px;
  }

  .temps-footer {
    display: flex;
    gap: 16px;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .temp-item strong {
    color: #f3f4f6;
  }

  .empty-spool {
    padding: 24px;
    text-align: center;
    color: #6b7280;
    font-size: 0.85rem;
    background: #151619;
    border-radius: 8px;
    border: 1px dashed #282a30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .empty-icon {
    font-size: 1.5rem;
  }

  .font-mono {
    font-family: monospace;
  }
</style>
