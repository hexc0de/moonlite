// How many times each G-code file was printed, from Moonraker's job history.
// Only per-file counters are kept; the job records are dropped after counting.
import { moonraker } from './moonraker.svelte';

export interface PrintCount {
  /** Jobs that finished with status "completed". */
  completed: number;
  /** Jobs that were cancelled or ended with an error. */
  failed: number;
}

const PAGE_SIZE = 250;

interface CountedJob {
  filename?: string;
  status?: string;
}

class PrintCounts {
  /** filename -> counters. Replaced as a whole on change (raw state, not deeply reactive). */
  counts = $state.raw<Record<string, PrintCount>>({});
  loaded = $state(false);

  private generation = 0;

  constructor() {
    moonraker.onHistoryChanged((event) => {
      if (event.action === 'finished' && event.job) this.apply(event.job, 1);
    });
  }

  /** Counters for a file; undefined until the history has been loaded. */
  get(filename: string): PrintCount | undefined {
    if (!this.loaded) return undefined;
    return this.counts[filename] ?? { completed: 0, failed: 0 };
  }

  /** Recount from the full history (on connect / reconnect). */
  async load() {
    const gen = ++this.generation;
    const next: Record<string, PrintCount> = {};
    try {
      for (let start = 0; ; start += PAGE_SIZE) {
        const res = await moonraker.request(
          'server.history.list',
          { limit: PAGE_SIZE, start, order: 'desc' },
          { path: '/server/history/list' },
        );
        if (gen !== this.generation) return;
        const jobs: CountedJob[] = res?.jobs ?? [];
        for (const job of jobs) add(next, job, 1);
        if (jobs.length < PAGE_SIZE || start + PAGE_SIZE >= (res?.count ?? 0)) break;
      }
      this.counts = next;
      this.loaded = true;
    } catch (e) {
      console.warn('Failed to load print counts', e);
    }
  }

  /** Call after deleting a history entry, so the counters stay in sync without a reload. */
  forget(job: CountedJob) {
    this.apply(job, -1);
  }

  private apply(job: CountedJob, delta: 1 | -1) {
    if (!this.loaded) return;
    const next = { ...this.counts };
    add(next, job, delta);
    this.counts = next;
  }
}

function add(map: Record<string, PrintCount>, job: CountedJob, delta: 1 | -1) {
  if (!job.filename || !job.status || job.status === 'in_progress') return;
  const prev = map[job.filename] ?? { completed: 0, failed: 0 };
  const entry =
    job.status === 'completed'
      ? { ...prev, completed: Math.max(0, prev.completed + delta) }
      : { ...prev, failed: Math.max(0, prev.failed + delta) };
  map[job.filename] = entry;
}

export const printCounts = new PrintCounts();
