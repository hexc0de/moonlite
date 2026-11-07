/// <reference types="svelte" />
/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Moonraker host used by `npm run dev` (port 7125). */
  readonly VITE_PRINTER_HOST?: string;
}
