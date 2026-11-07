# ⚡ Moonlite

**Ultra-lightweight, zero-memory-leak web interface for Klipper 3D printers.**

Built on a **Sovol SV06 ACE** but usable with any Klipper + Moonraker printer, and aimed at embedded slicer webviews (like OrcaSlicer's Device tab), Moonlite delivers a Mainsail-style user experience with a deliberately small runtime footprint: no polling loops, bounded buffers and no charting libraries.

---

## 🚀 Why Moonlite?

When monitoring long 3D prints via OrcaSlicer's built-in browser or macOS WebKit tabs, full-featured interfaces like Mainsail or Fluidd have been observed (on the author's setup) to grow to several GB of RAM over a long print, causing system-wide lag.

Moonlite is written from the ground up in **Svelte 5** and **TypeScript**:

* **Leak-Resistant Visuals**: Native HTML5 Canvas for temperature curves (bounded 60-sample buffer) and plain SVG for the status donut and activity charts. No Chart.js, no ApexCharts, no D3.js.
* **On-Demand Camera**: The camera is off by default. When turned on it either refreshes a JPEG snapshot every 2 seconds or shows the live MJPEG stream.
* **Tiny Footprint**: The production JS bundle is **~50 kB gzipped**.

---

## ✨ Features at a Glance

* **3-Column Mainsail Layout**: Comfortable on standard displays and centered with max-width boundaries for ultrawide screens.
* **Dynamic Standby Mode**: When printer is idle, automatically displays the **5 newest uploaded G-code files** with full slicer metadata, filament usage, and instant 1-click print buttons.
* **Active Print Monitor**: Centered 3D model render thumbnail, circular progress, layer progress, ETA, speeds, and extrusion flow.
* **Completed Print Actions**: Mainsail-style 🧹 **Clear (Reset)** button (`SDCARD_RESET_FILE`) and 🖨️ **Reprint** button.
* **Spoolman Integration**: Live active filament tracking with an authentic 3-spoke vector spool graphic reflecting real filament hex color, remaining weight/length, and recommended nozzle/bed temperatures.
* **Print History Tab**: Mainsail-style statistics with KPI summary, Donut completion rate, daily activity bars, searchable table, and 1-click reprint/delete.
* **Toolhead & Babystepping**: Jog buttons, live Z-offset adjustments (`±0.005` … `±0.05 mm`), and a Print Lock that blocks moves, homing, motors-off and calibration macros during a print.
* **G-code Console & Macro Triggers**: Real-time terminal with command history and quick macro buttons (`Z-TILT`, `Bed Mesh`, `Motors Off`).
* **Bed Mesh Heatmap**: 2D bed mesh heatmap with profile switching and 1-click calibration.
* **Configuration Editor**: Integrated editor for `printer.cfg` and other config files with Save and Save & `FIRMWARE_RESTART`.
* **Multilingual (i18n)**: English (EN), Русский (RU), Polski (PL), and strict classical Biełaruskaja Łacinka (BE) with an SVG globe selector.
* **Safety Lock & Emergency Stop**: Emergency stop (`M112`) in the header acts on the first click, without a confirmation dialog.

---

## 🛠️ Quick Start

### 1. Requirements
* Node.js 18+ (tested on Node 20 & 22)
* Any printer running Klipper + Moonraker (e.g. Sovol SV06 ACE)

### 2. Local Development
```bash
git clone https://github.com/hexc0de/moonlite.git
cd moonlite
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser. In development the UI connects directly to Moonraker on port 7125 of the host given by `VITE_PRINTER_HOST` (copy `.env.example` to `.env.local`), or of the page's own host. You can also click the address in the header and type an IP/port; it is remembered in the browser (leave the IP empty to return to automatic detection).

> Talking to Moonraker directly from `localhost:5173` is a cross-origin request: add the dev origin to `cors_domains` in `moonraker.conf` if the connection is refused.

### 3. Production Build
```bash
npm run build
```
Builds the static application to `dist/`.

### 4. Type Check
```bash
npm run check
```

---

## 🚢 1-Click Deployment to Printer

Deploy Moonlite directly to your printer's Nginx server alongside Mainsail without interrupting active prints:

```bash
cp deploy.example.sh deploy.sh   # once; deploy.sh is gitignored, so set your own defaults in it
./deploy.sh 192.168.1.50
```

The script:
1. Builds the latest production bundle.
2. Synchronizes files via `rsync` to `/home/<user>/moonlite`.
3. Configures and enables an isolated Nginx site on **port 81** (from the template [`nginx/moonlite.conf`](./nginx/moonlite.conf)) that also proxies Moonraker (`/websocket`, `/server`, …) and the webcam (`/webcam/`), so the UI talks to the printer through its own origin — no CORS setup needed.
4. Reloads Nginx (`sudo systemctl reload nginx`).

Pass the printer address as an argument (or `PRINTER_HOST`) and override `PRINTER_USER` (default `pi`), `REMOTE_DIR`, `NGINX_PORT`, `MOONRAKER_UPSTREAM`, `WEBCAM_UPSTREAM` via environment variables, or change the defaults in your local `deploy.sh`.

Access your printer:
* **Moonlite**: `http://<printer-ip>:81/`
* **Mainsail** (untouched): `http://<printer-ip>/`

To use Moonlite in **OrcaSlicer**, simply set your printer's UI URL to `http://<printer-ip>:81/` in the device connection settings.

---

## 📖 In-Depth Documentation

Detailed guides and technical references are available in the [`docs/`](./docs/) directory:

* 🏗️ [**Architecture & Design Philosophy**](./docs/ARCHITECTURE.md): The WebKit memory problem and how the Svelte 5 client is built.
* 🚀 [**Deployment Guide**](./docs/DEPLOYMENT.md): Detailed Nginx and SSH configuration.
* 📋 [**Feature Reference**](./docs/FEATURES.md): Comprehensive breakdown of all components and tabs.
* 🔌 [**Moonraker & Spoolman API Integrations**](./docs/API_INTEGRATIONS.md): JSON-RPC, WebSockets, and Spoolman endpoints.

---

## 📄 License

[MIT](./LICENSE) © Dzianis Tytsik. Designed and crafted for the 3D printing community.

Bundled icons: [Lucide](https://lucide.dev) (ISC) and [Material Design Icons](https://pictogrammers.com) (Apache 2.0); notices in [`src/lib/icons.ts`](./src/lib/icons.ts).
