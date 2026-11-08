<script lang="ts">
  import Icon from './Icon.svelte';
  import { untrack } from 'svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { ui, errorMessage } from '../ui.svelte';

  interface ConfigFile {
    path: string;
    size: number;
    modified: number;
  }

  let configFiles = $state<ConfigFile[]>([]);
  /** File whose content is currently in the editor ('' = nothing loaded yet). */
  let selectedFile = $state('');
  let fileContent = $state('');
  let isDirty = $state(false);
  let loadingList = $state(false);
  let loadingContent = $state(false);
  let saving = $state(false);

  let isPrinting = $derived(moonraker.isPrinting);
  let printActive = $derived(moonraker.isPrintActive);

  // Let App guard tab switches / page unload while there are unsaved edits.
  $effect(() => {
    ui.configDirty = isDirty;
    return () => {
      ui.configDirty = false;
    };
  });

  async function loadFileList() {
    loadingList = true;
    try {
      const res = await moonraker.request('server.files.list', { root: 'config' }, { path: '/server/files/list' });
      if (Array.isArray(res)) {
        configFiles = res.filter((f: any) => /\.(cfg|conf|ini)$/i.test(f.path));
        // Only pick an initial file once; a reconnect must not replace what is being edited.
        if (!selectedFile) {
          const initial = configFiles.find((f) => f.path === 'printer.cfg') ?? configFiles[0];
          if (initial) await loadFileContent(initial.path);
        }
      }
    } catch (e) {
      console.error('Failed to list config files', e);
    } finally {
      loadingList = false;
    }
  }

  async function loadFileContent(path: string) {
    if (path === selectedFile && !isDirty) return;
    if (isDirty && !(await ui.confirm(i18n.t('confirm_discard_changes')))) {
      return;
    }
    loadingContent = true;
    try {
      const res = await fetch(moonraker.fileUrl('config', path), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Switch only after the new content arrived: on failure the editor keeps
      // the previous file and its name, so a save can never write it under another name.
      selectedFile = path;
      fileContent = text;
      isDirty = false;
    } catch (e) {
      ui.notify(`${i18n.t('config_read_error')} ${path}: ${errorMessage(e)}`, 'error');
    } finally {
      loadingContent = false;
    }
  }

  async function saveFile(andRestart = false) {
    if (!selectedFile) return;
    if (andRestart && printActive) {
      ui.notify(i18n.t('restart_blocked_printing'), 'error');
      return;
    }
    if (isPrinting && !(await ui.confirm(i18n.t('confirm_save_while_printing'), { danger: true }))) {
      return;
    }

    saving = true;
    try {
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('root', 'config');
      formData.append('file', blob, selectedFile);

      const res = await fetch(moonraker.apiUrl('/server/files/upload'), {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        ui.notify(`${i18n.t('config_save_error')} (HTTP ${res.status})`, 'error');
        return;
      }
      isDirty = false;
      if (andRestart) {
        await moonraker.firmwareRestart();
      } else {
        ui.notify(i18n.t('config_saved', { name: selectedFile }), 'success');
      }
    } catch (e) {
      ui.notify(`${i18n.t('config_save_error')}: ${errorMessage(e)}`, 'error');
    } finally {
      saving = false;
    }
  }

  $effect(() => {
    if (moonraker.connected) {
      untrack(() => loadFileList());
    }
  });
</script>

<div class="config-view">
  <!-- Sidebar with Config Files List -->
  <div class="sidebar">
    <div class="sidebar-header">
      <span>{i18n.t('config_files')}</span>
      <button class="btn-refresh" onclick={loadFileList} title={i18n.t('refresh')}><Icon name="refresh" /></button>
    </div>

    <div class="file-list">
      {#each configFiles as f (f.path)}
        <button 
          class="file-item" 
          class:active={selectedFile === f.path}
          onclick={() => loadFileContent(f.path)}
        >
          <span class="file-icon"><Icon name="file" /></span>
          <span class="file-name">{f.path}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Editor Window -->
  <div class="editor-pane">
    <div class="editor-toolbar">
      <div class="cur-file">
        <strong>{selectedFile || '—'}</strong>
        {#if isDirty}
          <span class="dirty-badge">{i18n.t('unsaved')}</span>
        {/if}
      </div>

      <div class="editor-actions">
        <button 
          class="btn btn-primary btn-sm" 
          disabled={saving || !isDirty || !selectedFile} 
          onclick={() => saveFile(false)}
        >
          <Icon name="save" /> {i18n.t('save_config')}
        </button>

        <button 
          class="btn btn-warning btn-sm" 
          disabled={saving || printActive || !selectedFile} 
          onclick={() => saveFile(true)}
          title={i18n.t('hint_firmware_restart')}
        >
          <Icon name="restart" /> {i18n.t('save_and_restart')}
        </button>
      </div>
    </div>

    {#if loadingContent}
      <div class="editor-loading">{i18n.t('loading_config')}</div>
    {:else}
      <textarea
        class="code-textarea"
        bind:value={fileContent}
        oninput={() => isDirty = true}
        spellcheck="false"
      ></textarea>
    {/if}
  </div>
</div>

<style>
  .config-view {
    display: flex;
    gap: 16px;
    height: calc(100vh - 90px);
    max-width: 1400px;
    margin: 0 auto;
    padding: 16px;
    width: 100%;
  }

  .sidebar {
    width: 280px;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid #282a30;
    font-size: 0.85rem;
    font-weight: 600;
    color: #9ca3af;
  }

  .btn-refresh {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: none;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #d1d5db;
    cursor: pointer;
    text-align: left;
    font-size: 0.8rem;
    transition: all 0.1s ease;
  }
  .file-item:hover {
    background: #23252b;
    color: #f3f4f6;
  }
  .file-item.active {
    background: rgba(2, 132, 199, 0.15);
    border-color: #0284c7;
    color: #38bdf8;
    font-weight: 600;
  }

  .file-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #18191c;
    border: 1px solid #282a30;
    border-radius: 8px;
    overflow: hidden;
  }

  .editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid #282a30;
    background: #141518;
  }

  .cur-file {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: monospace;
    font-size: 0.9rem;
    color: #f3f4f6;
  }

  .dirty-badge {
    font-size: 0.7rem;
    background: #f59e0b;
    color: #111;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
  }

  .editor-actions {
    display: flex;
    gap: 8px;
  }

  .code-textarea {
    flex: 1;
    background: #111215;
    border: none;
    color: #f3f4f6;
    padding: 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    resize: none;
    outline: none;
    tab-size: 4;
  }

  .editor-loading {
    padding: 40px;
    text-align: center;
    color: #6b7280;
  }

  .btn {
    border: none;
    padding: 6px 12px;
    border-radius: 5px;
    font-weight: 500;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-primary { background: #0284c7; color: white; }
  .btn-primary:hover:not(:disabled) { background: #0369a1; }
  .btn-warning { background: #d97706; color: white; }
  .btn-warning:hover:not(:disabled) { background: #b45309; }
</style>
