import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type React from 'react';

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, nav, [role="button"], [contenteditable="true"]';

/** Start native window drag from empty chrome areas (macOS overlay title bar). */
export function beginWindowDrag(e: React.MouseEvent) {
  if (e.buttons !== 1 || !isTauri()) return;
  const target = e.target as HTMLElement;
  if (target.closest(INTERACTIVE_SELECTOR)) return;
  void getCurrentWindow().startDragging();
}

/**
 * Codex-style global title-bar strip: any press in the top `height` px of the
 * window that is not on an interactive control drags the window.
 */
export function installTitlebarDrag(height = 28): () => void {
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.clientY > height || !isTauri()) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    void getCurrentWindow().startDragging();
  };
  document.addEventListener('mousedown', onMouseDown);
  return () => document.removeEventListener('mousedown', onMouseDown);
}
