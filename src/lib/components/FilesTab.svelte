<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui, errorMessage } from '../ui.svelte';
  import { printCounts } from '../printCounts.svelte';
  import { ColumnSet } from '../columns.svelte';
  import ColumnPicker from './ColumnPicker.svelte';
  import MaterialTag from './MaterialTag.svelte';
  import PrintCount from './PrintCount.svelte';

  interface GcodeFile {
    path: string;
    modified: number;
    size: number;
    estimated_time?: number;
    thumbnail?: string;
    filament_type?: string;
    filament_colors?: string[];
    filament_total?: number;
    filament_weight?: number;
    layer_height?: number;
    slicer?: string;
  }

  /** Called after a print was started successfully (the app switches to the dashboard). */
  let { onPrintStarted }: { onPrintStarted?: () => void } = $props();

  const GCODE_EXT = /\.(gcode|gco|g)$/i;

  // Optional table columns (preview, filename and actions are always shown).
  const columns = new ColumnSet('moonlite_cols_files', [
    { id: 'prints', label: 'col_prints' },
    { id: 'material', label: 'col_material' },
    { id: 'layer', label: 'col_layer', visible: false },
    { id: 'filament', label: 'col_filament_plan' },
    { id: 'est', label: 'col_est_time' },
    { id: 'slicer', label: 'col_slicer', visible: false },
    { id: 'size', label: 'col_size' },
    { id: 'modified', label: 'col_modified' },
  ]);

  let files = $state<GcodeFile[]>([]);
  let loading = $state(false);
  let uploading = $state(false);
  let searchQuery = $state('');
  let sortBy = $state<'date' | 'name' | 'size' | 'prints'>('date');
  let printActive = $derived(moonraker.isPrintActive);

  // Paths whose metadata was already requested (avoids refetching on every re-sort/search).
  const metaRequested = new Set<string>();

  async function loadFiles() {
    loading = true;
    try {
      const res = await moonraker.request('server.files.list', { root: 'gcodes' }, { path: '/server/files/list' });
      if (Array.isArray(res)) {
        const known = new Map(files.map((f) => [f.path, f]));
        files = res
          .filter((f: any) => GCODE_EXT.test(f.path))
          .map((f: any) => {
            const prev = known.get(f.path);
            // Keep metadata only if the file did not change.
            if (prev && prev.modified === f.modified) return { ...prev, size: f.size };
            metaRequested.delete(f.path);
            return { path: f.path, modified: f.modified, size: f.size };
          });
      }
    } catch (e) {
      console.error('Failed to list files', e);
    } finally {
      loading = false;
    }
  }

  // Fetch metadata for the files the user actually sees first (after sort/search).
  async function loadMetadata(paths: string[]) {
    for (const path of paths) {
      try {
        const meta = await moonraker.request('server.files.metadata', { filename: path }, { path: '/server/files/metadata' });
        const f = files.find((x) => x.path === path);
        if (meta && f) {
          f.estimated_time = meta.estimated_time;
          f.thumbnail = moonraker.thumbnailUrl(path, meta.thumbnails, 'small');
          f.filament_type = meta.filament_type;
          f.filament_colors = meta.filament_colors;
          f.filament_total = meta.filament_total;
          f.filament_weight = meta.filament_weight_total;
          f.layer_height = meta.layer_height;
          f.slicer = meta.slicer;
        }
      } catch (e) {
        // metadata optional
      }
    }
  }

  // Reload on (re)connect and whenever Moonraker reports a file list change.
  $effect(() => {
    const connected = moonraker.connected;
    void moonraker.filesVersion;
    if (connected) untrack(() => loadFiles());
  });

  let filteredFiles = $derived.by(() => {
    const q = searchQuery.toLowerCase();
    let list = files.filter((f) => f.path.toLowerCase().includes(q));
    if (sortBy === 'date') {
      list.sort((a, b) => b.modified - a.modified);
    } else if (sortBy === 'name') {
      list.sort((a, b) => a.path.localeCompare(b.path));
    } else if (sortBy === 'size') {
      list.sort((a, b) => b.size - a.size);
    } else if (sortBy === 'prints') {
      const done = (f: GcodeFile) => printCounts.counts[f.path]?.completed ?? 0;
      list.sort((a, b) => done(b) - done(a) || b.modified - a.modified);
    }
    return list;
  });

  // Metadata is fetched one file at a time, in the order the user sees the list.
  $effect(() => {
    const pending = filteredFiles
      .map((f) => f.path)
      .filter((p) => !metaRequested.has(p));
    if (pending.length === 0) return;
    pending.forEach((p) => metaRequested.add(p));
    untrack(() => loadMetadata(pending));
  });

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDuration(sec?: number): string {
    if (!sec) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function startPrint(filename: string) {
    if (printActive) {
      ui.notify(i18n.t('print_already_running'), 'error');
      return;
    }
    if (await ui.confirm(i18n.t('confirm_print_start', { name: filename }))) {
      if (await moonraker.startPrint(filename)) onPrintStarted?.();
    }
  }

  async function deleteFile(filename: string) {
    if (!(await ui.confirm(i18n.t('confirm_delete', { name: filename }), { danger: true }))) return;
    try {
      await moonraker.call('server.files.delete_file', { path: `gcodes/${filename}` });
      files = files.filter((f) => f.path !== filename);
    } catch (e) {
      ui.notify(errorMessage(e), 'error');
    }
  }

  async function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const formData = new FormData();
    formData.append('root', 'gcodes');
    formData.append('file', file, file.name);

    uploading = true;
    try {
      const res = await fetch(moonraker.apiUrl('/server/files/upload'), {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        ui.notify(i18n.t('upload_done', { name: file.name }), 'success');
        await loadFiles();
      } else {
        ui.notify(`${i18n.t('upload_failed')} (HTTP ${res.status})`, 'error');
      }
    } catch (err) {
      ui.notify(`${i18n.t('upload_failed')}: ${errorMessage(err)}`, 'error');
    } finally {
      uploading = false;
      input.value = '';
    }
  }
</script>

<div class="files-view">
  <div class="toolbar">
    <div class="search-box">
      <input 
        type="text" 
        placeholder={i18n.t('search_files')} 
        bind:value={searchQuery} 
        class="input-search"
      />
    </div>

    <div class="actions-right">
      <div class="sort-selector">
        <span>{i18n.t('sort_by')}</span>
        <button class="sort-btn" class:active={sortBy === 'date'} onclick={() => sortBy = 'date'}>{i18n.t('sort_date')}</button>
        <button class="sort-btn" class:active={sortBy === 'name'} onclick={() => sortBy = 'name'}>{i18n.t('sort_name')}</button>
        <button class="sort-btn" class:active={sortBy === 'size'} onclick={() => sortBy = 'size'}>{i18n.t('sort_size')}</button>
        <button class="sort-btn" class:active={sortBy === 'prints'} onclick={() => sortBy = 'prints'}>{i18n.t('col_prints')}</button>
      </div>

      <ColumnPicker {columns} />

      <label class="btn btn-primary btn-upload" class:busy={uploading}>
        <Icon name="upload" /> {uploading ? i18n.t('uploading') : i18n.t('upload_gcode')}
        <input type="file" accept=".gcode,.gco,.g" disabled={uploading} onchange={handleFileUpload} style="display:none" />
      </label>

      <button class="btn btn-secondary btn-icon" onclick={loadFiles} title={i18n.t('refresh')}>
        <Icon name="refresh" />
      </button>
    </div>
  </div>

  {#if loading && files.length === 0}
    <div class="loading-state">{i18n.t('loading_files')}</div>
  {:else if filteredFiles.length === 0}
    <div class="empty-state">{i18n.t('no_files')}</div>
  {:else}
    <div class="table-responsive">
      <table class="files-table">
        <thead>
          <tr>
            <th class="th-preview">{i18n.t('col_preview')}</th>
            <th>{i18n.t('col_filename')}</th>
            {#if columns.has('prints')}<th>{i18n.t('col_prints')}</th>{/if}
            {#if columns.has('material')}<th>{i18n.t('col_material')}</th>{/if}
            {#if columns.has('layer')}<th>{i18n.t('col_layer')}</th>{/if}
            {#if columns.has('filament')}<th>{i18n.t('col_filament_plan')}</th>{/if}
            {#if columns.has('est')}<th>{i18n.t('col_est_time')}</th>{/if}
            {#if columns.has('slicer')}<th>{i18n.t('col_slicer')}</th>{/if}
            {#if columns.has('size')}<th>{i18n.t('col_size')}</th>{/if}
            {#if columns.has('modified')}<th>{i18n.t('col_modified')}</th>{/if}
            <th class="text-right">{i18n.t('col_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredFiles as file (file.path)}
            <tr class="file-row" class:active-print={moonraker.state.print.filename === file.path}>
              <td class="td-preview">
                {#if file.thumbnail}
                  <img src={file.thumbnail} alt={i18n.t('col_preview')} class="thumb-img" />
                {:else}
                  <div class="thumb-fallback"><Icon name="model" /></div>
                {/if}
              </td>

              <td class="td-filename">
                <div class="file-title" title={file.path}>{file.path}</div>
              </td>

              {#if columns.has('prints')}
                <td><PrintCount filename={file.path} /></td>
              {/if}
              {#if columns.has('material')}
                <td><MaterialTag type={file.filament_type} colors={file.filament_colors} /></td>
              {/if}
              {#if columns.has('layer')}
                <td class="font-mono">{file.layer_height ? `${file.layer_height} mm` : '—'}</td>
              {/if}
              {#if columns.has('filament')}
                <td class="font-mono">
                  {#if file.filament_weight}
                    <div>{file.filament_weight.toFixed(1)} g</div>
                  {/if}
                  {#if file.filament_total}
                    <div class="text-muted sub">{(file.filament_total / 1000).toFixed(2)} m</div>
                  {:else if !file.filament_weight}
                    <span class="text-muted">—</span>
                  {/if}
                </td>
              {/if}
              {#if columns.has('est')}
                <td class="font-mono est">{file.estimated_time ? formatDuration(file.estimated_time) : '—'}</td>
              {/if}
              {#if columns.has('slicer')}
                <td class="text-muted">{file.slicer ?? '—'}</td>
              {/if}
              {#if columns.has('size')}
                <td class="font-mono text-muted">{formatSize(file.size)}</td>
              {/if}
              {#if columns.has('modified')}
                <td class="font-mono text-muted">{formatDate(file.modified)}</td>
              {/if}

              <td class="td-actions">
                <div class="file-actions">
                  {#if moonraker.state.print.filename === file.path && printActive}
                    <span class="printing-pill">{i18n.t('printing_now')}</span>
                  {:else}
                    <button
                      class="btn btn-success btn-sm"
                      disabled={printActive}
                      onclick={() => startPrint(file.path)}
                    >
                      <Icon name="play" /> {i18n.t('print_action')}
                    </button>
                  {/if}

                  <button
                    class="btn-delete"
                    onclick={() => deleteFile(file.path)}
                    title={i18n.t('delete_action')}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .btn-upload.busy {
    opacity: 0.6;
    pointer-events: none;
  }

  .files-view {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    background: #18191c;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #282a30;
  }

  .search-box {
    flex: 1;
    min-width: 250px;
  }

  .input-search {
    width: 100%;
    background: #121316;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .input-search:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .actions-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sort-selector {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    color: #9ca3af;
  }

  .sort-btn {
    background: none;
    border: 1px solid transparent;
    color: #9ca3af;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .sort-btn.active {
    background: #23252b;
    border-color: #374151;
    color: #38bdf8;
    font-weight: 600;
  }

  .btn-upload {
    cursor: pointer;
    user-select: none;
  }

  .table-responsive {
    overflow-x: auto;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
  }

  .files-table {
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
    white-space: nowrap;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid #25272e;
    vertical-align: middle;
    color: #e5e7eb;
    white-space: nowrap;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }

  .file-row:hover {
    background: #1f2126;
  }
  .file-row.active-print {
    background: rgba(2, 132, 199, 0.08);
    box-shadow: inset 3px 0 0 #0284c7;
  }

  .th-preview, .td-preview {
    width: 56px;
  }

  .thumb-img,
  .thumb-fallback {
    width: 44px;
    height: 44px;
    border-radius: 6px;
    background: #111215;
    border: 1px solid #282a30;
    display: flex;
    align-items: center;
    justify-content: center;
    object-fit: contain;
  }

  .thumb-fallback {
    font-size: 1.3rem;
    opacity: 0.5;
  }

  /* Takes the space left by the other columns; long names are ellipsized. */
  .td-filename {
    width: 100%;
    max-width: 0;
    min-width: 180px;
  }

  .file-title {
    font-size: 0.9rem;
    font-weight: 500;
    color: #f3f4f6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sub {
    font-size: 0.7rem;
  }

  .est {
    color: #38bdf8;
  }

  .text-muted { color: #9ca3af; }
  .text-right { text-align: right; }
  .font-mono { font-family: monospace; }

  .td-actions {
    width: 1%;
  }

  .file-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .printing-pill {
    font-size: 0.75rem;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .btn-delete {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 1rem;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
  }
  .btn-delete:hover {
    color: #ef4444;
    background: #282a30;
  }

  .loading-state, .empty-state {
    text-align: center;
    padding: 40px;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .btn {
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s ease;
  }
  .btn-sm { padding: 6px 10px; font-size: 0.8rem; }
  .btn-primary { background: #0284c7; color: white; }
  .btn-primary:hover { background: #0369a1; }
  .btn-secondary { background: #374151; color: white; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-success { background: #16a34a; color: white; }
  .btn-success:hover:not(:disabled) { background: #15803d; }
  .btn-success:disabled { background: #374151; color: #6b7280; cursor: not-allowed; }
</style>
