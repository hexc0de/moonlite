<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui } from '../ui.svelte';

  interface RecentFile {
    filename: string;
    path: string;
    modified: number;
    size: number;
    estimated_time?: number;
    filament_total?: number;
    filament_weight?: number;
    thumbnail?: string;
  }

  function formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m}m ${s}s`;
  }

  function formatDigitalTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Svelte 5 $derived runes
  let print = $derived(moonraker.state.print);
  let toolhead = $derived(moonraker.state.toolhead);
  let isIdle = $derived(print.state === 'standby' || !print.filename);
  let progressPct = $derived(Math.min(100, Math.max(0, Math.round((print.progress || 0) * 100))));
  
  let remainingTime = $derived.by(() => {
    if (print.estimated_time > 0 && print.print_duration > 0) {
      return Math.max(0, print.estimated_time - print.print_duration);
    }
    if (print.progress > 0 && print.print_duration > 0) {
      const totalEstimated = print.print_duration / print.progress;
      return Math.max(0, totalEstimated - print.print_duration);
    }
    return 0;
  });

  let etaString = $derived.by(() => {
    if (print.state !== 'printing' || remainingTime <= 0) return '—';
    const eta = new Date(Date.now() + remainingTime * 1000);
    return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  let totalLayers = $derived(print.info?.total_layer || print.layer_count || 0);

  // Prefer the layer reported by the slicer via SET_PRINT_STATS_INFO; otherwise estimate from Z.
  let currentLayer = $derived.by(() => {
    if (typeof print.info?.current_layer === 'number' && print.info.current_layer > 0) {
      return print.info.current_layer;
    }
    if (!print.layer_height || print.layer_height <= 0) return 0;
    const z = toolhead.position?.[2] || 0;
    const first = print.first_layer_height || print.layer_height;
    if (z <= first) return z > 0 ? 1 : 0;
    const layer = 1 + Math.round((z - first) / print.layer_height);
    return totalLayers ? Math.min(layer, totalLayers) : layer;
  });

  let stateLabel = $derived.by(() => {
    switch (print.state) {
      case 'printing': return i18n.t('state_printing');
      case 'paused': return i18n.t('state_paused');
      case 'complete': return i18n.t('state_complete');
      case 'error': return i18n.t('state_error');
      case 'standby': return i18n.t('state_standby');
      default: return print.state || i18n.t('state_standby');
    }
  });

  let stateColorClass = $derived.by(() => {
    switch (print.state) {
      case 'printing': return 'state-printing';
      case 'paused': return 'state-paused';
      case 'complete': return 'state-complete';
      case 'error': return 'state-error';
      default: return 'state-idle';
    }
  });

  // Recent Files (Mainsail-style for Standby mode)
  let recentFiles = $state<RecentFile[]>([]);
  let loadingRecent = $state(false);

  async function loadRecentFiles() {
    if (loadingRecent) return;
    loadingRecent = true;
    try {
      const list: any[] =
        (await moonraker.request('server.files.list', { root: 'gcodes' }, { path: '/server/files/list' })) || [];

      const sorted = list
        .filter((f: any) => f.path && !f.path.split('/').some((part: string) => part.startsWith('.')))
        .sort((a: any, b: any) => (b.modified || 0) - (a.modified || 0))
        .slice(0, 5);

      recentFiles = await Promise.all(
        sorted.map(async (f: any): Promise<RecentFile> => {
          let meta: any = null;
          try {
            meta = await moonraker.request(
              'server.files.metadata',
              { filename: f.path },
              { path: '/server/files/metadata' },
            );
          } catch (_) {
            // metadata is optional
          }
          return {
            filename: f.path,
            path: f.path,
            modified: f.modified,
            size: f.size,
            estimated_time: meta?.estimated_time,
            filament_total: meta?.filament_total,
            filament_weight: meta?.filament_weight_total,
            thumbnail: moonraker.thumbnailUrl(f.path, meta?.thumbnails, 'small'),
          };
        }),
      );
    } catch (e) {
      // No automatic retry here: the list is reloaded on the next idle/connect/file change.
      console.warn('Error loading recent files:', e);
    } finally {
      loadingRecent = false;
    }
  }

  async function handleStartRecentPrint(filepath: string) {
    if (moonraker.isPrintActive) return;
    if (await ui.confirm(i18n.t('confirm_reprint', { name: filepath }))) {
      moonraker.startPrint(filepath);
    }
  }

  async function handleCancel() {
    if (await ui.confirm(i18n.t('cancel_confirm'), { danger: true })) {
      moonraker.cancelPrint();
    }
  }

  async function handleResetFile() {
    if (await moonraker.sendGcode('SDCARD_RESET_FILE')) {
      // Klipper reports the same through print_stats; this just avoids a flicker.
      moonraker.state.print.state = 'standby';
      moonraker.state.print.filename = '';
      moonraker.state.print.thumbnail = undefined;
      moonraker.state.print.progress = 0;
    }
  }

  async function handleReprint() {
    if (!print.filename) return;
    if (await ui.confirm(i18n.t('confirm_reprint', { name: print.filename }))) {
      moonraker.startPrint(print.filename);
    }
  }

  // Load once each time the printer becomes idle, (re)connects, or the file list changes.
  // Dependencies are exactly these three values; loadRecentFiles() runs untracked so
  // its own state writes can never re-trigger this effect.
  $effect(() => {
    const shouldLoad = isIdle && moonraker.connected;
    void moonraker.filesVersion;
    if (shouldLoad) untrack(() => loadRecentFiles());
  });
</script>

<div class="card">
  <!-- Mainsail-style Header with Circle Progress & State -->
  <div class="card-header">
    <div class="header-left">
      <div class="circle-progress" style="--p: {isIdle ? 0 : progressPct}%">
        <span class="pct-text">{isIdle ? '0%' : `${progressPct}%`}</span>
      </div>
      <div class="header-status">
        <span class="status-name {stateColorClass}">{stateLabel}</span>
        {#if print.state === 'printing' && remainingTime > 0}
          <span class="sub-eta">ETA: {etaString}</span>
        {/if}
      </div>
    </div>
    
    <div class="header-actions">
      {#if print.state === 'printing'}
        <button class="btn-action btn-pause" onclick={() => moonraker.pausePrint()} title={i18n.t('pause_print')}>
          <Icon name="pause" />
        </button>
      {:else if print.state === 'paused'}
        <button class="btn-action btn-resume" onclick={() => moonraker.resumePrint()} title={i18n.t('resume_print')}>
          <Icon name="play" />
        </button>
        <button class="btn-action btn-cancel" onclick={handleCancel} title={i18n.t('cancel_print')}>
          <Icon name="stop" />
        </button>
      {:else if print.state === 'complete' || print.state === 'cancelled' || print.state === 'error'}
        <!-- Mainsail-style Clear & Reprint actions for finished print -->
        <button class="btn-action btn-clear" onclick={handleResetFile} title={i18n.t('clear_state_btn')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19.5 4.5-11 11" />
            <path d="m14 2 8 8" />
            <path d="M12 14c-1.5 1.5-2.5 3.5-3 6-2-1-4-3-5-5 2.5-.5 4.5-1.5 6-3l2 2z" />
          </svg>
        </button>

        {#if print.filename}
          <button class="btn-action btn-reprint" onclick={handleReprint} title={i18n.t('reprint_btn')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 14h12v8H6z" />
            </svg>
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if isIdle}
    <!-- MAINSAIL STANDBY MODE: 4-5 RECENT G-CODE FILES FOR INSTANT PRINT -->
    <div class="recent-files-container">
      <div class="recent-tabs-bar">
        <div class="recent-tab-item active">
          <span class="tab-icon"><Icon name="file" /></span>
          <span>{i18n.t('recent_files_title')}</span>
        </div>
      </div>

      {#if loadingRecent && recentFiles.length === 0}
        <div class="recent-empty">
          <span class="spin"><Icon name="refresh" /></span> {i18n.t('loading_recent_files')}
        </div>
      {:else if recentFiles.length === 0}
        <div class="recent-empty">
          {i18n.t('no_files')}
        </div>
      {:else}
        <div class="recent-list">
          {#each recentFiles as file (file.path)}
            <div 
              class="recent-row" 
              role="button"
              tabindex="0"
              onclick={() => handleStartRecentPrint(file.path)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStartRecentPrint(file.path); }}
              title={i18n.t('start_print_named', { name: file.filename })}
            >
              <div class="recent-thumb-box">
                {#if file.thumbnail}
                  <img src={file.thumbnail} alt="Thumbnail" class="recent-thumb-img" />
                {:else}
                  <div class="recent-thumb-fallback"><Icon name="model" /></div>
                {/if}
              </div>

              <div class="recent-meta-col">
                <div class="recent-filename" title={file.filename}>
                  {file.filename}
                </div>
                <div class="recent-subtitle">
                  {#if file.filament_total}
                    <span>{i18n.t('stat_filament')}: {(file.filament_total / 1000).toFixed(2)} m</span>
                    {#if file.filament_weight}
                      <span>/ {Math.round(file.filament_weight)} g</span>
                    {/if}
                    <span class="sep">&nbsp;|&nbsp;</span>
                  {/if}
                  <span>{i18n.t('print_time')}: {file.estimated_time ? formatTime(file.estimated_time) : '—'}</span>
                </div>
              </div>

              <span class="recent-play-btn" title={i18n.t('print_action')}>
                <Icon name="play" size={14} />
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- ACTIVE / PAUSED / COMPLETED PRINT VIEW -->
    {#if print.thumbnail}
      <div class="model-preview-card">
        <img src={print.thumbnail} alt="3D Model Preview" class="model-preview-img" />
      </div>
    {/if}

    <!-- File and Slicer Metadata Banner -->
    <div class="file-info-banner">
      <div class="file-name" title={print.filename || i18n.t('no_active_print')}>
        <Icon name="file" /> {print.filename ? print.filename : i18n.t('no_active_print')}
      </div>

      {#if print.filename}
        <div class="model-tags">
          {#if print.filament_type}
            <span class="info-tag filament"><Icon name="spool" /> {print.filament_type}</span>
          {/if}
          {#if print.layer_height}
            <span class="info-tag">{print.layer_height} mm</span>
          {/if}
          {#if totalLayers}
            <span class="info-tag">L: {currentLayer}/{totalLayers}</span>
          {/if}
          {#if print.slicer}
            <span class="info-tag slicer"><Icon name="wrench" /> {print.slicer}</span>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Progress Bar -->
    <div class="progress-bar-container">
      <div class="progress-fill" style="width: {progressPct}%"></div>
    </div>

    <!-- Telemetry Grid 1: Print Metrics -->
    <div class="telemetry-grid">
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_speed')}</span>
        <span class="stat-val font-mono">{Math.round((moonraker.state.gcode_move?.speed_factor || 1) * 100)}%</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_flow')}</span>
        <span class="stat-val font-mono">{Math.round((moonraker.state.gcode_move?.extrude_factor || 1) * 100)}%</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_filament')}</span>
        <span class="stat-val font-mono">{(print.filament_used / 1000).toFixed(2)} m</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_layer')}</span>
        <span class="stat-val font-mono">{currentLayer} {i18n.t('stat_layer_of')} {totalLayers || '—'}</span>
      </div>
    </div>

    <!-- Telemetry Grid 2: Time Readouts -->
    <div class="telemetry-grid time-grid">
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_elapsed')}</span>
        <span class="stat-val font-mono">{formatDigitalTime(print.print_duration)}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_remaining')}</span>
        <span class="stat-val font-mono highlight-cyan">{remainingTime > 0 ? formatDigitalTime(remainingTime) : '—'}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_total_est')}</span>
        <span class="stat-val font-mono">{print.estimated_time > 0 ? formatDigitalTime(print.estimated_time) : formatDigitalTime(print.total_duration)}</span>
      </div>
      <div class="stat-cell">
        <span class="stat-label">{i18n.t('stat_eta')}</span>
        <span class="stat-val font-mono highlight-amber">{etaString}</span>
      </div>
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

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .circle-progress {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: conic-gradient(#0284c7 calc(var(--p) * 1%), #282a30 0);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.2);
  }

  .circle-progress::before {
    content: '';
    position: absolute;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #1e2025;
  }

  .pct-text {
    position: relative;
    font-size: 0.65rem;
    font-weight: 700;
    color: #f3f4f6;
    font-family: monospace;
  }

  .header-status {
    display: flex;
    flex-direction: column;
  }

  .status-name {
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .state-printing { color: #38bdf8; }
  .state-paused { color: #f59e0b; }
  .state-complete { color: #22c55e; }
  .state-error { color: #ef4444; }
  .state-idle { color: #9ca3af; }

  .sub-eta {
    font-size: 0.72rem;
    color: #9ca3af;
    font-family: monospace;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-action {
    background: #23252b;
    border: 1px solid #374151;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    transition: all 0.15s ease;
  }
  .btn-pause {
    color: #f59e0b;
  }
  .btn-pause:hover {
    background: #2e323b;
    border-color: #f59e0b;
  }
  .btn-resume {
    color: #22c55e;
  }
  .btn-resume:hover {
    background: #2e323b;
    border-color: #22c55e;
  }
  .btn-cancel {
    color: #ef4444;
  }
  .btn-cancel:hover {
    background: #2e323b;
    border-color: #ef4444;
  }
  .btn-clear {
    color: #38bdf8;
  }
  .btn-clear:hover {
    background: #2e323b;
    border-color: #38bdf8;
    color: #7dd3fc;
  }
  .btn-reprint {
    color: #38bdf8;
  }
  .btn-reprint:hover {
    background: #2e323b;
    border-color: #38bdf8;
    color: #7dd3fc;
  }

  /* RECENT FILES (MAINSAIL STANDBY STYLE) */
  .recent-files-container {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 8px;
    overflow: hidden;
  }

  .recent-tabs-bar {
    display: flex;
    border-bottom: 1px solid #282a30;
    background: #18191c;
  }

  .recent-tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #38bdf8;
    border-bottom: 2px solid #38bdf8;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
  }

  .recent-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid #212328;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .recent-row:last-child {
    border-bottom: none;
  }
  .recent-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .recent-thumb-box {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
    background: #1c1d22;
    border: 1px solid #2d3139;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .recent-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .recent-thumb-fallback {
    font-size: 1rem;
  }

  .recent-meta-col {
    flex: 1;
    min-width: 0;
  }

  .recent-filename {
    font-size: 0.82rem;
    font-weight: 600;
    color: #f3f4f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-subtitle {
    font-size: 0.7rem;
    color: #9ca3af;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .recent-play-btn {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .recent-row:hover .recent-play-btn {
    background: #22c55e;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
  }

  .recent-empty {
    padding: 24px;
    text-align: center;
    font-size: 0.8rem;
    color: #6b7280;
  }

  .spin {
    display: inline-block;
    animation: rotate 1s linear infinite;
  }
  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* ACTIVE PRINT STYLES */
  .model-preview-card {
    width: 100%;
    height: 190px;
    background: #141518;
    border: 1px solid #282a30;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-bottom: 12px;
    padding: 10px;
  }

  .model-preview-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
  }

  .file-info-banner {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .file-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f3f4f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .info-tag {
    background: #23252b;
    border: 1px solid #374151;
    color: #d1d5db;
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .info-tag.filament {
    border-color: #0284c7;
    color: #38bdf8;
    background: rgba(2, 132, 199, 0.1);
  }

  .info-tag.slicer {
    border-color: #4b5563;
    color: #9ca3af;
  }

  .progress-bar-container {
    height: 4px;
    background: #282a30;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 14px;
  }

  .progress-fill {
    height: 100%;
    background: #0284c7;
    transition: width 0.3s ease;
  }

  .telemetry-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }

  .stat-cell {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 0.68rem;
    color: #9ca3af;
  }

  .stat-val {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f3f4f6;
    white-space: nowrap;
  }

  .highlight-cyan {
    color: #38bdf8;
  }

  .highlight-amber {
    color: #f59e0b;
  }

  .font-mono {
    font-family: monospace;
  }
</style>
