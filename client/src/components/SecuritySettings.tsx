import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Clock, Flame, ShieldAlert, FileText } from 'lucide-react';

export interface SecurityConfig {
  expiresInSeconds: number;
  isOneTime: boolean;
  maxDownloads: number;
  passwordEnabled: boolean;
  password: string;
  notes: string;
}

interface SecuritySettingsProps {
  config: SecurityConfig;
  onChange: (newConfig: SecurityConfig) => void;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ config, onChange }) => {
  const [showPassword, setShowPassword] = useState(false);

  const update = (partial: Partial<SecurityConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div className="security-grid">
        {/* 1. Expiration Timer */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={14} /> Expiration Limit
          </label>
          <select
            className="form-select"
            value={config.expiresInSeconds}
            onChange={(e) => update({ expiresInSeconds: Number.parseInt(e.target.value, 10) })}
          >
            <option value={600}>10 Minutes</option>
            <option value={3600}>1 Hour (Recommended)</option>
            <option value={86400}>24 Hours</option>
            <option value={604800}>7 Days</option>
            <option value={2592000}>30 Days (Maximum)</option>
          </select>
        </div>

        {/* 2. Download Limits */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldAlert size={14} /> Download Limit
          </label>
          <select
            className="form-select"
            disabled={config.isOneTime}
            value={config.isOneTime ? 1 : config.maxDownloads}
            onChange={(e) => update({ maxDownloads: Number.parseInt(e.target.value, 10) })}
          >
            <option value={0}>Unlimited Downloads</option>
            <option value={1}>1 Download</option>
            <option value={3}>3 Downloads</option>
            <option value={5}>5 Downloads</option>
            <option value={10}>10 Downloads</option>
          </select>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        {/* One-time Burn */}
        <div
          className={`toggle-card ${config.isOneTime ? 'checked' : ''}`}
          onClick={() => update({ isOneTime: !config.isOneTime })}
        >
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={config.isOneTime}
            onChange={() => {}}
          />
          <div>
            <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Flame size={15} style={{ color: 'var(--accent-rose)' }} />
              Burn After Read (One-Time Access)
            </span>
            <span className="toggle-hint">
              Permanently destroys ciphertext from the server immediately following the first download.
            </span>
          </div>
        </div>

        {/* Password Protection */}
        <div
          className={`toggle-card ${config.passwordEnabled ? 'checked' : ''}`}
          onClick={() => update({ passwordEnabled: !config.passwordEnabled })}
        >
          <input
            type="checkbox"
            className="toggle-checkbox"
            checked={config.passwordEnabled}
            onChange={() => {}}
          />
          <div>
            <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Lock size={15} style={{ color: 'var(--accent-amber)' }} />
              Password Protection
            </span>
            <span className="toggle-hint">
              Requires recipient to enter a passphrase. Derived via client-side PBKDF2 (100k rounds).
            </span>
          </div>
        </div>
      </div>

      {/* Password Input Drawer */}
      {config.passwordEnabled && (
        <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Lock size={14} /> Set Encryption Passphrase
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              style={{ paddingRight: '2.5rem' }}
              placeholder="Enter strong secret passphrase..."
              value={config.password}
              onChange={(e) => update({ password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
            File Transfer never receives this password. If the recipient enters an incorrect password, AES-GCM tag verification will fail.
          </p>
        </div>
      )}

      {/* Optional Client-Encrypted Note */}
      <div style={{ marginTop: '1rem' }}>
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FileText size={14} /> Optional Encrypted Note for Recipient
        </label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g. Project files for Q3 review..."
          value={config.notes}
          onChange={(e) => update({ notes: e.target.value })}
          maxLength={200}
        />
      </div>
    </div>
  );
};
