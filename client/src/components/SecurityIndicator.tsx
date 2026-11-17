import React from 'react';
import { ShieldCheck, Lock, EyeOff, Hash } from 'lucide-react';

interface SecurityIndicatorProps {
  isPasswordProtected?: boolean;
  isOneTime?: boolean;
  expiresInDesc?: string;
}

export const SecurityIndicator: React.FC<SecurityIndicatorProps> = ({
  isPasswordProtected,
  isOneTime,
  expiresInDesc = '1 Hour',
}) => {
  return (
    <div className="security-strip">
      <div className="sec-item">
        <span className="sec-dot" />
        <ShieldCheck size={15} style={{ color: 'var(--accent-emerald)' }} />
        <span>AES-256-GCM Encrypted Client-Side</span>
      </div>

      <div className="sec-item">
        <EyeOff size={15} style={{ color: 'var(--accent-cyan)' }} />
        <span>Zero-Knowledge (URL Fragment Key)</span>
      </div>

      {isPasswordProtected && (
        <div className="sec-item">
          <Lock size={15} style={{ color: 'var(--accent-amber)' }} />
          <span>PBKDF2 Password Protected</span>
        </div>
      )}

      {isOneTime && (
        <div className="sec-item">
          <Hash size={15} style={{ color: 'var(--accent-rose)' }} />
          <span>Burn After Reading</span>
        </div>
      )}

      <div className="sec-item" style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>
        TTL: {expiresInDesc}
      </div>
    </div>
  );
};
