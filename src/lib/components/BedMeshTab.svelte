<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui } from '../ui.svelte';

  interface BedMeshState {
    profile_name: string;
    mesh_min: [number, number];
    mesh_max: [number, number];
    probed_matrix: number[][];
    profiles?: Record<string, any>;
  }

  let meshData = $state<BedMeshState | null>(null);
  let loading = $state(false);
  let hoveredPoint = $state<{ r: number; c: number; val: number } | null>(null);

  async function loadBedMesh() {
    loading = true;
    try {
      const res = await moonraker.call('printer.objects.query', {
        objects: { bed_mesh: null }
      });
      if (res && res.status && res.status.bed_mesh) {
        meshData = res.status.bed_mesh;
      }
    } catch (e) {
      console.error('Failed to load bed mesh', e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (moonraker.connected) {
      untrack(() => loadBedMesh());
    }
  });

  // probed_matrix[0] is the front row (Y min). Show the back of the bed at the top,
  // as seen when standing in front of the printer.
  let displayRows = $derived(
    meshData?.probed_matrix
      ? meshData.probed_matrix.map((row, r) => ({ row, r })).reverse()
      : [],
  );

  // Calculate statistics
  let stats = $derived.by(() => {
    if (!meshData || !meshData.probed_matrix || meshData.probed_matrix.length === 0) {
      return { min: 0, max: 0, variance: 0 };
    }
    const flat = meshData.probed_matrix.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const variance = max - min;
    return { min, max, variance };
  });

  function getColor(val: number): string {
    const min = stats.min;
    const max = stats.max;
    const range = (max - min) || 0.1;
    const norm = Math.min(1, Math.max(0, (val - min) / range));

    let r = 0, g = 0, b = 0;
    if (norm < 0.5) {
      const t = norm * 2;
      r = Math.round(30 + t * 40);
      g = Math.round(100 + t * 140);
      b = Math.round(230 - t * 120);
    } else {
      const t = (norm - 0.5) * 2;
      r = Math.round(70 + t * 170);
      g = Math.round(240 - t * 150);
      b = Math.round(110 - t * 90);
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  let calibrating = $state(false);

  async function calibrateMesh() {
    if (moonraker.machineLocked) {
      ui.notify(i18n.t('locked_printing'), 'error');
      return;
    }
    if (!(await ui.confirm(i18n.t('confirm_mesh_calibrate')))) return;
    calibrating = true;
    try {
      // The RPC resolves when calibration has finished, so the new mesh can be read right after.
      if (await moonraker.machineGcode('BED_MESH_CALIBRATE')) await loadBedMesh();
    } finally {
      calibrating = false;
    }
  }

  async function loadProfile(name: string) {
    // Quoted so profile names with spaces work (Klipper parses extended args with shlex).
    if (await moonraker.sendGcode(`BED_MESH_PROFILE LOAD="${name.replace(/"/g, '')}"`)) {
      await loadBedMesh();
    }
  }
</script>

<div class="mesh-view">
  <div class="mesh-header">
    <div class="title-stats">
      <h3><Icon name="bed-mesh" /> {i18n.t('bedmesh_title')}</h3>
      {#if meshData}
        <span class="profile-tag">{i18n.t('profile')} {meshData.profile_name || 'default'}</span>
      {/if}
    </div>

    <div class="header-actions">
      <button class="btn btn-secondary btn-sm" onclick={loadBedMesh}><Icon name="refresh" /> {i18n.t('refresh')}</button>
      <button class="btn btn-primary btn-sm" disabled={calibrating} onclick={calibrateMesh}>
        {calibrating ? i18n.t('calibrating') : i18n.t('calibrate_bed')}
      </button>
    </div>
  </div>

  {#if loading && !meshData}
    <div class="loading">{i18n.t('loading_mesh')}</div>
  {:else if !meshData || !meshData.probed_matrix || meshData.probed_matrix.length === 0}
    <div class="empty">
      <p>{i18n.t('mesh_empty')}</p>
      <button class="btn btn-primary" disabled={calibrating} onclick={calibrateMesh}>
        {calibrating ? i18n.t('calibrating') : i18n.t('run_calibration')}
      </button>
    </div>
  {:else}
    <!-- Stats Banner -->
    <div class="stats-banner">
      <div class="stat-card">
        <span class="lbl">{i18n.t('variance')}</span>
        <span class="val highlight">{stats.variance.toFixed(3)} mm</span>
      </div>
      <div class="stat-card">
        <span class="lbl">{i18n.t('minimum')}</span>
        <span class="val">{stats.min >= 0 ? '+' : ''}{stats.min.toFixed(3)} mm</span>
      </div>
      <div class="stat-card">
        <span class="lbl">{i18n.t('maximum')}</span>
        <span class="val">{stats.max >= 0 ? '+' : ''}{stats.max.toFixed(3)} mm</span>
      </div>
      <div class="stat-card">
        <span class="lbl">{i18n.t('grid_size')}</span>
        <span class="val">{meshData.probed_matrix[0].length} × {meshData.probed_matrix.length}</span>
      </div>
    </div>

    <!-- 2D Heatmap Grid -->
    <div class="heatmap-container">
      <div class="grid-table" style="--cols: {meshData.probed_matrix[0].length};">
        {#each displayRows as { row, r: rIndex } (rIndex)}
          {#each row as val, cIndex}
            <div 
              class="grid-cell"
              role="button"
              tabindex="0"
              style="background-color: {getColor(val)};"
              onmouseenter={() => hoveredPoint = { r: rIndex, c: cIndex, val }}
              onmouseleave={() => hoveredPoint = null}
            >
              <span class="cell-val">{val >= 0 ? '+' : ''}{val.toFixed(2)}</span>
            </div>
          {/each}
        {/each}
      </div>

      <!-- Point Details Readout -->
      <div class="point-readout">
        {#if hoveredPoint}
          <span>{i18n.t('point')} [{hoveredPoint.c + 1}, {hoveredPoint.r + 1}]:</span>
          <strong>{hoveredPoint.val >= 0 ? '+' : ''}{hoveredPoint.val.toFixed(4)} mm</strong>
        {:else}
          <span class="hint">{i18n.t('hover_cell_hint')}</span>
        {/if}
      </div>
    </div>

    <!-- Profiles Selector -->
    {#if meshData.profiles && Object.keys(meshData.profiles).length > 0}
      <div class="profiles-bar">
        <span>{i18n.t('saved_profiles')}</span>
        {#each Object.keys(meshData.profiles) as prof}
          <button 
            class="prof-btn" 
            class:active={meshData.profile_name === prof}
            onclick={() => loadProfile(prof)}
          >
            {prof}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .mesh-view {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 900px;
    margin: 0 auto;
    padding: 16px;
    width: 100%;
  }

  .mesh-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #18191c;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #282a30;
    flex-wrap: wrap;
    gap: 10px;
  }

  .title-stats {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #f3f4f6;
  }

  .profile-tag {
    font-size: 0.75rem;
    background: #23252b;
    color: #38bdf8;
    border: 1px solid #374151;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .stats-banner {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }

  .stat-card {
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .stat-card .lbl {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .stat-card .val {
    font-size: 1.15rem;
    font-weight: 700;
    color: #f3f4f6;
  }
  .stat-card .val.highlight {
    color: #38bdf8;
  }

  .heatmap-container {
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .grid-table {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 6px;
    width: 100%;
    max-width: 440px;
    aspect-ratio: 1 / 1;
  }

  .grid-cell {
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  .grid-cell:hover {
    transform: scale(1.08);
    box-shadow: 0 0 10px rgba(0,0,0,0.5);
    z-index: 2;
    border-color: white;
  }

  .cell-val {
    font-size: 0.75rem;
    font-weight: 700;
    color: #111;
    font-family: monospace;
    text-shadow: 0 0 2px rgba(255, 255, 255, 0.4);
  }

  .point-readout {
    font-size: 0.85rem;
    color: #d1d5db;
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 24px;
  }
  .point-readout strong {
    color: #38bdf8;
  }
  .point-readout .hint {
    color: #6b7280;
    font-style: italic;
  }

  .profiles-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.85rem;
    color: #9ca3af;
    flex-wrap: wrap;
  }

  .prof-btn {
    background: #23252b;
    border: 1px solid #374151;
    color: #d1d5db;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .prof-btn:hover {
    background: #2e323b;
    color: #f3f4f6;
  }
  .prof-btn.active {
    background: #0284c7;
    border-color: #0284c7;
    color: white;
    font-weight: 600;
  }

  .loading, .empty {
    text-align: center;
    padding: 40px;
    color: #6b7280;
    background: #18191c;
    border-radius: 8px;
    border: 1px solid #282a30;
  }

  .btn {
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .btn-sm { padding: 4px 10px; font-size: 0.8rem; }
  .btn-primary { background: #0284c7; color: white; }
  .btn-primary:hover { background: #0369a1; }
  .btn-secondary { background: #374151; color: white; }
  .btn-secondary:hover { background: #4b5563; }
</style>
