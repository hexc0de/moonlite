<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui, errorMessage } from '../ui.svelte';

  interface GcodeFile {
    path: string;
    modified: number;
    size: number;
    estimated_time?: number;
    thumbnail?: string;
  }

  const GCODE_EXT = /\.(gcode|gco|g)$/i;
  const METADATA_BATCH = 40;

  let files = $state<GcodeFile[]>([]);
  let loading = $state(false);
  let uploading = $state(false);
  let searchQuery = $state('');
  let sortBy = $state<'date' | 'name' | 'size'>('date');
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
    }
    return list;
  });

  $effect(() => {
    const pending = filteredFiles
      .slice(0, METADATA_BATCH)
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
      moonraker.startPrint(filename);
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
      </div>

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
    <div class="files-grid">
      {#each filteredFiles as file (file.path)}
        <div class="file-card" class:active-print={moonraker.state.print.filename === file.path}>
          <div class="thumb-container">
            {#if file.thumbnail}
              <img src={file.thumbnail} alt="3D preview" class="thumb-img" />
            {:else}
              <div class="thumb-fallback"><Icon name="model" /></div>
            {/if}
          </div>

          <div class="file-details">
            <div class="file-title" title={file.path}>
              {file.path}
            </div>

            <div class="file-meta">
              <span>{formatSize(file.size)}</span>
              <span>•</span>
              <span>{formatDate(file.modified)}</span>
              {#if file.estimated_time}
                <span>•</span>
                <span class="est-badge"><Icon name="clock" /> {formatDuration(file.estimated_time)}</span>
              {/if}
            </div>
          </div>

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
        </div>
      {/each}
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

  .files-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    padding: 10px 14px;
    transition: background 0.15s ease;
  }
  .file-card:hover {
    background: #1f2126;
  }
  .file-card.active-print {
    border-color: #0284c7;
    background: rgba(2, 132, 199, 0.08);
  }

  .thumb-container {
    width: 52px;
    height: 52px;
    border-radius: 6px;
    background: #111215;
    border: 1px solid #282a30;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .thumb-fallback {
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .file-details {
    flex: 1;
    min-width: 0;
  }

  .file-title {
    font-size: 0.95rem;
    font-weight: 500;
    color: #f3f4f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .est-badge {
    color: #38bdf8;
    font-weight: 500;
  }

  .file-actions {
    display: flex;
    align-items: center;
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
