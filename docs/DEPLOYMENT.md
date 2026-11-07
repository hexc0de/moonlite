# Moonlite Deployment Guide

This guide details how to build and deploy Moonlite to any Linux-based Klipper host (such as Sovol SV06 ACE, BigTreeTech CB1, Raspberry Pi, etc.).

---

## 1. Multi-Port Architecture

By default, existing web interfaces (such as Mainsail or Fluidd) occupy port 80. To guarantee safe operation and allow side-by-side usage without breaking anything:

* **Port 80**: Existing Mainsail installation (e.g. `/home/pi/mainsail`)
* **Port 81**: **Moonlite** production build (e.g. `/home/pi/moonlite`)
* **Port 7125**: Moonraker JSON-RPC API & WebSockets
* **Port 7912**: Spoolman service
* **Port 8080**: MJPG-Streamer webcam stream

---

## 2. Automated 1-Click Deployment (`deploy.sh`)

The repository includes a self-contained deployment script template, [`deploy.example.sh`](../deploy.example.sh).
Copy it to `deploy.sh` once — that file is gitignored, so you can put your printer's defaults
(host, user) into it without committing them:

```bash
cp deploy.example.sh deploy.sh
./deploy.sh 192.168.1.50    # printer address (or set PRINTER_HOST / edit the default in deploy.sh)
```

### What `deploy.sh` does:
1. Builds the production bundle (`npm run build`).
2. Creates the target directory on the printer over SSH.
3. Synchronizes `dist/` with `rsync -avz --delete`.
4. Renders the nginx site template [`nginx/moonlite.conf`](../nginx/moonlite.conf) with your settings
   and writes it to `/etc/nginx/sites-available/moonlite`. The site:
   - serves the UI on `NGINX_PORT` (**81** by default, next to Mainsail on 80);
   - proxies Moonraker (`/websocket`, `/server/…`, `/printer/…`, `/machine/…`, `/access/…`, `/api/…`) to `127.0.0.1:7125`;
   - proxies the webcam (`/webcam/`) to `127.0.0.1:8080`;
   - defines its own `$moonlite_connection_upgrade` map, so it does not depend on Mainsail's/Fluidd's nginx files.

   The template is rendered before anything is copied, so a missing value stops the script early.
5. Enables the site, runs `nginx -t` and reloads nginx.

Because Moonraker and the webcam are reached through the same origin as the UI, no `cors_domains` change is needed in `moonraker.conf`.

> [!NOTE]
> Reloading nginx via `systemctl reload` does **not** interrupt Klipper prints or Moonraker.

---

## 3. Configuring Target Host & SSH

The printer address is the first argument (or `PRINTER_HOST`). Everything else can be overridden with
environment variables, or by changing the defaults in your local `deploy.sh`:

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `PRINTER_HOST` | — (required) | Printer address, if not passed as an argument |
| `PRINTER_USER` | `pi` | SSH user (e.g. `sovol` on Sovol printers) |
| `REMOTE_DIR` | `/home/$PRINTER_USER/moonlite` | Where `dist/` is copied |
| `NGINX_PORT` | `81` | Port of the Moonlite site |
| `MOONRAKER_UPSTREAM` | `127.0.0.1:7125` | Moonraker address as seen from the printer |
| `WEBCAM_UPSTREAM` | `127.0.0.1:8080` | Webcam streamer address |

```bash
PRINTER_USER=sovol NGINX_PORT=8081 ./deploy.sh 192.168.1.50
```

### Setting up Passwordless SSH (Recommended):
```bash
ssh-copy-id pi@<printer-ip>
```

---

## 4. Manual Deployment (Alternative)

### Step 1: Build locally
```bash
npm install
npm run build
```

### Step 2: Copy `dist` to host
```bash
rsync -avz --delete dist/ pi@<printer-ip>:/home/pi/moonlite/
```

### Step 3: Configure nginx
The site config is [`nginx/moonlite.conf`](../nginx/moonlite.conf). Fill in its four placeholders
and install it in one go (run from the repository root on your computer; adjust the values):

```bash
sed -e 's|{{NGINX_PORT}}|81|g' \
    -e 's|{{ROOT_DIR}}|/home/pi/moonlite|g' \
    -e 's|{{MOONRAKER_UPSTREAM}}|127.0.0.1:7125|g' \
    -e 's|{{WEBCAM_UPSTREAM}}|127.0.0.1:8080|g' \
    nginx/moonlite.conf \
  | ssh pi@<printer-ip> "sudo tee /etc/nginx/sites-available/moonlite > /dev/null"
```

Already on the printer? Drop the `ssh …` part and pipe into `sudo tee /etc/nginx/sites-available/moonlite` directly.
The Moonraker proxy locations are required: the production build connects to Moonraker through the page's own origin.

Enable and reload (on the printer):
```bash
sudo ln -sf /etc/nginx/sites-available/moonlite /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> [!TIP]
> To serve Moonlite on port 80 instead of Mainsail, set the port to `80` and disable the Mainsail site first
> (`sudo rm /etc/nginx/sites-enabled/mainsail`), otherwise both sites compete for the port.

---

## 5. Troubleshooting

* **"Disconnected" in the header** — open `http://<printer-ip>:81/server/info` in the browser. If it fails, the nginx proxy to Moonraker is not working (check `MOONRAKER_UPSTREAM` and `/var/log/nginx/moonlite-error.log`).
* **Wrong printer / custom setup** — click the address in the header and enter an IP and port explicitly. The UI then talks to Moonraker directly, which is cross-origin: add the UI origin (e.g. `http://<printer-ip>:81`) to `cors_domains` in `moonraker.conf`. Leave the IP empty to go back to automatic (same-origin) mode.
* **Klippy banner stays visible** — Klipper is not `ready` (startup, shutdown or config error); the banner shows Klipper's message. The UI re-subscribes automatically once Klipper is ready.
* **No camera image** — check `http://<printer-ip>:81/webcam/?action=snapshot`; adjust `WEBCAM_UPSTREAM` or the camera path in the Camera card.

---

## 6. Using Moonlite in OrcaSlicer

To make Moonlite your primary device view in OrcaSlicer:
1. Open OrcaSlicer.
2. Select your printer profile.
3. Click the **Wi-Fi** icon (Device Connection).
4. In the **UI URL**, enter:
   ```
   http://<printer-ip>:81/
   ```
5. Click **Test** and **Save**.
6. Switch to the **Device** tab.
