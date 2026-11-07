# Moonraker & Spoolman API Integrations

This document provides a technical reference for the Moonraker JSON-RPC and REST APIs used throughout Moonlite.

---

## 1. Connection & Protocol

Moonlite communicates primarily over **WebSocket** using JSON-RPC 2.0. In production it uses the page's own origin (`ws://<host>:81/websocket`, proxied by nginx to Moonraker); the dev server connects to `ws://<host>:7125/websocket`. While the WebSocket is down (e.g. during a reconnect), read requests fall back to the equivalent Moonraker HTTP endpoints. JSON-RPC errors are never retried over HTTP.

### JSON-RPC 2.0 Payload Structure:
```json
{
  "jsonrpc": "2.0",
  "method": "<method_name>",
  "params": { ... },
  "id": 123
}
```

---

## 2. Printer Subscriptions & Status Updates

After connecting, Moonlite calls `printer.info`. Once Klippy is `ready` it calls `printer.objects.list` and subscribes (`printer.objects.subscribe`) to the objects below **that exist on the printer**. Optional peripherals are discovered by type: a light `output_pin` (`cameralight` or any pin named `*light*`/`*led*`), the first `heater_fan`, the first `controller_fan`, and the first `filament_switch_sensor`/`filament_motion_sensor`. All `temperature_sensor` and `temperature_host` objects are included.

### Example subscription (Sovol SV06 ACE):
```json
{
  "jsonrpc": "2.0",
  "method": "printer.objects.subscribe",
  "params": {
    "objects": {
      "print_stats": null,
      "display_status": null,
      "virtual_sdcard": null,
      "extruder": null,
      "heater_bed": null,
      "toolhead": null,
      "fan": null,
      "gcode_move": null,
      "temperature_sensor mcu_Temp": null,
      "temperature_sensor Toolhead_Temp": null,
      "temperature_sensor soc": null,
      "output_pin cameralight": null,
      "heater_fan hotend_fan": null,
      "controller_fan board_fan": null,
      "filament_switch_sensor filament_sensor": null
    }
  },
  "id": 2
}
```

### Notifications Handled:
* `notify_status_update`: Deltas for subscribed objects — only changed fields are present.
* `notify_gcode_response`: Output from G-code execution, shown in the console (`!!` lines as errors).
* `notify_klippy_ready`: Klippy (re)started — Moonlite re-queries objects and re-subscribes.
* `notify_klippy_shutdown` / `notify_klippy_disconnected`: Klippy state shown in a banner; readiness is re-checked every 5 s until ready.
* `notify_filelist_changed`: Reloads the file lists (debounced).
* `notify_active_spool_set` / `notify_spoolman_status_changed`: Reloads the active spool.

---

## 3. Spoolman Integration

Moonraker has built-in integration with Spoolman (`http://127.0.0.1:7912`), configured in `moonraker.conf`:

```ini
[spoolman]
server: http://127.0.0.1:7912
sync_rate: 5
```

### 3.1. Retrieving Active Spool ID
* **JSON-RPC Method**: `server.spoolman.get_spool_id`
* **HTTP Endpoint**: `GET /server/spoolman/spool_id`
* **Response**:
  ```json
  { "result": { "spool_id": 1007893841 } }
  ```

### 3.2. Querying Spool Details via Moonraker Proxy
To avoid CORS restrictions and separate port routing, queries are proxied through Moonraker:
* **JSON-RPC Method**: `server.spoolman.proxy`
* **Params**:
  ```json
  {
    "request_method": "GET",
    "path": "/v1/spool/1007893841"
  }
  ```
* **HTTP Endpoint**: `POST /server/spoolman/proxy` with body:
  ```json
  {
    "request_method": "GET",
    "path": "/v1/spool/1007893841"
  }
  ```

### 3.3. Key Fields Extracted by SpoolmanCard:
* `filament.name`: e.g. `"PETG White"`
* `filament.vendor.name`: e.g. `"Sunlu"`
* `filament.material`: e.g. `"PETG"`
* `filament.color_hex`: e.g. `"F5F5F5"` (or parsed from `colors[0]`)
* `remaining_weight` and `initial_weight` (or `filament.weight`): used for the progress bar and percentage
* `remaining_length`: stored in mm, divided by 1000 for display in meters
* `filament.settings_extruder_temp` & `settings_bed_temp`: recommended slicer temperatures

### 3.4. Reactive Events:
Moonraker sends `notify_active_spool_set` when the active spool changes and `notify_spoolman_status_changed` when the Spoolman connection state changes.

---

## 4. Print History API

Moonraker maintains print metrics in an SQLite database accessible through the history component.

### 4.1. Aggregated Totals
* **Method / Endpoint**: `GET /server/history/totals` or `server.history.totals`
* **Response Data**:
  - `total_jobs`: Total number of print jobs executed.
  - `total_time`: Total cumulative job duration in seconds.
  - `total_print_time`: Cumulative active extrusion duration in seconds.
  - `total_filament_used`: Cumulative filament extruded in mm.
  - `longest_job` & `longest_print`: Maximum durations in seconds.

### 4.2. Job List & Pagination
* **Endpoint**: `GET /server/history/list?limit=25&start=0`
* **Returned Fields per Job**:
  - `job_id`: Unique identifier (e.g. `"00033B"`).
  - `filename`: Name of the printed file.
  - `status`: `"completed"`, `"cancelled"`, `"in_progress"`, `"error"`.
  - `start_time` & `end_time`: Unix epoch timestamps in seconds.
  - `print_duration` & `total_duration`: Elapsed times in seconds.
  - `filament_used`: Filament consumed in mm.
  - `metadata.thumbnails`: Thumbnails; `relative_path` is relative to the **directory of the G-code file**, not to the `gcodes` root.
  - `metadata.slicer` & `metadata.slicer_version`: Slicer identifier.
  - `auxiliary_data`: Includes linked Spoolman spool IDs.
  - `exists`: Boolean indicating whether the gcode file is still present on disk.

### 4.3. Deleting History Entries
* **Endpoint**: `DELETE /server/history/job?uid=<job_id>` or `server.history.delete_job` with `{ uid: "<job_id>" }`.

---

## 5. Critical Print Control Commands

### 5.1. Starting a Print
```json
{
  "jsonrpc": "2.0",
  "method": "printer.print.start",
  "params": { "filename": "EGG+Holder_PETG_0.2_2h10m.gcode" },
  "id": 10
}
```

### 5.2. Pausing & Resuming
* Pause: `printer.print.pause`
* Resume: `printer.print.resume`
* Cancel: `printer.print.cancel`

### 5.3. Clearing Finished State (Reset)
When a print completes or is cancelled, Klipper keeps the file loaded in the virtual SD card. To return to Standby mode:
```gcode
SDCARD_RESET_FILE
```
This resets `virtual_sdcard.is_active` to `false` and transitions `print_stats.state` back to `'standby'`.

### 5.4. Emergency Stop
* **Method**: `printer.emergency_stop` (sends `M112` to firmware). Halts all stepper motors and disables heater PWM instantly.
