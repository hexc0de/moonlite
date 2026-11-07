<script lang="ts">
  import { icons, type IconName } from '../icons';

  interface Props {
    name: IconName;
    /** CSS size; defaults to the surrounding font size so icons line up with text. */
    size?: string | number;
    /** Accessible label. Without it the icon is decorative (aria-hidden). */
    title?: string;
    class?: string;
  }

  let { name, size = '1.15em', title, class: className = '' }: Props = $props();

  let icon = $derived(icons[name]);
  let filled = $derived('fill' in icon && icon.fill === true);
  let dim = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<svg
  class="icon {className}"
  width={dim}
  height={dim}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke={filled ? 'none' : 'currentColor'}
  stroke-width={filled ? undefined : 2}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={title ? 'img' : undefined}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  <!-- Static markup from src/lib/icons.ts, never user input. -->
  {@html icon.svg}
</svg>

<style>
  .icon {
    display: inline-block;
    flex-shrink: 0;
    vertical-align: -0.2em;
  }

  /* Inside a rotating wrapper the icon must be the wrapper's whole box,
     otherwise the line-height padding makes it wobble around an off-center axis. */
  :global(.spin):has(> .icon) {
    vertical-align: -0.2em;
    line-height: 0;
  }
  :global(.spin) > .icon {
    display: block;
  }
</style>
