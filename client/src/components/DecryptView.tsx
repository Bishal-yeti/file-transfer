import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  ShieldCheck,
  Lock,
  Download,
  Copy,
  Check,
  File,
  Video,
  Image,
  Music,
  Archive,
  Flame,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import {
  ShareManager,
  DecryptedShareResult,
  DecryptedFile,
  UploadProgress,
} from '../services/shareManager.js';

interface DecryptViewProps {
  shareId: string;
  keyBase64: string | null;
  hasPasswordPrompt: boolean;
  shareManager: ShareManager;
  onReset: () => void;
}

export const DecryptView: React.FC<DecryptViewProps> = ({
  shareId,
  keyBase64,
  hasPasswordPrompt,
  shareManager,
  onReset,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [decryptedData, setDecryptedData] = useState<DecryptedShareResult | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [zipping, setZipping] = useState(false);

  // Object URLs for in-memory media previews
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    // If not password protected and key is available, decrypt automatically!
    if (!hasPasswordPrompt && keyBase64) {
      performDecryption(keyBase64);
    }
  }, [shareId, keyBase64, hasPasswordPrompt]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(mediaUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [mediaUrls]);

  const performDecryption = async (key: string | null, pwd?: string) => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await shareManager.decryptShare(shareId, key, pwd, (p) => setProgress(p));
      setDecryptedData(result);

      // Generate in-memory blob URLs for instant media preview
      const urls: Record<string, string> = {};
      result.files.forEach((file) => {
        if (
          file.mimeType.startsWith('image/') ||
          file.mimeType.startsWith('video/') ||
          file.mimeType.startsWith('audio/')
        ) {
          urls[file.name] = URL.createObjectURL(file.blob);
        }
      });
      setMediaUrls(urls);
    } catch (err: any) {
      setErrorMsg(err.message || 'Decryption failed. Please verify link or password.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Please enter the decryption passphrase.');
      return;
    }
    performDecryption(null, password.trim());
  };

  const downloadFile = (file: DecryptedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAllAsZip = async () => {
    if (!decryptedData || decryptedData.files.length === 0) return;
    setZipping(true);

    try {
      const zip = new JSZip();
      decryptedData.files.forEach((file) => {
        zip.file(file.name, file.blob);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zero_trace_${shareId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      alert(`ZIP bundling failed: ${err.message}`);
    } finally {
      setZipping(false);
    }
  };

  const copyTextToClipboard = async () => {
    if (!decryptedData?.textContent) return;
    try {
      await navigator.clipboard.writeText(decryptedData.textContent);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Fallback
    }
  };

  const downloadTextAsFile = () => {
    if (!decryptedData?.textContent) return;
    const blob = new Blob([decryptedData.textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secret_note_${shareId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // State 1: Password Required Screen
  if (hasPasswordPrompt && !decryptedData) {
    return (
      <div className="card" style={{ maxWidth: 520, margin: '2rem auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.1)',
              color: 'var(--accent-amber)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <Lock size={26} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Passphrase Protected Share</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
            This share was end-to-end encrypted with a client-derived passphrase.
          </p>
        </div>

        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label className="form-label">Enter Passphrase to Decrypt</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                style={{ paddingRight: '2.5rem' }}
                placeholder="Enter passphrase..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
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
          </div>

          {errorMsg && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-rose)',
                fontSize: '0.85rem',
              }}
            >
              {errorMsg}
            </div>
          )}

          {loading && progress && (
            <div className="progress-container" style={{ marginBottom: '1.25rem' }}>
              <div className="progress-header">
                <span>{progress.message}</span>
                <span className="font-mono">{progress.percent}%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="btn btn-primary btn-full"
            style={{ padding: '0.9rem' }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Deriving Key & Decrypting...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                <span>Unlock & Decrypt Content</span>
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  // State 2: Loading / Error before decryption
  if (!decryptedData) {
    return (
      <div className="card" style={{ maxWidth: 520, margin: '2rem auto', textAlign: 'center', padding: '3rem 1.5rem' }}>
        {loading ? (
          <>
            <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-cyan)', margin: '0 auto 1.25rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Decrypting Content Locally
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
              {progress?.message || 'Fetching encrypted ciphertext from server...'}
            </p>
            {progress && (
              <div className="progress-container" style={{ textAlign: 'left' }}>
                <div className="progress-header">
                  <span>{progress.message}</span>
                  <span className="font-mono">{progress.percent}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            )}
          </>
        ) : errorMsg ? (
          <>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.1)',
                color: 'var(--accent-rose)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <AlertTriangle size={26} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Access or Decryption Error
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              {errorMsg}
            </p>
            <button onClick={onReset} className="btn btn-secondary">
              Go to Home Page
            </button>
          </>
        ) : null}
      </div>
    );
  }

  // State 3: Content Successfully Decrypted!
  return (
    <div>
      {/* Burn Alert Banner if burned on read */}
      {decryptedData.burned && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            color: 'var(--accent-rose)',
          }}
        >
          <Flame size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>One-Time Share Destroyed</strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              The encrypted data on the server was permanently deleted immediately following this download. Refreshing or reloading will not retrieve it.
            </span>
          </div>
        </div>
      )}

      {/* Main Decrypted Container */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Decryption Successful</h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                AES-256-GCM authenticated & SHA-256 checksums verified locally.
              </p>
            </div>
          </div>

          {decryptedData.files.length > 1 && (
            <button
              onClick={downloadAllAsZip}
              disabled={zipping}
              className="btn btn-secondary btn-sm"
            >
              {zipping ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
              <span>{zipping ? 'Compressing...' : 'Download All as ZIP'}</span>
            </button>
          )}
        </div>

        {/* Optional Note Display */}
        {decryptedData.manifest.notes && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.25rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
            }}
          >
            <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
              Uploader Note:
            </strong>
            {decryptedData.manifest.notes}
          </div>
        )}

        {/* Text Share Display */}
        {decryptedData.textContent && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Encrypted Information Payload
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={copyTextToClipboard} className="btn btn-secondary btn-sm">
                  {copiedText ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedText ? 'Copied' : 'Copy'}</span>
                </button>
                <button onClick={downloadTextAsFile} className="btn btn-secondary btn-sm">
                  <Download size={14} />
                  <span>Save .TXT</span>
                </button>
              </div>
            </div>
            <textarea
              readOnly
              className="form-textarea"
              value={decryptedData.textContent}
              style={{ minHeight: '260px' }}
            />
          </div>
        )}

        {/* Decrypted Files List & Previews */}
        {decryptedData.files.length > 0 && (
          <div className="file-list">
            {decryptedData.files.map((file, idx) => {
              const previewUrl = mediaUrls[file.name];
              const isImage = file.mimeType.startsWith('image/');
              const isVideo = file.mimeType.startsWith('video/');
              const isAudio = file.mimeType.startsWith('audio/');

              return (
                <div
                  key={`${file.name}-${idx}`}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="file-info">
                      <File size={20} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                      <div>
                        <div className="file-name" title={file.name}>
                          {file.name}
                        </div>
                        <div className="file-meta">
                          {formatSize(file.size)} • {file.mimeType} •{' '}
                          <span style={{ color: 'var(--accent-emerald)' }}>SHA-256 Verified ✓</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadFile(file)}
                      className="btn btn-primary btn-sm"
                    >
                      <Download size={14} /> Download
                    </button>
                  </div>

                  {/* Inline Decrypted Previews (Zero Server Contact) */}
                  {previewUrl && (
                    <div className="media-preview-container">
                      {isImage && (
                        <img src={previewUrl} alt={file.name} className="preview-img" />
                      )}
                      {isVideo && (
                        <video controls src={previewUrl} className="preview-video" />
                      )}
                      {isAudio && (
                        <audio controls src={previewUrl} className="preview-audio" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button onClick={onReset} className="btn btn-secondary">
          <RefreshCw size={15} /> Create a New Encrypted Share
        </button>
      </div>
    </div>
  );
};
