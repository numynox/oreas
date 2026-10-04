/**
 * Svelte action: move an element to <body>.
 *
 * Needed for `position: fixed` popups inside the glass panels: an ancestor with `backdrop-filter`
 * becomes the containing block for fixed descendants, so they would be positioned and clipped
 * relative to the panel instead of the viewport.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
