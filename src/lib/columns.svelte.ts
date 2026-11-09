// Show/hide state for optional table columns, remembered per table in localStorage.
import { storageGet, storageSet } from './storage';

export interface ColumnDef {
  id: string;
  /** i18n key of the column title. */
  label: string;
  /** Visible until the user changes it (default true). */
  visible?: boolean;
}

export class ColumnSet {
  readonly defs: ColumnDef[];
  visible = $state<Record<string, boolean>>({});
  private readonly storageKey: string;

  constructor(storageKey: string, defs: ColumnDef[]) {
    this.storageKey = storageKey;
    this.defs = defs;
    let saved: Record<string, unknown> = {};
    try {
      saved = JSON.parse(storageGet(storageKey) ?? '{}') ?? {};
    } catch {
      // ignore broken value
    }
    this.visible = Object.fromEntries(
      defs.map((d) => [d.id, typeof saved[d.id] === 'boolean' ? (saved[d.id] as boolean) : d.visible !== false]),
    );
  }

  has(id: string): boolean {
    return this.visible[id] ?? false;
  }

  /** Number of visible optional columns (for colspan). */
  get count(): number {
    return this.defs.filter((d) => this.visible[d.id]).length;
  }

  toggle(id: string) {
    this.visible[id] = !this.visible[id];
    this.save();
  }

  reset() {
    for (const d of this.defs) this.visible[d.id] = d.visible !== false;
    this.save();
  }

  private save() {
    storageSet(this.storageKey, JSON.stringify(this.visible));
  }
}
