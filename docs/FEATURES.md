# Moonlite Feature Reference

Moonlite covers the everyday Mainsail features with a much smaller browser footprint.

---

## 1. Mainsail-Style 3-Column Dashboard

The dashboard layout conforms to Mainsail's 3-column architecture, constrained with a centered maximum width (`max-width: 1720px; margin: 0 auto; padding: 16px 28px;`) so it looks comfortable on both standard 1080p displays and ultrawide monitors.

```
+-----------------------------------------------------------------------------------------+
| [Header]: Status | Host/Port Editor | Language Menu | Print Lock | Emergency STOP        |
+-----------------------------------------------------------------------------------------+
| [Sidebar] | Col 1 (Status & Toolhead) | Col 2 (Temps, Fans, Spool) | Col 3 (Extruder, Cam, Log) |
|           |                           |                            |                            |
| 📊 Dash   | [StatusCard] (Standby/Act)| [TempCard] (Canvas Graph)  | [ControlsCard] (Extruder)  |
| 📁 Files  | [JogCard] (Toolhead & Z)  | [MiscCard] (Fans & Lights) | [CameraCard] (On-demand)   |
| ⏱️ History|                           | [SpoolmanCard] (3-Spoke)   | [ConsoleCard] (G-code)     |
| 🗺️ Mesh   |                           |                            |                            |
| ⚙️ Config |                           |                            |                            |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Core Dashboard Widgets

### 2.1. StatusCard (`src/lib/components/StatusCard.svelte`)
Adapts dynamically based on Klipper's print state:

* **Standby Mode (Printer Idle)**:
  - Hides empty telemetry grids and old print models.
  - Automatically loads and displays the **5 newest uploaded G-code files**.
  - Shows 3D preview thumbnail, filename, filament length/weight, and estimated print duration.
  - Includes a 1-click **Play / Start Print** button for instant print execution.
* **Active Print Mode (`printing`, `paused`)**:
  - Displays the enlarged 3D render thumbnail (190px centered preview with drop shadow).
  - Displays circular progress percentage and estimated time of arrival (ETA).
  - Displays layer progress (e.g. `Layer 72 of 201`; from `SET_PRINT_STATS_INFO` when the slicer emits it, otherwise estimated from Z), print speed %, and extrusion flow %.
  - Header actions:
    - `⏸ Pause` when printing.
    - `▶️ Resume` and `⏹ Cancel Print` when paused.
* **Complete / Cancelled Mode**:
  - Displays 🧹 **Clear (Reset)** button: sends `SDCARD_RESET_FILE` to Klipper to return the interface to Standby mode.
  - Displays 🖨️ **Reprint** button: starts the same file again with one click.

### 2.2. SpoolmanCard (`src/lib/components/SpoolmanCard.svelte`)
Placed at the bottom of Column 2 (under Fans and Macros):
* Connects directly to the Spoolman database via Moonraker's proxy.
* Visual presentation modeled after Mainsail:
  - Top tag: `#{spool_id} | {VENDOR_NAME}`
  - Filament title: Bold filament name (e.g. `PETG White`)
  - Subtitle: Material, remaining weight, full spool weight (`initial_weight` or `filament.weight`), and remaining length (e.g. `PETG | 565g / 1kg | 191m`). Fields Spoolman does not report are hidden.
  - **Authentic 3-Spoke Spool Graphic**: An SVG spool with 3 curved windows cut into the flange displaying the exact filament hex color (`#F5F5F5`).
  - Remaining filament progress bar.
  - Recommended Nozzle and Bed temperatures (e.g. `255°C / 80°C`).

### 2.3. TempCard (`src/lib/components/TempCard.svelte`)
* Monitors Extruder, Heater Bed, and every `temperature_sensor` / `temperature_host` the printer defines.
* Fast preset buttons: `PLA (210/60)`, `PETG (235/75)`, `ABS (250/105)`, and `OFF`.
* **Canvas Chart**:
  - 60 samples taken every 2 seconds (≈ 2 minutes of history).
  - Direct 2D canvas drawing, sharp on HiDPI screens.
  - The canvas is cleared and repainted on every sample.

### 2.4. JogCard (`src/lib/components/JogCard.svelte`)
* Toolhead coordinate readout (X, Y, Z).
* Jog rows: X/Y `±1`, `±10`, `±100 mm`; Z `±0.1`, `±1`, `±25 mm`.
* Homing buttons: `ALL (G28)`, `X`, `Y`, `Z`, `Z-TILT`, `M84 (Motors Off)`.
* Live Babystepping (Z-Offset): `±0.005`, `±0.01`, `±0.025`, `±0.05 mm`.
* Speed factor slider (20% – 250%, applied on release).
* Interlocked with the **Print Lock**: moves and homing are disabled while printing (allowed while paused); `Z-TILT` and `M84` are disabled while printing or paused.

### 2.5. ControlsCard (`src/lib/components/ControlsCard.svelte`)
* Clean extruder controls card dedicated to extrusion flow and manual feed:
  - Extrusion factor (Flow %) slider: 50% – 150%, applied on release, plus ±5% buttons.
  - Filament length presets: 1, 5, 10, 25, 50 mm.
  - Feedrate presets: 1, 2, 5, 10 mm/s.
  - Manual `Retract` and `Extrude` buttons (locked during active printing).

### 2.6. CameraCard (`src/lib/components/CameraCard.svelte`)
* Keeps the camera out of the way until needed:
  - Default state is **OFF**.
  - **Snapshot mode**: refreshes a single JPEG every 2 seconds instead of keeping a stream open.
  - **Live Stream mode**: shows the MJPEG stream; turning the camera off closes it.
  - The source path is editable; the snapshot URL is derived from it (`action=stream` → `action=snapshot`).

### 2.7. ConsoleCard (`src/lib/components/ConsoleCard.svelte`)
* Real-time G-code terminal for Moonraker and Klipper.
* Command input with history and shortcut pills (`STATUS`, `M105`, `GET_POSITION`, `M115`).
* Log limited to 100 messages with auto-scroll toggle and clear button.

---

## 3. Dedicated Navigation Tabs

### 3.1. Print History Tab (`src/lib/components/HistoryTab.svelte`)
* **Statistics KPI Cards**:
  - Total print time (e.g. `940h 7m`).
  - Longest print duration.
  - Average print time (`Print Time - Ø`).
  - Total filament consumed in meters/km.
  - Total job count.
* **Completion Rate Donut Chart**:
  - Pure SVG vector donut displaying percentage of successful jobs vs cancelled/error jobs.
* **Daily Activity Bar Chart**:
  - Interactive histogram of recent days with toggle between `Filament (m)` and `Print Time (h)`.
* **Searchable & Paginated Table**:
  - Filters: `All`, `Completed`, `Cancelled` (over the last 200 jobs).
  - Search: Real-time search across filenames, slicers, and filaments (over the last 200 jobs).
  - Row items: 3D preview thumbnail, filename, status badge, start time, estimated vs actual duration with delta, filament usage, and slicer version.
  - 1-click **Reprint** (disabled when the file no longer exists) and **Delete** actions.

### 3.2. G-Code Files Tab (`src/lib/components/FilesTab.svelte`)
* File manager for files stored in Klipper's `gcodes/` root (including subfolders); refreshes automatically when files change.
* Search and sort by Date, Name, or Size.
* Cards view with 3D model thumbnails, slicer tags, and direct print/delete actions.
* Upload G-code files via the file picker.

### 3.3. Bed Mesh Visualizer (`src/lib/components/BedMeshTab.svelte`)
* 2D heatmap of the probed mesh (back of the bed at the top) with min/max/variance.
* Color gradient showing high spots (warm red/yellow) and low spots (cool blue).
* Saved profile switching (`BED_MESH_PROFILE LOAD`).
* One-click calibration (`BED_MESH_CALIBRATE`); the heatmap reloads when it finishes.

### 3.4. Configuration Tab (`src/lib/components/ConfigTab.svelte`)
* Editor for printer configuration files (`printer.cfg`, macros, etc.).
* **Save**, and **Save & Restart** (`FIRMWARE_RESTART`, refused while printing or paused).
* Warns before discarding unsaved changes (switching files, switching tabs, closing the page).

---

## 4. Multilingual System (i18n)

Moonlite features a zero-dependency reactive i18n engine ([i18n.svelte.ts](../src/lib/i18n.svelte.ts)) supporting 4 languages with instant switching via an SVG globe dropdown in the header:

1. **English (EN)**
2. **Русский (RU)**
3. **Polski (PL)**
4. **Biełaruskaja Łacinka (BE)**:
   - Formatted in strict classical Belarusian Latin script (*Kłasičnaja Biełaruskaja Łacinka*):
   - Example translations: *Čakańnie (Idle)*, *Drukujecca*, *Kirovańnie*, *Pauza*, *Zastałosia*, *Fiłamient*, *Skasavać druk*.
