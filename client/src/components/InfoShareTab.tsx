import React, { useState } from 'react';
import { FileText, Code2, Database, Shield, Lock, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { SecuritySettings, SecurityConfig } from './SecuritySettings.js';
import { SecurityIndicator } from './SecurityIndicator.js';
import { ShareManager, CreateShareResult, UploadProgress } from '../services/shareManager.js';

interface InfoShareTabProps {
  shareManager: ShareManager;
  onShareCreated: (result: CreateShareResult) => void;
}

export const InfoShareTab: React.FC<InfoShareTabProps> = ({ shareManager, onShareCreated }) => {
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'text' | 'markdown' | 'json' | 'code' | 'csv'>('text');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [secConfig, setSecConfig] = useState<SecurityConfig>({
    expiresInSeconds: 3600,
    isOneTime: true, // One-time default is ideal for secret notes / credentials!
    maxDownloads: 1,
    passwordEnabled: false,
    password: '',
    notes: '',
  });

  const placeholders: Record<string, string> = {
    text: 'Type or paste confidential message or credentials here...',
    markdown: '# Title\n\n- Sensitive operational instructions\n- Secure meeting notes\n- Secret keys',
    json: '{\n  "api_token": "secret_abc123",\n  "env": "production"\n}',
    code: '// Confidential code snippet or algorithm\nfunction verifyProof() {\n  return true;\n}',
    csv: 'id,account_id,balance\n1,acc_8921,50000\n2,acc_4492,120000',
  };

  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content.length;

  const handleUpload = async () => {
    if (!content.trim()) {
      setErrorMsg('Please enter information or code to encrypt.');
      return;
    }

    if (secConfig.passwordEnabled && (!secConfig.password || secConfig.password.trim().length === 0)) {
      setErrorMsg('Please provide a password or disable password protection.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await shareManager.createShare({
        textContent: content,
        shareType: 'info',
        password: secConfig.passwordEnabled ? secConfig.password : undefined,
        isOneTime: secConfig.isOneTime,
        maxDownloads: secConfig.maxDownloads,
        expiresInSeconds: secConfig.expiresInSeconds,
        notes: secConfig.notes || `Encrypted ${contentType.toUpperCase()} snippet`,
        onProgress: (p) => setProgress(p),
      });

      onShareCreated(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during encryption and upload');
    } finally {
      setLoading(false);
    }
  };

  const getExpirationDesc = () => {
    switch (secConfig.expiresInSeconds) {
      case 600: return '10 Min';
      case 3600: return '1 Hour';
      case 86400: return '24 Hours';
      case 604800: return '7 Days';
      case 2592000: return '30 Days';
      default: return `${secConfig.expiresInSeconds}s`;
    }
  };

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Share Encrypted Information</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              Encrypted text, credentials, notes, code, and structured datasets.
            </p>
          </div>

          {/* Syntax Format Pill Selector */}
          <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
            {(['text', 'markdown', 'json', 'code', 'csv'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setContentType(fmt)}
                className="btn btn-sm"
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: contentType === fmt ? 'var(--bg-card-hover)' : 'transparent',
                  color: contentType === fmt ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: 'none',
                }}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Text Area */}
        <div className="form-group" style={{ position: 'relative' }}>
          <textarea
            className="form-textarea"
            style={{ minHeight: '220px' }}
            placeholder={placeholders[contentType]}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '0.75rem',
              right: '1rem',
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              pointerEvents: 'none',
            }}
          >
            {lineCount} lines • {charCount} chars
          </div>
        </div>
      </div>

      {/* Security Settings Card */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Security & Access Settings
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          By default, secret notes burn immediately after read to prevent redistribution.
        </p>

        <SecuritySettings config={secConfig} onChange={setSecConfig} />
      </div>

      {/* Security Status Strip */}
      <SecurityIndicator
        isPasswordProtected={secConfig.passwordEnabled}
        isOneTime={secConfig.isOneTime}
        expiresInDesc={getExpirationDesc()}
      />

      {/* Error Banner */}
      {errorMsg && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1.25rem',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: '0.875rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Progress Box */}
      {loading && progress && (
        <div className="progress-container">
          <div className="progress-header">
            <span>{progress.message}</span>
            <span className="font-mono">{progress.percent}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {/* Action Button */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={handleUpload}
          disabled={loading || !content.trim()}
          className="btn btn-primary btn-full"
          style={{ padding: '0.95rem' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Encrypting Information...</span>
            </>
          ) : (
            <>
              <Lock size={18} />
              <span>Encrypt & Share Secret Information</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
