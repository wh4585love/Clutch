import React from 'react';
import { useLanguage } from './LanguageContext';
import { LegacyIcon } from './ui/LegacyIcon';
import {
  HEADER_BREADCRUMB_LEFT_PADDING_PX,
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_EXPANDED_WIDTH_PX,
} from '../constants/layout';

export type AppWorkspaceMode = 'coding' | 'design';

interface HeaderProps {
  currentFlow: string;
  workspaceName?: string;
  onPickWorkspace?: () => void;
  folders?: any[];
  sidebarOpen?: boolean;
  appMode: AppWorkspaceMode;
  onAppModeChange: (mode: AppWorkspaceMode) => void;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentFlow,
  workspaceName,
  onPickWorkspace,
  folders,
  sidebarOpen = true,
  appMode,
  onAppModeChange,
  rightPanelOpen,
  onToggleRightPanel,
}) => {
  const { t } = useLanguage();

  const parentFolder = folders?.find((folder) =>
    folder.items.some((item: { name: string }) => item.name === currentFlow),
  );

  const parentLabel = workspaceName
    || (parentFolder
      ? parentFolder.name.charAt(0).toUpperCase() + parentFolder.name.slice(1)
      : 'Workspace');

  return (
    <header
      data-tauri-drag-region
      className="fixed top-0 right-0 h-[48px] bg-background/85 backdrop-blur-md border-b border-outline-variant z-40 flex items-center justify-between pr-2 select-none transition-[left] duration-200 ease-out"
      style={{
        left: sidebarOpen ? SIDEBAR_EXPANDED_WIDTH_PX : SIDEBAR_COLLAPSED_WIDTH_PX,
        paddingLeft: HEADER_BREADCRUMB_LEFT_PADDING_PX,
      }}
    >
      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-2 text-xs font-semibold tracking-wide text-on-surface-variant">
          <span
            onClick={onPickWorkspace}
            className="hover:text-primary cursor-pointer font-bold transition-colors"
            title={t('Select workspace')}
          >
            {t(parentLabel)}
          </span>
          <span className="text-outline-variant text-[10px] select-none">/</span>
          <span className="text-on-surface font-extrabold">
            {t(currentFlow)}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant/30"
          data-testid="app-mode-toggle"
        >
          <button
            type="button"
            data-testid="mode-coding"
            onClick={() => onAppModeChange('coding')}
            className={`px-3 py-1 text-[11px] rounded-md transition-all cursor-pointer ${
              appMode === 'coding'
                ? 'bg-surface-bright text-on-surface font-bold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
          >
            {t('Coding')}
          </button>
          <button
            type="button"
            data-testid="mode-design"
            onClick={() => onAppModeChange('design')}
            className={`px-3 py-1 text-[11px] rounded-md transition-all cursor-pointer ${
              appMode === 'design'
                ? 'bg-surface-bright text-on-surface font-bold shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            }`}
          >
            {t('Design')}
          </button>
        </div>

        {onToggleRightPanel && (
          <button
            type="button"
            data-testid="header-right-panel-toggle"
            onClick={onToggleRightPanel}
            title={rightPanelOpen ? t('Collapse Panel') : t('Expand Panel')}
            aria-label={rightPanelOpen ? t('Collapse Panel') : t('Expand Panel')}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <LegacyIcon
              name={rightPanelOpen ? 'right_panel_close' : 'right_panel_open'}
              className="text-[17px]"
            />
          </button>
        )}
      </div>
    </header>
  );
};
