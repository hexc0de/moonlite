// In-app replacement for window.confirm()/alert().
// Native dialogs are blocking and are silently suppressed by some embedded
// WebViews (e.g. a WKWebView without a UI delegate returns false from confirm()),
// which would make print start/cancel impossible inside a slicer's device tab.

export interface ConfirmRequest {
  message: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export interface Toast {
  id: number;
  text: string;
  type: 'info' | 'success' | 'error';
}

const TOAST_TTL_MS = 5000;
const MAX_TOASTS = 4;

class UiStore {
  dialog = $state<ConfirmRequest | null>(null);
  toasts = $state<Toast[]>([]);

  /** Set by ConfigTab while the editor holds unsaved changes. */
  configDirty = $state(false);

  private toastId = 0;

  confirm(message: string, opts: { danger?: boolean } = {}): Promise<boolean> {
    // Only one dialog at a time: a newer request cancels the older one.
    this.dialog?.resolve(false);
    return new Promise((resolve) => {
      this.dialog = {
        message,
        danger: opts.danger ?? false,
        resolve: (ok) => {
          this.dialog = null;
          resolve(ok);
        },
      };
    });
  }

  notify(text: string, type: Toast['type'] = 'info') {
    const id = ++this.toastId;
    this.toasts.push({ id, text, type });
    if (this.toasts.length > MAX_TOASTS) {
      this.toasts.splice(0, this.toasts.length - MAX_TOASTS);
    }
    setTimeout(() => this.dismiss(id), TOAST_TTL_MS);
  }

  dismiss(id: number) {
    const idx = this.toasts.findIndex((t) => t.id === id);
    if (idx !== -1) this.toasts.splice(idx, 1);
  }
}

export const ui = new UiStore();

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
