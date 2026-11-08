<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui, errorMessage } from '../ui.svelte';

  interface HistoryThumbnail {
    width: number;
    height: number;
    size: number;
    relative_path: string;
  }

  interface HistoryMetadata {
    slicer?: string;
    slicer_version?: string;
    filament_name?: string;
    filament_type?: string;
    estimated_time?: number;
    layer_height?: number;
    layer_count?: number;
    filament_weight_total?: number;
    thumbnails?: HistoryThumbnail[];
  }

  interface AuxiliaryData {
    provider: string;
    name: string;
    value: any;
  }

  interface HistoryJob {
    job_id: string;
    filename: string;
    status: 'completed' | 'cancelled' | 'in_progress' | 'error';
    start_time: number;
    end_time: number | null;
    print_duration: number;
    total_duration: number;
    filament_used: number;
    metadata: HistoryMetadata;
    auxiliary_data?: AuxiliaryData[];
    exists: boolean;
  }

  interface JobTotals {
    total_jobs: number;
    total_time: number;
    total_print_time: number;
    total_filament_used: number;
    longest_job: number;
    longest_print: number;
  }

  let totals = $state<JobTotals | null>(null);
  let allRecentJobs = $state<HistoryJob[]>([]);
  let jobs = $state<HistoryJob[]>([]);
  let loading = $state(false);

  // Filters & Pagination
  let searchQuery = $state('');
  let statusFilter = $state<'all' | 'completed' | 'cancelled'>('all');
  let currentPage = $state(1);
  const pageSize = 25;
  /** How many recent jobs feed the charts and the search/filter view. */
  const RECENT_LIMIT = 200;
  let totalJobsCount = $state(0);

  // Chart Metric Toggle
  let chartMetric = $state<'filament' | 'time'>('filament');

  // Formatters
  function formatDuration(sec: number): string {
    if (!sec || isNaN(sec) || sec <= 0) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatShortDate(timestamp: number): string {
    if (!timestamp) return '—';
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatFilament(mm: number): string {
    if (!mm || isNaN(mm)) return '0.00 m';
    const meters = mm / 1000;
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(2)} m`;
  }

  function getThumbnailUrl(job: HistoryJob): string | undefined {
    return moonraker.thumbnailUrl(job.filename, job.metadata?.thumbnails, 'small');
  }

  async function loadData() {
    loading = true;
    try {
      const totalsRes = await moonraker.request('server.history.totals', {}, { path: '/server/history/totals' });
      const jobTotals: JobTotals | undefined = totalsRes?.job_totals;
      if (jobTotals) {
        totals = jobTotals;
        totalJobsCount = jobTotals.total_jobs;
      }

      const start = (currentPage - 1) * pageSize;
      const listRes = await moonraker.request(
        'server.history.list',
        { limit: pageSize, start },
        { path: '/server/history/list' },
      );
      if (listRes?.jobs) {
        jobs = listRes.jobs;
        if (listRes.count) totalJobsCount = listRes.count;
      }

      const recentRes = await moonraker.request(
        'server.history.list',
        { limit: RECENT_LIMIT, start: 0 },
        { path: '/server/history/list' },
      );
      if (recentRes?.jobs) allRecentJobs = recentRes.jobs;
    } catch (e) {
      console.error('Error loading history:', e);
    } finally {
      loading = false;
    }
  }

  let isFiltering = $derived(statusFilter !== 'all' || searchQuery.trim() !== '');

  // Filtered jobs in current table view
  // Without a filter: the current server-side page. With a search/filter: the
  // last RECENT_LIMIT jobs, so matches are not limited to one page of 25.
  let filteredJobs = $derived.by(() => {
    if (!isFiltering) return jobs;
    let list = allRecentJobs;
    if (statusFilter !== 'all') {
      list = list.filter(j => j.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(j => 
        j.filename.toLowerCase().includes(q) ||
        (j.metadata?.slicer && j.metadata.slicer.toLowerCase().includes(q)) ||
        (j.metadata?.filament_name && j.metadata.filament_name.toLowerCase().includes(q))
      );
    }
    return list;
  });

  // Calculate Status Counts & Donut Values from all recent jobs
  let statusBreakdown = $derived.by(() => {
    const list = allRecentJobs.length > 0 ? allRecentJobs : jobs;
    let completed = 0;
    let cancelled = 0;
    let other = 0;

    for (const j of list) {
      if (j.status === 'completed') completed++;
      else if (j.status === 'cancelled') cancelled++;
      else other++;
    }

    const total = completed + cancelled + other;
    const completedPct = total > 0 ? (completed / total) * 100 : 0;
    const cancelledPct = total > 0 ? (cancelled / total) * 100 : 0;
    const otherPct = total > 0 ? (other / total) * 100 : 0;

    return {
      completed,
      cancelled,
      other,
      total,
      completedPct,
      cancelledPct,
      otherPct,
    };
  });

  // Calculate Daily Activity Bars (Past 7–10 days)
  let dailyStats = $derived.by(() => {
    const map = new Map<string, { label: string; filamentM: number; timeH: number; count: number; dateTs: number }>();
    const list = allRecentJobs.length > 0 ? allRecentJobs : jobs;

    // Group jobs by date (YYYY-MM-DD)
    for (const j of list) {
      if (!j.start_time) continue;
      const d = new Date(j.start_time * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      
      const current = map.get(key) || { label, filamentM: 0, timeH: 0, count: 0, dateTs: j.start_time };
      current.filamentM += (j.filament_used || 0) / 1000;
      current.timeH += (j.print_duration || 0) / 3600;
      current.count += 1;
      map.set(key, current);
    }

    // Sort by date ascending and take last 8 days
    const sorted = Array.from(map.entries())
      .map(([_, v]) => v)
      .sort((a, b) => a.dateTs - b.dateTs)
      .slice(-8);

    const maxFilament = Math.max(...sorted.map(s => s.filamentM), 10);
    const maxTime = Math.max(...sorted.map(s => s.timeH), 2);

    return {
      bars: sorted,
      maxFilament,
      maxTime,
    };
  });

  // Average Print Time
  let avgPrintTime = $derived.by(() => {
    if (!totals || !totals.total_jobs || totals.total_jobs === 0) return '0s';
    const avgSec = totals.total_print_time / totals.total_jobs;
    return formatDuration(avgSec);
  });

  // Total pages
  let totalPages = $derived(Math.max(1, Math.ceil(totalJobsCount / pageSize)));

  function goToPage(p: number) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    loadData();
  }

  async function handleReprint(filename: string) {
    if (await ui.confirm(i18n.t('confirm_reprint', { name: filename }))) {
      if (await moonraker.startPrint(filename)) {
        ui.notify(i18n.t('print_started', { name: filename }), 'success');
      }
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!(await ui.confirm(i18n.t('confirm_delete_history'), { danger: true }))) return;
    try {
      // Falls back to HTTP only while the WebSocket is down; throws on any failure.
      await moonraker.request('server.history.delete_job', { uid: jobId }, { verb: 'DELETE', path: '/server/history/job' });
      jobs = jobs.filter(j => j.job_id !== jobId);
      allRecentJobs = allRecentJobs.filter(j => j.job_id !== jobId);
      if (totalJobsCount > 0) totalJobsCount--;
    } catch (e) {
      ui.notify(errorMessage(e), 'error');
    }
  }

  $effect(() => {
    if (moonraker.connected) untrack(() => loadData());
  });
</script>

<div class="history-page">
  <!-- TOP SECTION: MAISAIL-STYLE STATISTICS CARD -->
  <div class="stats-card">
    <div class="card-header">
      <div class="title-with-icon">
        <span class="icon"><Icon name="chart" /></span>
        <h3>{i18n.t('stats_title')}</h3>
      </div>
      <button class="btn-refresh" onclick={loadData} title={i18n.t('refresh')} disabled={loading}>
        <span class:spin={loading}><Icon name="refresh" /></span>
      </button>
    </div>

    <div class="stats-grid">
      <!-- 1. LEFT: KEY PERFORMANCE INDICATORS (KPIs) -->
      <div class="stats-col-kpi">
        <div class="kpi-row">
          <span class="kpi-label">{i18n.t('total_print_time')}</span>
          <span class="kpi-val font-mono">{totals ? formatDuration(totals.total_print_time) : '...'}</span>
        </div>
        <div class="kpi-row">
          <span class="kpi-label">{i18n.t('longest_print')}</span>
          <span class="kpi-val font-mono">{totals ? formatDuration(totals.longest_print) : '...'}</span>
        </div>
        <div class="kpi-row">
          <span class="kpi-label">{i18n.t('avg_print_time')}</span>
          <span class="kpi-val font-mono">{avgPrintTime}</span>
        </div>
        <div class="kpi-row">
          <span class="kpi-label">{i18n.t('total_filament')}</span>
          <span class="kpi-val font-mono">{totals ? formatFilament(totals.total_filament_used) : '...'}</span>
        </div>
        <div class="kpi-row">
          <span class="kpi-label">{i18n.t('total_jobs')}</span>
          <span class="kpi-val font-mono font-accent">{totals ? totals.total_jobs : '...'}</span>
        </div>
      </div>

      <!-- 2. CENTER: STATUS DONUT CHART -->
      <div class="stats-col-donut">
        <div class="donut-chart-box">
          <svg width="110" height="110" viewBox="0 0 100 100" class="donut-svg">
            <!-- Background circle -->
            <circle cx="50" cy="50" r="38" fill="none" stroke="#25272e" stroke-width="12" />
            
            <!-- Error / other slice (after completed + cancelled) -->
            {#if statusBreakdown.otherPct > 0}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#f59e0b"
                stroke-width="12"
                stroke-dasharray="{(statusBreakdown.otherPct / 100) * 238.7} 238.7"
                stroke-dashoffset="{-((statusBreakdown.completedPct + statusBreakdown.cancelledPct) / 100) * 238.7}"
                transform="rotate(-90 50 50)"
              />
            {/if}

            <!-- Cancelled slice (after completed) -->
            {#if statusBreakdown.cancelledPct > 0}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="none"
                stroke="#ef4444"
                stroke-width="12"
                stroke-dasharray="{(statusBreakdown.cancelledPct / 100) * 238.7} 238.7"
                stroke-dashoffset="{-(statusBreakdown.completedPct / 100) * 238.7}"
                transform="rotate(-90 50 50)"
              />
            {/if}

            <!-- Completed slice -->
            <circle 
              cx="50" 
              cy="50" 
              r="38" 
              fill="none" 
              stroke="#22c55e" 
              stroke-width="12"
              stroke-dasharray="{(statusBreakdown.completedPct / 100) * 238.7} 238.7"
              stroke-dashoffset="0"
              transform="rotate(-90 50 50)"
            />

            <!-- Center text -->
            <text x="50" y="47" text-anchor="middle" class="donut-pct font-mono">
              {statusBreakdown.completedPct.toFixed(0)}%
            </text>
            <text x="50" y="62" text-anchor="middle" class="donut-lbl">
              OK
            </text>
          </svg>

          <!-- Legend -->
          <div class="donut-legend">
            <div class="legend-row">
              <span class="dot dot-completed"></span>
              <span class="legend-name">{i18n.t('status_completed')}:</span>
              <strong class="font-mono">{statusBreakdown.completed}</strong>
            </div>
            <div class="legend-row">
              <span class="dot dot-cancelled"></span>
              <span class="legend-name">{i18n.t('status_cancelled')}:</span>
              <strong class="font-mono">{statusBreakdown.cancelled}</strong>
            </div>
            {#if statusBreakdown.other > 0}
              <div class="legend-row">
                <span class="dot dot-error"></span>
                <span class="legend-name">{i18n.t('status_error')}:</span>
                <strong class="font-mono">{statusBreakdown.other}</strong>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- 3. RIGHT: RECENT DAILY ACTIVITY BAR CHART -->
      <div class="stats-col-chart">
        <div class="chart-header">
          <span class="chart-title">{i18n.t('daily_activity')}</span>
          <div class="chart-toggles">
            <button 
              class="toggle-btn" 
              class:active={chartMetric === 'filament'} 
              onclick={() => chartMetric = 'filament'}
            >
              {i18n.t('chart_filament')}
            </button>
            <button 
              class="toggle-btn" 
              class:active={chartMetric === 'time'} 
              onclick={() => chartMetric = 'time'}
            >
              {i18n.t('chart_time')}
            </button>
          </div>
        </div>

        <div class="bar-chart-container">
          {#if dailyStats.bars.length > 0}
            <div class="bars-flex">
              {#each dailyStats.bars as bar}
                {@const val = chartMetric === 'filament' ? bar.filamentM : bar.timeH}
                {@const maxVal = chartMetric === 'filament' ? dailyStats.maxFilament : dailyStats.maxTime}
                {@const heightPct = Math.min(100, Math.max(10, Math.round((val / maxVal) * 85)))}
                <div class="bar-col" title={`${bar.label}: ${chartMetric === 'filament' ? `${bar.filamentM.toFixed(1)}m` : `${bar.timeH.toFixed(1)}h`} (${i18n.t('jobs_count', { count: bar.count })})`}>
                  <div class="bar-track">
                    <div 
                      class="bar-fill" 
                      class:bar-filament={chartMetric === 'filament'}
                      class:bar-time={chartMetric === 'time'}
                      style="height: {heightPct}%"
                    ></div>
                  </div>
                  <span class="bar-label">{bar.label}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="chart-empty">{i18n.t('no_history_records')}</div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- BOTTOM SECTION: MAISAIL-STYLE PRINT HISTORY TABLE -->
  <div class="history-table-card">
    <div class="table-header">
      <div class="table-title-group">
        <span class="icon"><Icon name="list" /></span>
        <h3>{i18n.t('history_title')}</h3>
        <span class="count-badge font-mono">{totalJobsCount}</span>
      </div>

      <!-- Search & Status Filter Pills -->
      <div class="table-controls">
        <div class="search-box">
          <span class="search-icon"><Icon name="search" /></span>
          <input 
            type="text" 
            bind:value={searchQuery} 
            placeholder={i18n.t('search_history_placeholder')} 
            class="search-input"
          />
          {#if searchQuery}
            <button class="clear-search" onclick={() => searchQuery = ''}><Icon name="close" /></button>
          {/if}
        </div>

        <div class="filter-pills">
          <button 
            class="pill" 
            class:active={statusFilter === 'all'} 
            onclick={() => statusFilter = 'all'}
          >
            {i18n.t('filter_all')}
          </button>
          <button 
            class="pill" 
            class:active={statusFilter === 'completed'} 
            onclick={() => statusFilter = 'completed'}
          >
            {i18n.t('filter_completed')}
          </button>
          <button 
            class="pill" 
            class:active={statusFilter === 'cancelled'} 
            onclick={() => statusFilter = 'cancelled'}
          >
            {i18n.t('filter_cancelled')}
          </button>
        </div>
      </div>
    </div>

    <!-- The History Table -->
    <div class="table-responsive">
      <table class="history-table">
        <thead>
          <tr>
            <th class="th-preview">{i18n.t('col_preview')}</th>
            <th class="th-filename">{i18n.t('col_filename')}</th>
            <th class="th-status">{i18n.t('col_status')}</th>
            <th class="th-date">{i18n.t('col_date')}</th>
            <th class="th-est">{i18n.t('col_est_time')}</th>
            <th class="th-actual">{i18n.t('col_print_time')}</th>
            <th class="th-filament">{i18n.t('col_filament')}</th>
            <th class="th-slicer">{i18n.t('col_slicer')}</th>
            <th class="th-actions text-right">{i18n.t('col_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#if loading && jobs.length === 0}
            <tr>
              <td colspan="9" class="td-empty">
                <span class="spin"><Icon name="refresh" /></span> {i18n.t('loading_history')}
              </td>
            </tr>
          {:else if filteredJobs.length === 0}
            <tr>
              <td colspan="9" class="td-empty">
                {i18n.t('no_history_records')}
              </td>
            </tr>
          {:else}
            {#each filteredJobs as job (job.job_id)}
              {@const thumbUrl = getThumbnailUrl(job)}
              <tr class="job-row">
                <!-- 1. 3D Model Thumbnail -->
                <td class="td-preview">
                  {#if thumbUrl}
                    <img src={thumbUrl} alt={i18n.t('col_preview')} class="job-thumb" />
                  {:else}
                    <div class="thumb-placeholder"><Icon name="model" /></div>
                  {/if}
                </td>

                <!-- 2. Filename & Spool Tag -->
                <td class="td-filename">
                  <div class="file-name-line" title={job.filename}>
                    {job.filename}
                  </div>
                  {#if job.metadata?.filament_name}
                    <div class="sub-filament-tag">
                      <Icon name="spool" /> {job.metadata.filament_name}{job.metadata.filament_type ? ` (${job.metadata.filament_type})` : ''}
                    </div>
                  {/if}
                </td>

                <!-- 3. Status Badge -->
                <td class="td-status">
                  {#if job.status === 'completed'}
                    <span class="badge badge-completed"><Icon name="check" /> {i18n.t('status_completed')}</span>
                  {:else if job.status === 'cancelled'}
                    <span class="badge badge-cancelled"><Icon name="close" /> {i18n.t('status_cancelled')}</span>
                  {:else if job.status === 'in_progress'}
                    <span class="badge badge-progress"><Icon name="hourglass" /> {i18n.t('status_in_progress')}</span>
                  {:else}
                    <span class="badge badge-error"><Icon name="alert" /> {i18n.t('status_error')}</span>
                  {/if}
                </td>

                <!-- 4. Date & Time -->
                <td class="td-date font-mono">
                  {formatShortDate(job.start_time)}
                </td>

                <!-- 5. Estimated Time -->
                <td class="td-est font-mono text-muted">
                  {job.metadata?.estimated_time ? formatDuration(job.metadata.estimated_time) : '—'}
                </td>

                <!-- 6. Actual Print Time -->
                <td class="td-actual font-mono">
                  <span class="actual-time">{formatDuration(job.print_duration)}</span>
                  {#if job.metadata?.estimated_time && job.print_duration > 0}
                    {@const diff = Math.round(job.print_duration - job.metadata.estimated_time)}
                    {#if Math.abs(diff) >= 60}
                      <span class="diff-tag" class:diff-plus={diff > 0} class:diff-minus={diff < 0}>
                        {diff > 0 ? `+${Math.round(diff / 60)}m` : `${Math.round(diff / 60)}m`}
                      </span>
                    {/if}
                  {/if}
                </td>

                <!-- 7. Filament Used (Length & Weight) -->
                <td class="td-filament font-mono">
                  <div>{formatFilament(job.filament_used)}</div>
                  {#if job.metadata?.filament_weight_total}
                    <div class="sub-weight text-muted">{job.metadata.filament_weight_total.toFixed(1)}g</div>
                  {/if}
                </td>

                <!-- 8. Slicer Tag -->
                <td class="td-slicer text-muted">
                  {#if job.metadata?.slicer}
                    <span class="slicer-pill">
                      {job.metadata.slicer} {job.metadata.slicer_version || ''}
                    </span>
                  {:else}
                    —
                  {/if}
                </td>

                <!-- 9. Actions (Reprint & Delete) -->
                <td class="td-actions text-right">
                  <div class="actions-group">
                    <button 
                      class="btn-action-reprint" 
                      title={i18n.t('reprint_btn')} 
                      onclick={() => handleReprint(job.filename)}
                      disabled={moonraker.isPrintActive || !job.exists}
                    >
                      <Icon name="printer" />
                    </button>
                    <button 
                      class="btn-action-delete" 
                      title={i18n.t('delete_entry_btn')} 
                      onclick={() => handleDeleteJob(job.job_id)}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    {#if isFiltering}
      <div class="pagination-footer">
        <span class="pagination-info">{i18n.t('search_recent_hint', { count: RECENT_LIMIT })}</span>
      </div>
    {:else if totalPages > 1}
      <div class="pagination-footer">
        <span class="pagination-info">
          {i18n.t('showing_records', {
            from: (currentPage - 1) * pageSize + 1,
            to: Math.min(currentPage * pageSize, totalJobsCount),
            total: totalJobsCount
          })}
        </span>
        <div class="pagination-buttons">
          <button 
            class="page-nav-btn" 
            disabled={currentPage <= 1} 
            onclick={() => goToPage(currentPage - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          
          <span class="page-current font-mono">
            {currentPage} / {totalPages}
          </span>

          <button 
            class="page-nav-btn" 
            disabled={currentPage >= totalPages} 
            onclick={() => goToPage(currentPage + 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .history-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }

  /* TOP STATISTICS CARD */
  .stats-card {
    background: #1e2025;
    border: 1px solid #282a30;
    border-radius: 10px;
    padding: 16px 20px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title-with-icon .icon {
    font-size: 1.1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #f3f4f6;
  }

  .btn-refresh {
    background: #151619;
    border: 1px solid #282a30;
    color: #9ca3af;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .btn-refresh:hover:not(:disabled) {
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .spin {
    display: inline-block;
    animation: rotate 1s linear infinite;
  }
  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1.7fr;
    gap: 20px;
    align-items: center;
  }

  @media (max-width: 1100px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }

  /* 1. KPIs */
  .stats-col-kpi {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 12px 16px;
  }

  .kpi-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
  }

  .kpi-label {
    color: #9ca3af;
  }

  .kpi-val {
    color: #f3f4f6;
    font-weight: 600;
  }

  .font-accent {
    color: #38bdf8;
  }

  /* 2. DONUT */
  .stats-col-donut {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 12px 16px;
    height: 100%;
  }

  .donut-chart-box {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .donut-svg {
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
  }

  .donut-pct {
    fill: #ffffff;
    font-size: 15px;
    font-weight: 700;
  }

  .donut-lbl {
    fill: #9ca3af;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: #9ca3af;
  }

  .legend-row strong {
    color: #f3f4f6;
    margin-left: 2px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot-completed { background: #22c55e; }
  .dot-cancelled { background: #ef4444; }
  .dot-error { background: #f59e0b; }

  /* 3. BAR CHART */
  .stats-col-chart {
    display: flex;
    flex-direction: column;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 12px 16px;
    height: 100%;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .chart-title {
    font-size: 0.8rem;
    color: #9ca3af;
    font-weight: 600;
  }

  .chart-toggles {
    display: flex;
    background: #1e2025;
    border-radius: 4px;
    padding: 2px;
    border: 1px solid #282a30;
  }

  .toggle-btn {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .toggle-btn.active {
    background: #2b2e36;
    color: #38bdf8;
    font-weight: 600;
  }

  .bar-chart-container {
    flex: 1;
    display: flex;
    align-items: flex-end;
    min-height: 90px;
  }

  .bars-flex {
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 6px;
    height: 85px;
  }

  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    cursor: pointer;
  }

  .bar-track {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 4px;
  }

  .bar-fill {
    width: 70%;
    max-width: 18px;
    border-radius: 3px 3px 0 0;
    transition: height 0.3s ease, filter 0.15s ease;
  }
  .bar-fill:hover {
    filter: brightness(1.25);
  }
  .bar-filament {
    background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%);
  }
  .bar-time {
    background: linear-gradient(180deg, #a855f7 0%, #7e22ce 100%);
  }

  .bar-label {
    font-size: 0.65rem;
    color: #6b7280;
    white-space: nowrap;
  }

  .chart-empty {
    width: 100%;
    text-align: center;
    color: #6b7280;
    font-size: 0.8rem;
    padding: 20px;
  }

  /* BOTTOM HISTORY TABLE CARD */
  .history-table-card {
    background: #1e2025;
    border: 1px solid #282a30;
    border-radius: 10px;
    padding: 16px 20px;
  }

  .table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }

  .table-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .count-badge {
    background: #151619;
    border: 1px solid #282a30;
    color: #38bdf8;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .table-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    font-size: 0.8rem;
    color: #6b7280;
    pointer-events: none;
  }

  .search-input {
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    color: #f3f4f6;
    font-size: 0.82rem;
    padding: 6px 28px 6px 30px;
    width: 240px;
    transition: all 0.15s ease;
  }
  .search-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .clear-search {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .filter-pills {
    display: flex;
    background: #151619;
    border: 1px solid #282a30;
    border-radius: 6px;
    padding: 2px;
  }

  .pill {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .pill.active {
    background: #2b2e36;
    color: #f3f4f6;
    font-weight: 600;
  }

  /* TABLE */
  .table-responsive {
    overflow-x: auto;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    text-align: left;
  }

  th {
    background: #151619;
    color: #9ca3af;
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 10px 12px;
    border-bottom: 1px solid #282a30;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid #25272e;
    vertical-align: middle;
  }

  .job-row:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .th-preview, .td-preview {
    width: 50px;
    text-align: center;
  }

  .job-thumb {
    width: 42px;
    height: 42px;
    border-radius: 6px;
    object-fit: cover;
    background: #151619;
    border: 1px solid #282a30;
  }

  .thumb-placeholder {
    width: 42px;
    height: 42px;
    border-radius: 6px;
    background: #151619;
    border: 1px solid #282a30;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
  }

  .td-filename {
    max-width: 280px;
  }

  .file-name-line {
    font-weight: 600;
    color: #f3f4f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub-filament-tag {
    font-size: 0.7rem;
    color: #9ca3af;
    margin-top: 2px;
  }

  /* BADGES */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .badge-completed {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }
  .badge-cancelled {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  .badge-progress {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }
  .badge-error {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .diff-tag {
    font-size: 0.68rem;
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 4px;
  }
  .diff-plus {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
  .diff-minus {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .sub-weight {
    font-size: 0.7rem;
  }

  .slicer-pill {
    background: #151619;
    border: 1px solid #282a30;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
  }

  .actions-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .btn-action-reprint, .btn-action-delete {
    background: #151619;
    border: 1px solid #282a30;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }
  .btn-action-reprint:hover:not(:disabled) {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }
  .btn-action-reprint:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-action-delete:hover {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .td-empty {
    text-align: center;
    padding: 30px;
    color: #6b7280;
  }

  /* PAGINATION */
  .pagination-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #25272e;
    font-size: 0.8rem;
    color: #9ca3af;
  }

  .pagination-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-nav-btn {
    background: #151619;
    border: 1px solid #282a30;
    color: #f3f4f6;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    transition: all 0.15s ease;
  }
  .page-nav-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #38bdf8;
  }
  .page-nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .text-right { text-align: right; }
  .text-muted { color: #9ca3af; }
  .font-mono { font-family: monospace; }
</style>
