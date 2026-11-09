<script lang="ts">
  import Icon from './lib/components/Icon.svelte';
  import Header from './lib/components/Header.svelte';
  import StatusCard from './lib/components/StatusCard.svelte';
  import ControlsCard from './lib/components/ControlsCard.svelte';
  import TempCard from './lib/components/TempCard.svelte';
  import JogCard from './lib/components/JogCard.svelte';
  import MiscCard from './lib/components/MiscCard.svelte';
  import ConsoleCard from './lib/components/ConsoleCard.svelte';
  import CameraCard from './lib/components/CameraCard.svelte';
  import SpoolmanCard from './lib/components/SpoolmanCard.svelte';
  import FilesTab from './lib/components/FilesTab.svelte';
  import HistoryTab from './lib/components/HistoryTab.svelte';
  import BedMeshTab from './lib/components/BedMeshTab.svelte';
  import ConfigTab from './lib/components/ConfigTab.svelte';
  import { moonraker } from './lib/moonraker.svelte';
  import Dialogs from './lib/components/Dialogs.svelte';
  import { i18n } from './lib/i18n.svelte';
  import { ui } from './lib/ui.svelte';
  import { printCounts } from './lib/printCounts.svelte';
  import { untrack } from 'svelte';

  type Tab = 'dashboard' | 'files' | 'history' | 'bedmesh' | 'config';
  let currentTab = $state<Tab>('dashboard');

  // Per-file print counters: recounted from the job history on every (re)connect.
  $effect(() => {
    if (moonraker.connected) untrack(() => printCounts.load());
  });

  const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`;

  async function switchTab(tab: Tab) {
    if (tab === currentTab) return;
    if (currentTab === 'config' && ui.configDirty && !(await ui.confirm(i18n.t('confirm_discard_changes')))) {
      return;
    }
    currentTab = tab;
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (ui.configDirty) e.preventDefault();
  }
</script>

<svelte:window onbeforeunload={onBeforeUnload} />
<Dialogs />

<div class="mainsail-layout">
  <!-- Mainsail-style Left Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="logo">
        <img src={logoUrl} alt="Moonlite Logo" class="brand-icon" />
        <span>Moonlite</span>
      </div>
    </div>

    <nav class="nav-menu">
      <button 
        class="nav-link" 
        class:active={currentTab === 'dashboard'} 
        onclick={() => switchTab('dashboard')}
      >
        <span class="nav-icon"><Icon name="dashboard" /></span>
        <span class="nav-text">{i18n.t('nav_dashboard')}</span>
      </button>

      <button 
        class="nav-link" 
        class:active={currentTab === 'files'} 
        onclick={() => switchTab('files')}
      >
        <span class="nav-icon"><Icon name="folder" /></span>
        <span class="nav-text">{i18n.t('nav_files')}</span>
      </button>

      <button 
        class="nav-link" 
        class:active={currentTab === 'history'} 
        onclick={() => switchTab('history')}
      >
        <span class="nav-icon"><Icon name="history" /></span>
        <span class="nav-text">{i18n.t('nav_history')}</span>
      </button>

      <button 
        class="nav-link" 
        class:active={currentTab === 'bedmesh'} 
        onclick={() => switchTab('bedmesh')}
      >
        <span class="nav-icon"><Icon name="bed-mesh" /></span>
        <span class="nav-text">{i18n.t('nav_bedmesh')}</span>
      </button>

      <button 
        class="nav-link" 
        class:active={currentTab === 'config'} 
        onclick={() => switchTab('config')}
      >
        <span class="nav-icon"><Icon name="settings" /></span>
        <span class="nav-text">{i18n.t('nav_config')}</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <div class="printer-tag">
        <span class="dot-status" class:online={moonraker.connected}></span>
        <span class="printer-name">{moonraker.printerName}</span>
      </div>
      <div class="app-version">v{__APP_VERSION__}</div>
    </div>
  </aside>

  <!-- Right Main Area -->
  <div class="content-wrapper">
    <Header />

    {#if moonraker.error && !moonraker.connected}
      <div class="banner-error">
        <Icon name="alert" /> {moonraker.error}. {moonraker.address}
      </div>
    {:else if moonraker.connected && moonraker.state.klippy !== 'ready'}
      <div class="banner-warning">
        <Icon name="alert" /> Klippy: {moonraker.state.klippy}{moonraker.state.klippyMessage ? ` — ${moonraker.state.klippyMessage}` : ''}
      </div>
    {/if}

    <main class="page-content">
      {#if currentTab === 'dashboard'}
        <!-- 3-Column Mainsail Grid covering 100% full width -->
        <div class="dashboard-grid-3col">
          <!-- Column 1: Print Status & Toolhead/Jog -->
          <div class="grid-col">
            <StatusCard />
            <JogCard />
          </div>

          <!-- Column 2: Temperatures (with Live Canvas Graph), Machine/Fans/Sensors & Spoolman -->
          <div class="grid-col">
            <TempCard />
            <MiscCard />
            <SpoolmanCard />
          </div>

          <!-- Column 3: Extruder Controls, Camera, G-code Terminal/Log -->
          <div class="grid-col">
            <ControlsCard />
            <CameraCard />
            <ConsoleCard />
          </div>
        </div>
      {:else if currentTab === 'files'}
        <div class="tab-wrapper">
          <FilesTab />
        </div>
      {:else if currentTab === 'history'}
        <div class="tab-wrapper">
          <HistoryTab />
        </div>
      {:else if currentTab === 'bedmesh'}
        <div class="tab-wrapper">
          <BedMeshTab />
        </div>
      {:else if currentTab === 'config'}
        <div class="tab-wrapper">
          <ConfigTab />
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .mainsail-layout {
    display: flex;
    min-height: 100vh;
    background-color: #121316;
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  /* Left Sidebar (Mainsail style) */
  .sidebar {
    width: 210px;
    background: #18191c;
    border-right: 1px solid #282a30;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    height: 100vh;
    z-index: 20;
    transition: width 0.2s ease;
  }

  .sidebar-brand {
    padding: 14px 18px;
    border-bottom: 1px solid #282a30;
    display: flex;
    align-items: center;
  }

  .logo {
    font-size: 1.15rem;
    font-weight: 700;
    color: #f3f4f6;
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: -0.01em;
  }

  .logo span {
    color: #38bdf8;
    font-weight: 600;
  }

  .brand-icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
  }

  .nav-menu {
    flex: 1;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #9ca3af;
    cursor: pointer;
    text-align: left;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .nav-link:hover {
    background: #23252b;
    color: #f3f4f6;
  }

  .nav-link.active {
    background: rgba(2, 132, 199, 0.15);
    border-color: rgba(2, 132, 199, 0.3);
    color: #38bdf8;
    font-weight: 600;
  }

  .nav-icon {
    font-size: 1.1rem;
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-footer {
    padding: 14px 16px;
    border-top: 1px solid #282a30;
    background: #141518;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .printer-tag {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: #d1d5db;
    font-weight: 500;
  }

  .dot-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }
  .dot-status.online {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  .app-version {
    font-size: 0.7rem;
    color: #6b7280;
    font-family: monospace;
  }

  /* Right Content Area */
  .content-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    width: calc(100% - 210px);
  }

  .page-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
  }

  .banner-error {
    background: #7f1d1d;
    color: #fecaca;
    padding: 10px 20px;
    font-size: 0.85rem;
    font-weight: 500;
    text-align: center;
    border-bottom: 1px solid #991b1b;
  }

  .banner-warning {
    background: #713f12;
    color: #fde68a;
    padding: 10px 20px;
    font-size: 0.85rem;
    font-weight: 500;
    text-align: center;
    border-bottom: 1px solid #a16207;
    white-space: pre-wrap;
  }

  /* 3-Column Grid with Mainsail-style balanced side margins on wide screens */
  .dashboard-grid-3col {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    padding: 16px 28px;
    max-width: 1720px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .tab-wrapper {
    max-width: 1720px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .grid-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* Responsive Breakpoints */
  @media (max-width: 1100px) {
    .dashboard-grid-3col {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: 14px 18px;
    }
  }

  @media (max-width: 820px) {
    .sidebar {
      width: 68px;
    }
    .content-wrapper {
      width: calc(100% - 68px);
    }
    .logo span, .nav-text, .sidebar-footer {
      display: none;
    }
    .sidebar-brand {
      justify-content: center;
      padding: 14px 0;
    }
    .nav-link {
      justify-content: center;
      padding: 12px 0;
    }
  }

  @media (max-width: 768px) {
    .dashboard-grid-3col {
      grid-template-columns: 1fr;
      padding: 10px;
      gap: 12px;
    }
  }
</style>
