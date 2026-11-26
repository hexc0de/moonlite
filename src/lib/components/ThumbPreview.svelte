<script lang="ts">
  // Small model thumbnail; hovering it shows the large slicer thumbnail in a floating card.
  // The large image is only requested on the first hover.
  let { small, large, alt }: { small: string; large?: string; alt: string } = $props();

  const SIZE = 260; // popup image box, px
  const GAP = 12;

  let pos = $state<{ left: number; top: number } | null>(null);

  function show(e: MouseEvent) {
    if (!large) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const box = SIZE + 18; // image + padding/border
    // Prefer the right side of the thumbnail; flip left if it would leave the viewport.
    let left = r.right + GAP;
    if (left + box > window.innerWidth - 8) left = Math.max(8, r.left - GAP - box);
    let top = r.top + r.height / 2 - box / 2;
    top = Math.min(Math.max(8, top), window.innerHeight - box - 8);
    pos = { left, top };
  }

  function hide() {
    pos = null;
  }

  // Any scroll (page or the table container) moves the thumbnail away from the popup.
  $effect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  });
</script>

<img src={small} {alt} class="thumb-img" class:zoomable={!!large} onmouseenter={show} onmouseleave={hide} />

{#if pos && large}
  <div class="thumb-popup" style:left="{pos.left}px" style:top="{pos.top}px" style:--size="{SIZE}px">
    <img src={large} {alt} />
  </div>
{/if}

<style>
  .thumb-img {
    width: 44px;
    height: 44px;
    border-radius: 6px;
    background: #111215;
    border: 1px solid #282a30;
    object-fit: contain;
    display: block;
    transition: border-color 0.1s ease;
  }
  .thumb-img.zoomable {
    cursor: zoom-in;
  }
  .thumb-img.zoomable:hover {
    border-color: #38bdf8;
  }

  .thumb-popup {
    position: fixed;
    z-index: 100;
    padding: 8px;
    background: #111215;
    border: 1px solid #374151;
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  .thumb-popup img {
    display: block;
    width: var(--size);
    height: var(--size);
    object-fit: contain;
  }
</style>
