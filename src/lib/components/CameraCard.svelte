<script lang="ts">
  import Icon from './Icon.svelte';
  import { moonraker } from '../moonraker.svelte';
  import { i18n } from '../i18n.svelte';
  import { storageGet, storageSet } from '../storage';

  let isCameraActive = $state(false);
  let isEditingUrl = $state(false);
  let mode = $state<'stream' | 'snapshot'>('snapshot'); // Default to snapshot for maximum lightness!

  let cameraPath = $state(storageGet('klipper_camera_path') || '/webcam/?action=stream');
  // The snapshot endpoint follows the configured stream (mjpg-streamer / crowsnest / ustreamer).
  let snapshotPath = $derived(cameraPath.replace('action=stream', 'action=snapshot'));

  let snapshotTimestamp = $state(Date.now());
  let snapshotTimer: ReturnType<typeof setInterval> | null = null;
  let imageError = $state(false);

  // Relative paths: same origin as the UI when it proxies the printer, else the printer's port 80.
  function absolute(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const origin = moonraker.sameOrigin ? window.location.origin : `${window.location.protocol}//${moonraker.host}`;
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  let fullStreamUrl = $derived(absolute(cameraPath));
  let fullSnapshotUrl = $derived.by(() => {
    const url = absolute(snapshotPath);
    return `${url}${url.includes('?') ? '&' : '?'}t=${snapshotTimestamp}`;
  });

  function saveCameraPath() {
    storageSet('klipper_camera_path', cameraPath);
    imageError = false;
    isEditingUrl = false;
  }

  function toggleCamera() {
    isCameraActive = !isCameraActive;
    if (isCameraActive) {
      startSnapshotLoop();
    } else {
      stopSnapshotLoop();
    }
  }

  function startSnapshotLoop() {
    stopSnapshotLoop();
    if (mode === 'snapshot' && isCameraActive) {
      snapshotTimer = setInterval(() => {
        snapshotTimestamp = Date.now();
      }, 2000); // 1 frame every 2 seconds = 0% CPU
    }
  }

  function stopSnapshotLoop() {
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      snapshotTimer = null;
    }
  }

  // Give the camera a fresh chance after switching mode or turning it back on.
  $effect(() => {
    void mode;
    void isCameraActive;
    imageError = false;
  });

  $effect(() => {
    if (isCameraActive && mode === 'snapshot') {
      startSnapshotLoop();
    } else {
      stopSnapshotLoop();
    }

    return () => {
      stopSnapshotLoop();
    };
  });
</script>

<div class="card">
  <div class="card-header">
    <div class="title-box">
      <h3><Icon name="camera" /> {i18n.t('camera_title')}</h3>
      <span class="badge {isCameraActive ? 'badge-on' : 'badge-off'}">
        {isCameraActive ? i18n.t('active') : i18n.t('turned_off')}
      </span>
    </div>

    <div class="header-controls">
      {#if isCameraActive}
        <div class="mode-toggles">
          <button 
            class="mode-btn" 
            class:active={mode === 'snapshot'} 
            onclick={() => { mode = 'snapshot'; startSnapshotLoop(); }}
            title="Snapshot mode"
          >
            {i18n.t('snapshot')}
          </button>
          <button 
            class="mode-btn" 
            class:active={mode === 'stream'} 
            onclick={() => { mode = 'stream'; stopSnapshotLoop(); }}
            title="Live video stream"
          >
            {i18n.t('live_stream')}
          </button>
        </div>
      {/if}

      <button 
        class="btn {isCameraActive ? 'btn-danger' : 'btn-success'}" 
        onclick={toggleCamera}
      >
        {isCameraActive ? i18n.t('turn_off') : i18n.t('turn_on')}
      </button>
    </div>
  </div>

  <!-- Camera Viewer -->
  <div class="view-container">
    {#if isCameraActive}
      {#if mode === 'stream'}
        <img 
          src={fullStreamUrl} 
          alt="Printer Camera Stream" 
          class="camera-frame"
          class:hidden={imageError}
          onload={() => (imageError = false)}
          onerror={() => (imageError = true)}
        />
      {:else}
        <img 
          src={fullSnapshotUrl} 
          alt="Printer Camera Snapshot" 
          class="camera-frame"
          class:hidden={imageError}
          onload={() => (imageError = false)}
          onerror={() => (imageError = true)}
        />
      {/if}
      {#if imageError}
        <div class="off-placeholder">
          <div class="off-icon"><Icon name="alert" /></div>
          <p>{i18n.t('camera_unavailable')}</p>
        </div>
      {/if}
    {:else}
      <div class="off-placeholder">
        <div class="off-icon"><Icon name="camera-off" /></div>
        <p>{i18n.t('cam_off_desc')}</p>
        <button class="btn btn-primary btn-sm" onclick={toggleCamera}>
          {i18n.t('show_image')}
        </button>
      </div>
    {/if}
  </div>

  <!-- Settings Row -->
  <div class="cam-settings-bar">
    {#if !isEditingUrl}
      <span class="cam-url-text">{i18n.t('source')} {cameraPath}</span>
      <button class="btn-link" onclick={() => isEditingUrl = true}>{i18n.t('change_url')}</button>
    {:else}
      <input type="text" bind:value={cameraPath} class="cam-url-input" />
      <button class="btn btn-primary btn-xs" onclick={saveCameraPath}>{i18n.t('save')}</button>
      <button class="btn btn-secondary btn-xs" onclick={() => isEditingUrl = false}><Icon name="close" /></button>
    {/if}
  </div>
</div>

<style>
  .camera-frame.hidden {
    display: none;
  }

  .card {
    background: #1e2025;
    border-radius: 10px;
    padding: 16px;
    border: 1px solid #282a30;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .title-box {
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

  .badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9999px;
  }
  .badge-on { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
  .badge-off { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-toggles {
    display: flex;
    background: #151619;
    border-radius: 6px;
    border: 1px solid #282a30;
    overflow: hidden;
  }

  .mode-btn {
    background: none;
    border: none;
    color: #9ca3af;
    padding: 4px 8px;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .mode-btn.active {
    background: #0284c7;
    color: white;
    font-weight: 600;
  }

  .view-container {
    background: #111215;
    border: 1px solid #282a30;
    border-radius: 8px;
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
  }

  .camera-frame {
    width: 100%;
    max-height: 380px;
    object-fit: contain;
    display: block;
  }

  .off-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 30px;
    text-align: center;
    color: #6b7280;
  }

  .off-icon {
    font-size: 2.2rem;
    opacity: 0.5;
  }

  .off-placeholder p {
    margin: 0;
    font-size: 0.85rem;
  }

  .cam-settings-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .cam-url-text {
    font-family: monospace;
  }

  .cam-url-input {
    flex: 1;
    background: #151619;
    border: 1px solid #374151;
    color: #f3f4f6;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-family: monospace;
  }

  .btn-link {
    background: none;
    border: none;
    color: #38bdf8;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.75rem;
    padding: 0;
  }

  .btn {
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s ease;
  }
  .btn-sm { padding: 6px 12px; font-size: 0.8rem; }
  .btn-xs { padding: 3px 8px; font-size: 0.75rem; }
  .btn-primary { background: #0284c7; color: white; }
  .btn-primary:hover { background: #0369a1; }
  .btn-secondary { background: #374151; color: white; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-success { background: #16a34a; color: white; }
  .btn-success:hover { background: #15803d; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-danger:hover { background: #b91c1c; }
</style>
