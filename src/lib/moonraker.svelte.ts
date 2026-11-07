import { i18n } from './i18n.svelte';
import { storageGet, storageRemove, storageSet } from './storage';
import { errorMessage, ui } from './ui.svelte';

export interface PrinterState {
  klippy: string;
  klippyMessage: string;
  print: {
    state: string;
    filename: string;
    progress: number;
    print_duration: number;
    total_duration: number;
    estimated_time: number;
    filament_used: number;
    message: string;
    info?: { current_layer?: number | null; total_layer?: number | null };
    thumbnail?: string;
    layer_count?: number;
    layer_height?: number;
    first_layer_height?: number;
    filament_type?: string;
    slicer?: string;
  };
  display_status: {
    progress: number;
    message: string;
  };
  virtual_sdcard: {
    progress: number;
    file_position: number;
    file_size: number;
    is_active: boolean;
  };
  extruder: {
    temperature: number;
    target: number;
    power: number;
  };
  heater_bed: {
    temperature: number;
    target: number;
    power: number;
  };
  toolhead: {
    position: [number, number, number, number];
    homed_axes: string;
  };
  fan: {
    speed: number;
  };
  gcode_move: {
    gcode_position: [number, number, number, number];
    speed_factor: number;
    extrude_factor: number;
  };
  sensors: Record<string, { temperature?: number; target?: number; power?: number }>;
  /** Optional peripherals. A field stays undefined when the printer has no such object. */
  misc: {
    cameralight?: number;
    hotend_fan_speed?: number;
    board_fan_speed?: number;
    filament_detected?: boolean;
  };
}

export interface LogMessage {
  id: number;
  time: string;
  text: string;
  type: 'in' | 'out' | 'err';
}

export interface TempPoint {
  time: number;
  extruder: number;
  extruderTarget: number;
  bed: number;
  bedTarget: number;
}

export interface SpoolData {
  id: number;
  color_hex?: string;
  colors?: { r: number; g: number; b: number }[];
  remaining_filament?: number;
  filament?: {
    name?: string;
    material?: string;
    vendor?: { name: string };
    manufacturer?: string;
    color_hex?: string;
    weight?: number;
    settings_extruder_temp?: number;
    settings_bed_temp?: number;
  };
  remaining_weight?: number;
  initial_weight?: number;
  /** Not part of the Spoolman API; kept for proxies/forks that report it. */
  net_weight?: number;
  remaining_length?: number;
  used_length?: number;
  used_weight?: number;
}

export interface Thumbnail {
  width: number;
  height: number;
  relative_path: string;
}

/** Peripheral objects discovered via printer.objects.list (null when absent). */
interface PeripheralObjects {
  light: string | null;
  heaterFan: string | null;
  controllerFan: string | null;
  filamentSensor: string | null;
}

/** JSON-RPC error returned by Moonraker/Klipper (as opposed to a local transport error). */
export class RpcError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

const CORE_OBJECTS = [
  'print_stats',
  'display_status',
  'virtual_sdcard',
  'extruder',
  'heater_bed',
  'toolhead',
  'fan',
  'gcode_move',
];

const RPC_TIMEOUT_MS = 10_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const KLIPPY_RETRY_MS = 5_000;
const TEMP_SAMPLE_MS = 2_000;
const TEMP_HISTORY_POINTS = 60;
const LOG_LIMIT = 100;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx + 1);
}

/**
 * Where to find Moonraker by default:
 * - an address the user saved in the header editor wins;
 * - otherwise the page's own origin: in production nginx proxies /websocket and
 *   /server to Moonraker, in development the Vite dev server does the same when
 *   VITE_PRINTER_HOST is set (no CORS, works over HTTPS);
 * - a dev server without VITE_PRINTER_HOST talks to Moonraker on the page host, port 7125.
 */
function defaultTarget(): { host: string; port: string; auto: boolean } {
  const storedHost = storageGet('klipper_host');
  if (storedHost) {
    return { host: storedHost, port: storageGet('klipper_port') ?? '7125', auto: false };
  }
  if (import.meta.env.PROD || import.meta.env.VITE_PRINTER_HOST) {
    return { host: window.location.hostname, port: window.location.port, auto: true };
  }
  return { host: window.location.hostname || 'localhost', port: '7125', auto: true };
}

function emptyPrint(): PrinterState['print'] {
  return {
    state: 'standby',
    filename: '',
    progress: 0,
    print_duration: 0,
    total_duration: 0,
    estimated_time: 0,
    filament_used: 0,
    message: '',
  };
}

class MoonrakerClient {
  host = $state('');
  port = $state('');
  /** True when the address was not set explicitly by the user. */
  autoHost = $state(true);
  connected = $state(false);
  connecting = $state(false);
  error = $state<string | null>(null);
  printerName = $state('Klipper');

  // Safety Lock: on by default to prevent accidental clicks while printing!
  safetyLock = $state(true);

  state = $state<PrinterState>({
    klippy: 'disconnected',
    klippyMessage: '',
    print: emptyPrint(),
    display_status: {
      progress: 0,
      message: '',
    },
    virtual_sdcard: {
      progress: 0,
      file_position: 0,
      file_size: 0,
      is_active: false,
    },
    extruder: { temperature: 0, target: 0, power: 0 },
    heater_bed: { temperature: 0, target: 0, power: 0 },
    toolhead: { position: [0, 0, 0, 0], homed_axes: '' },
    fan: { speed: 0 },
    gcode_move: {
      gcode_position: [0, 0, 0, 0],
      speed_factor: 1,
      extrude_factor: 1,
    },
    sensors: {},
    misc: {},
  });

  logs = $state<LogMessage[]>([]);
  tempHistory = $state<TempPoint[]>([]);

  /** Bumped (debounced) whenever Moonraker reports a change in the file list. */
  filesVersion = $state(0);

  spoolman = $state<{
    spool_id: number | null;
    spool: SpoolData | null;
    loading: boolean;
  }>({
    spool_id: null,
    spool: null,
    loading: false,
  });

  private objects: PeripheralObjects = { light: null, heaterFan: null, controllerFan: null, filamentSensor: null };
  private reqId = 1;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void; timer: ReturnType<typeof setTimeout> | null }
  >();
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private klippyRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private filesTimer: ReturnType<typeof setTimeout> | null = null;
  private tempTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private klippyInitRunning = false;

  constructor() {
    const target = defaultTarget();
    this.host = target.host;
    this.port = target.port;
    this.autoHost = target.auto;
    this.connect();
  }

  // --- Addressing -----------------------------------------------------------

  /** True when Moonraker is reached through the page's own origin (nginx / Vite proxy). */
  get sameOrigin(): boolean {
    return this.host === window.location.hostname && this.port === window.location.port;
  }

  /** "host" or "host:port" */
  get address(): string {
    return this.port ? `${this.host}:${this.port}` : this.host;
  }

  get baseUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${this.address}`;
  }

  apiUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /** URL of a file served by Moonraker, e.g. fileUrl('gcodes', 'dir/part.gcode'). */
  fileUrl(root: string, path: string): string {
    return `${this.baseUrl}/server/files/${root}/${encodePath(path)}`;
  }

  /**
   * Thumbnail URL for a G-code file. Moonraker reports `relative_path`
   * relative to the directory of the G-code file, not to the gcodes root.
   */
  thumbnailUrl(
    gcodePath: string,
    thumbnails: Thumbnail[] | undefined | null,
    prefer: 'largest' | 'small' = 'largest',
  ): string | undefined {
    if (!thumbnails || thumbnails.length === 0) return undefined;
    const sorted = [...thumbnails].sort((a, b) => b.width - a.width);
    const best =
      prefer === 'largest' ? sorted[0] : sorted.find((t) => t.width <= 160 && t.width >= 32) ?? sorted[sorted.length - 1];
    return this.fileUrl('gcodes', dirname(gcodePath) + best.relative_path);
  }

  /** Pass an empty host to return to automatic detection. */
  setHost(newHost: string, newPort: string = '7125') {
    if (newHost) {
      this.host = newHost;
      this.port = newPort;
      this.autoHost = false;
      storageSet('klipper_host', newHost);
      storageSet('klipper_port', newPort);
    } else {
      storageRemove('klipper_host');
      storageRemove('klipper_port');
      const target = defaultTarget();
      this.host = target.host;
      this.port = target.port;
      this.autoHost = true;
    }
    this.disconnect();
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.connect();
  }

  // --- Connection lifecycle -------------------------------------------------

  get isWsOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.destroyed || this.ws) return;
    this.connecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${this.address}/websocket`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      this.error = errorMessage(err) || 'Connection failed';
      this.connecting = false;
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    // Every handler checks that it still belongs to the current socket, so a
    // late event from a socket we already replaced can never clobber state.
    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.connected = true;
      this.connecting = false;
      this.error = null;
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.addLog(`Connected to Moonraker at ${this.address}`, 'in');
      this.startTempSampling();
      this.initKlippy();
      this.fetchSpoolmanData();
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      if (this.ws !== socket) return;
      this.error = 'WebSocket connection error';
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.handleSocketLost();
      this.scheduleReconnect();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
    this.handleSocketLost();
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private handleSocketLost() {
    this.connected = false;
    this.connecting = false;
    this.state.klippy = 'disconnected';
    this.stopTempSampling();
    if (this.klippyRetryTimer) clearTimeout(this.klippyRetryTimer);
    this.klippyRetryTimer = null;
    for (const [id, handler] of this.pending) {
      if (handler.timer) clearTimeout(handler.timer);
      handler.reject(new Error('WebSocket closed'));
      this.pending.delete(id);
    }
  }

  private startTempSampling() {
    if (this.tempTimer) return;
    this.tempTimer = setInterval(() => {
      this.tempHistory.push({
        time: Date.now(),
        extruder: Math.round(this.state.extruder?.temperature || 0),
        extruderTarget: Math.round(this.state.extruder?.target || 0),
        bed: Math.round(this.state.heater_bed?.temperature || 0),
        bedTarget: Math.round(this.state.heater_bed?.target || 0),
      });
      if (this.tempHistory.length > TEMP_HISTORY_POINTS) {
        this.tempHistory.splice(0, this.tempHistory.length - TEMP_HISTORY_POINTS);
      }
    }, TEMP_SAMPLE_MS);
  }

  private stopTempSampling() {
    if (this.tempTimer) clearInterval(this.tempTimer);
    this.tempTimer = null;
  }

  // --- Klippy init / subscriptions -------------------------------------------

  private scheduleKlippyRetry() {
    if (this.klippyRetryTimer) clearTimeout(this.klippyRetryTimer);
    if (!this.isWsOpen) return;
    this.klippyRetryTimer = setTimeout(() => {
      this.klippyRetryTimer = null;
      this.initKlippy();
    }, KLIPPY_RETRY_MS);
  }

  /**
   * Waits until Klippy is ready, then (re)subscribes. Called on connect, on
   * notify_klippy_ready, and by a slow retry timer while Klippy is not ready
   * (startup, shutdown, error, disconnected) in case a notification was missed.
   */
  private async initKlippy() {
    if (this.klippyInitRunning) return;
    this.klippyInitRunning = true;
    if (this.klippyRetryTimer) clearTimeout(this.klippyRetryTimer);
    this.klippyRetryTimer = null;

    try {
      const info = await this.call('printer.info');
      if (info?.hostname) this.printerName = info.hostname;
      this.state.klippy = info?.state ?? 'unknown';
      this.state.klippyMessage = info?.state_message ?? '';

      if (info?.state !== 'ready') {
        this.scheduleKlippyRetry();
        return;
      }

      const list = await this.call('printer.objects.list');
      const available: string[] = list?.objects ?? [];
      const objects = this.buildSubscription(available);

      const sub = await this.call('printer.objects.subscribe', { objects });
      // Fresh full snapshot: drop values that may belong to a previous config/host.
      this.state.print = emptyPrint();
      this.state.sensors = {};
      this.state.misc = {};
      if (sub?.status) {
        this.applyStatusUpdate(sub.status);
      }
    } catch (e) {
      if (this.isWsOpen) {
        this.addLog(`Klippy init: ${errorMessage(e)}`, 'err');
        this.scheduleKlippyRetry();
      }
    } finally {
      this.klippyInitRunning = false;
    }
  }

  private buildSubscription(available: string[]): Record<string, null> {
    const has = new Set(available);
    const find = (pred: (name: string) => boolean) => available.find(pred) ?? null;

    this.objects = {
      light: has.has('output_pin cameralight')
        ? 'output_pin cameralight'
        : find((n) => n.startsWith('output_pin ') && /light|led/i.test(n)),
      heaterFan: find((n) => n.startsWith('heater_fan ')),
      controllerFan: find((n) => n.startsWith('controller_fan ')),
      filamentSensor: find((n) => n.startsWith('filament_switch_sensor ') || n.startsWith('filament_motion_sensor ')),
    };

    const names = [
      ...CORE_OBJECTS.filter((n) => has.has(n)),
      ...available.filter((n) => n.startsWith('temperature_sensor ') || n.startsWith('temperature_host ')),
      ...Object.values(this.objects).filter((n): n is string => n !== null),
    ];
    return Object.fromEntries(names.map((n) => [n, null]));
  }

  private handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed
    }

    // RPC response
    if (typeof msg.id === 'number') {
      const handler = this.pending.get(msg.id);
      if (!handler) return;
      this.pending.delete(msg.id);
      if (handler.timer) clearTimeout(handler.timer);
      if (msg.error) {
        handler.reject(new RpcError(msg.error.message ?? 'RPC error', msg.error.code ?? -1));
      } else {
        handler.resolve(msg.result);
      }
      return;
    }

    switch (msg.method) {
      case 'notify_status_update': {
        const [status] = msg.params ?? [];
        this.applyStatusUpdate(status);
        break;
      }
      case 'notify_gcode_response': {
        const [response] = msg.params ?? [];
        if (response) this.addLog(response, response.startsWith('!!') ? 'err' : 'in');
        break;
      }
      case 'notify_klippy_ready':
        this.addLog('Klippy: ready', 'in');
        this.initKlippy();
        break;
      case 'notify_klippy_shutdown':
        this.state.klippy = 'shutdown';
        this.state.klippyMessage = '';
        this.addLog('Klippy: shutdown', 'err');
        this.scheduleKlippyRetry();
        break;
      case 'notify_klippy_disconnected':
        this.state.klippy = 'disconnected';
        this.state.klippyMessage = '';
        this.addLog('Klippy: disconnected', 'err');
        this.scheduleKlippyRetry();
        break;
      case 'notify_active_spool_set':
      case 'notify_spoolman_status_changed':
        this.fetchSpoolmanData();
        break;
      case 'notify_filelist_changed':
        if (this.filesTimer) clearTimeout(this.filesTimer);
        this.filesTimer = setTimeout(() => {
          this.filesTimer = null;
          this.filesVersion++;
        }, 800);
        break;
    }
  }

  /** Moonraker sends deltas: only fields that changed are present in `update`. */
  private applyStatusUpdate(update: Record<string, any>) {
    if (!update) return;

    const ps = update.print_stats;
    if (ps) {
      const prevFilename = this.state.print.filename;
      Object.assign(this.state.print, ps);
      if ('filename' in ps && ps.filename !== prevFilename) {
        this.onFilenameChanged(ps.filename ?? '');
      }
    }
    if (update.display_status) {
      Object.assign(this.state.display_status, update.display_status);
      if (typeof update.display_status.progress === 'number') {
        this.state.print.progress = update.display_status.progress;
      }
    }
    if (update.virtual_sdcard) {
      Object.assign(this.state.virtual_sdcard, update.virtual_sdcard);
      // Fallback to virtual_sdcard progress if display_status hasn't reported it yet
      if (!this.state.print.progress && typeof update.virtual_sdcard.progress === 'number') {
        this.state.print.progress = update.virtual_sdcard.progress;
      }
    }
    if (update.extruder) Object.assign(this.state.extruder, update.extruder);
    if (update.heater_bed) Object.assign(this.state.heater_bed, update.heater_bed);
    if (update.toolhead) Object.assign(this.state.toolhead, update.toolhead);
    if (update.fan) Object.assign(this.state.fan, update.fan);
    if (update.gcode_move) Object.assign(this.state.gcode_move, update.gcode_move);

    // Dynamic temperature sensors
    for (const [key, val] of Object.entries(update)) {
      if (key.startsWith('temperature_sensor ') || key.startsWith('temperature_host ')) {
        this.state.sensors[key] = { ...(this.state.sensors[key] || {}), ...(val as object) };
      }
    }

    const { light, heaterFan, controllerFan, filamentSensor } = this.objects;
    const misc = this.state.misc;
    if (light && update[light] && 'value' in update[light]) misc.cameralight = update[light].value;
    if (heaterFan && update[heaterFan] && 'speed' in update[heaterFan]) misc.hotend_fan_speed = update[heaterFan].speed;
    if (controllerFan && update[controllerFan] && 'speed' in update[controllerFan]) {
      misc.board_fan_speed = update[controllerFan].speed;
    }
    if (filamentSensor && update[filamentSensor] && 'filament_detected' in update[filamentSensor]) {
      misc.filament_detected = update[filamentSensor].filament_detected;
    }
  }

  private onFilenameChanged(filename: string) {
    const p = this.state.print;
    // Metadata of the previous file must not leak into the new one.
    p.thumbnail = undefined;
    p.estimated_time = 0;
    p.layer_count = undefined;
    p.layer_height = undefined;
    p.first_layer_height = undefined;
    p.filament_type = undefined;
    p.slicer = undefined;
    if (filename) this.fetchFileMetadata(filename);
  }

  async fetchFileMetadata(filename: string) {
    if (!filename) return;
    try {
      const res = await this.request('server.files.metadata', { filename }, { path: '/server/files/metadata' });
      // Ignore a late answer for a file that is no longer the current one.
      if (!res || this.state.print.filename !== filename) return;
      const p = this.state.print;
      if (res.estimated_time) p.estimated_time = res.estimated_time;
      if (res.layer_count) p.layer_count = res.layer_count;
      if (res.layer_height) p.layer_height = res.layer_height;
      if (res.first_layer_height) p.first_layer_height = res.first_layer_height;
      if (res.filament_type) p.filament_type = res.filament_type;
      if (res.slicer) p.slicer = res.slicer;
      p.thumbnail = this.thumbnailUrl(filename, res.thumbnails, 'largest');
    } catch {
      // metadata optional
    }
  }

  // --- Transport --------------------------------------------------------------

  /** JSON-RPC over the WebSocket. `timeoutMs = 0` disables the timeout. */
  call(method: string, params: Record<string, any> = {}, timeoutMs = RPC_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = ++this.reqId;
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (this.pending.delete(id)) reject(new Error(`RPC timeout: ${method}`));
            }, timeoutMs)
          : null;
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
    });
  }

  /**
   * RPC over the WebSocket, or the equivalent HTTP endpoint while the socket
   * is not open (e.g. during a reconnect). RPC errors are never retried over HTTP.
   */
  async request(
    method: string,
    params: Record<string, any> = {},
    http?: { verb?: 'GET' | 'POST' | 'DELETE'; path: string },
  ): Promise<any> {
    if (this.isWsOpen || !http) return this.call(method, params);

    const verb = http.verb ?? 'GET';
    let url = this.apiUrl(http.path);
    const init: RequestInit = { method: verb };
    if (verb === 'POST') {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(params);
    } else {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      if (qs) url += `?${qs}`;
    }
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${http.path}`);
    const json = await res.json();
    return json?.result;
  }

  // --- Logging & errors -------------------------------------------------------

  // Strictly limited log buffer
  addLog(text: string, type: 'in' | 'out' | 'err' = 'in') {
    const time = new Date().toLocaleTimeString();
    this.logs.push({ id: Date.now() + Math.random(), time, text, type });
    if (this.logs.length > LOG_LIMIT) {
      this.logs.splice(0, this.logs.length - LOG_LIMIT);
    }
  }

  clearLogs() {
    this.logs = [];
  }

  /** Shows an error to the user. Klipper already echoes G-code errors to the console ("!! ..."). */
  reportError(e: unknown, opts: { quiet?: boolean; echoed?: boolean } = {}) {
    const msg = errorMessage(e);
    if (!(opts.echoed && e instanceof RpcError)) this.addLog(msg, 'err');
    if (!opts.quiet) ui.notify(msg, 'error');
  }

  // --- Print state helpers ----------------------------------------------------

  get isPrinting(): boolean {
    return this.state.print.state === 'printing';
  }

  /** Printing or paused: a job is loaded and would be lost by restarts/motor-off. */
  get isPrintActive(): boolean {
    return this.state.print.state === 'printing' || this.state.print.state === 'paused';
  }

  /** Manual moves/extrusion: allowed while paused (e.g. to inspect), not while printing. */
  get motionLocked(): boolean {
    return this.safetyLock && this.isPrinting;
  }

  /** Commands that would ruin a loaded job (M84, Z_TILT, BED_MESH_CALIBRATE). */
  get machineLocked(): boolean {
    return this.safetyLock && this.isPrintActive;
  }

  private guard(locked: boolean): boolean {
    if (!locked) return true;
    ui.notify(i18n.t('locked_printing'), 'error');
    return false;
  }

  // --- Actions (never throw; resolve to true on success) ---------------------

  /**
   * Runs a G-code script. Long-running commands (G28, BED_MESH_CALIBRATE, M109)
   * have no RPC timeout; a lost connection still rejects them.
   */
  async sendGcode(script: string, opts: { quiet?: boolean } = {}): Promise<boolean> {
    this.addLog(script, 'out');
    try {
      await this.call('printer.gcode.script', { script }, 0);
      return true;
    } catch (e) {
      this.reportError(e, { quiet: opts.quiet, echoed: true });
      return false;
    }
  }

  private async action(label: string, method: string, params: Record<string, any> = {}): Promise<boolean> {
    this.addLog(label, 'out');
    try {
      await this.call(method, params);
      return true;
    } catch (e) {
      this.reportError(e);
      return false;
    }
  }

  startPrint(filename: string) {
    return this.action(`Start print: ${filename}`, 'printer.print.start', { filename });
  }

  pausePrint() {
    return this.action('PAUSE requested', 'printer.print.pause');
  }

  resumePrint() {
    return this.action('RESUME requested', 'printer.print.resume');
  }

  cancelPrint() {
    return this.action('CANCEL_PRINT requested', 'printer.print.cancel');
  }

  emergencyStop() {
    return this.action('M112 EMERGENCY STOP requested', 'printer.emergency_stop');
  }

  setExtruderTemp(temp: number) {
    return this.sendGcode(`SET_HEATER_TEMPERATURE HEATER=extruder TARGET=${temp}`);
  }

  setBedTemp(temp: number) {
    return this.sendGcode(`SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${temp}`);
  }

  async home(axes: string = '') {
    if (!this.guard(this.motionLocked)) return false;
    return this.sendGcode(axes ? `G28 ${axes.toUpperCase()}` : 'G28');
  }

  async move(axis: 'X' | 'Y' | 'Z', distance: number, speed: number = 3000) {
    if (!this.guard(this.motionLocked)) return false;
    const gcode = `SAVE_GCODE_STATE NAME=__moonlite_move\nG91\nG1 ${axis}${distance} F${speed}\nRESTORE_GCODE_STATE NAME=__moonlite_move`;
    return this.sendGcode(gcode);
  }

  babyStep(delta: number) {
    return this.sendGcode(`SET_GCODE_OFFSET Z_ADJUST=${delta} MOVE=1`);
  }

  async motorsOff() {
    if (!this.guard(this.machineLocked)) return false;
    return this.sendGcode('M84');
  }

  /** Calibration/maintenance macros that must not run during a job. */
  async machineGcode(script: string) {
    if (!this.guard(this.machineLocked)) return false;
    return this.sendGcode(script);
  }

  /** FIRMWARE_RESTART aborts a loaded job, so it is refused while printing or paused. */
  async firmwareRestart() {
    if (this.isPrintActive) {
      ui.notify(i18n.t('restart_blocked_printing'), 'error');
      return false;
    }
    return this.sendGcode('FIRMWARE_RESTART');
  }

  cooldown() {
    return this.sendGcode('M104 S0\nM140 S0');
  }

  setSpeedFactor(pct: number) {
    return this.sendGcode(`M220 S${Math.round(pct)}`);
  }

  setFlowFactor(pct: number) {
    return this.sendGcode(`M221 S${Math.round(pct)}`);
  }

  setPartFan(pct: number) {
    const s = Math.min(255, Math.max(0, Math.round((pct / 100) * 255)));
    return this.sendGcode(`M106 S${s}`);
  }

  get hasLight(): boolean {
    return this.objects.light !== null && this.state.misc.cameralight !== undefined;
  }

  toggleCameralight() {
    const light = this.objects.light;
    if (!light) return Promise.resolve(false);
    const pin = light.slice('output_pin '.length);
    const next = (this.state.misc.cameralight || 0) > 0 ? 0 : 1;
    return this.sendGcode(`SET_PIN PIN=${pin} VALUE=${next}`);
  }

  async extrude(length: number = 25, speed: number = 5) {
    if (!this.guard(this.motionLocked)) return false;
    return this.sendGcode(`M83\nG1 E${Math.abs(length)} F${speed * 60}`);
  }

  async retract(length: number = 25, speed: number = 10) {
    if (!this.guard(this.motionLocked)) return false;
    return this.sendGcode(`M83\nG1 E-${Math.abs(length)} F${speed * 60}`);
  }

  // --- Spoolman ---------------------------------------------------------------

  async fetchSpoolmanData() {
    this.spoolman.loading = true;
    try {
      let spoolId: number | null = null;
      try {
        const res = await this.request('server.spoolman.get_spool_id', {}, { path: '/server/spoolman/spool_id' });
        if (typeof res?.spool_id === 'number') spoolId = res.spool_id;
      } catch {
        // Spoolman component not configured
      }

      if (!spoolId) {
        this.spoolman.spool_id = null;
        this.spoolman.spool = null;
        return;
      }

      this.spoolman.spool_id = spoolId;
      const spoolObj = await this.request(
        'server.spoolman.proxy',
        { request_method: 'GET', path: `/v1/spool/${spoolId}` },
        { verb: 'POST', path: '/server/spoolman/proxy' },
      );
      if (spoolObj) {
        // v2 proxy responses wrap the payload in { response, error }
        this.spoolman.spool = spoolObj.response ?? spoolObj.result ?? spoolObj;
      }
    } catch (e) {
      console.warn('Spoolman fetch error:', e);
    } finally {
      this.spoolman.loading = false;
    }
  }
}

export const moonraker = new MoonrakerClient();
