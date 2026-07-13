import React from 'react';
import { useLanguage } from '../LanguageContext';
import { LegacyIcon } from './LegacyIcon';
import { ALERT_INFO } from './surfaceStyles';

type UnderDevelopmentNoticeProps = {
  variant?: 'banner' | 'compact';
  className?: string;
};

export const UnderDevelopmentNotice: React.FC<UnderDevelopmentNoticeProps> = ({
  variant = 'banner',
  className = '',
}) => {
  const { t } = useLanguage();

  if (variant === 'compact') {
    return (
      <div className={`flex items-start gap-2 ${ALERT_INFO} ${className}`}>
        <LegacyIcon name="construction" className="text-[14px] shrink-0 mt-0.5 text-neutral-500" />
        <p className="text-[10px] leading-relaxed font-medium">{t('Feature under active development')}</p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-outline-variant/50 text-on-surface-variant/70 ${className}`}
    >
      <LegacyIcon name="construction" className="text-[14px] shrink-0" />
      <p className="text-[11px] leading-snug">{t('Feature under active development')}</p>
    </div>
  );
};
