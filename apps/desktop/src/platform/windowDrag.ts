import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type React from 'react';

/** Start native window drag from empty chrome areas (macOS overlay title bar). */
export function beginWindowDrag(e: React.MouseEvent) {
  if (e.buttons !== 1 || !isTauri()) return;
  const target = e.target as HTMLElement;
  if (target.closest('button, a, input, textarea, select, nav, [role="button"]')) return;
  void getCurrentWindow().startDragging();
}
