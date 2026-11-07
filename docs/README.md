# Moonlite Documentation

Welcome to the **Moonlite** documentation. This directory contains detailed guides covering the design, architecture, deployment, features, and API integrations of the Moonlite web interface.

---

## 📚 Documentation Index

1. [**Architecture & Design Philosophy**](./ARCHITECTURE.md)
   - Why Moonlite? The WebKit memory leak problem.
   - Svelte 5 Runes architecture.
   - Bounded graphics (Canvas & plain SVG instead of JS chart libraries).
   - Performance notes vs Mainsail / Fluidd.

2. [**Deployment Guide**](./DEPLOYMENT.md)
   - Automated 1-click deployment via `deploy.sh`.
   - Nginx multi-port configuration (serving Moonlite on port 81 alongside Mainsail on port 80).
   - Sovol SV06 ACE and Raspberry Pi setup.
   - Troubleshooting connection, CORS and camera issues.

3. [**Feature Reference**](./FEATURES.md)
   - 3-Column Mainsail-style Dashboard layout.
   - Dynamic Standby mode (5 newest G-code files with instant print).
   - Active Print mode (3D model render, layer metrics, ETA, and progress).
   - Integrated Spoolman filament tracker (authentic 3-spoke vector spool).
   - Temperature monitoring with a 60-sample (≈ 2 min) Canvas graph.
   - On-demand camera (off by default; periodic snapshots or live stream).
   - Print History tab (KPI cards, Donut success chart, daily activity bars, searchable table).
   - Bed Mesh 2D heatmap visualizer.
   - Configuration files editor (`printer.cfg`, macros, save & restart).
   - Multilingual system (English, Russian, Polish, Belarusian in classic Łacinka).

4. [**Moonraker & Spoolman API Integrations**](./API_INTEGRATIONS.md)
   - WebSocket JSON-RPC protocol implementation.
   - Subscription model for Klipper printer objects.
   - Spoolman proxy integration (`get_spool_id`, `proxy`).
   - Print History API endpoints (`totals`, `list`, `delete_job`).
   - Klippy readiness and notifications.
   - G-code execution and emergency stop protocols (`M112`, `SDCARD_RESET_FILE`).
