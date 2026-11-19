import React, { useState, useEffect } from 'react';
import {
  Check,
  Copy,
  Key,
  Trash2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  QrCode,
  Link as LinkIcon,
  Terminal,
  Download,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { CreateShareResult } from '../services/shareManager.js';

interface ShareCreatedModalProps {
  result: CreateShareResult;
  onReset: () => void;
  onDeleteNow: (shareId: string, ownerToken: string) => Promise<void>;
}

export const ShareCreatedModal: React.FC<ShareCreatedModalProps> = ({
  result,
  onReset,
  onDeleteNow,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'qr' | 'terminal'>('link');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedMsg, setDeletedMsg] = useState(false);

  // Generate QR Code on mount or share URL change
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(result.shareUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#030712',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code', err);
      });

    return () => {
      active = false;
    };
  }, [result.shareUrl]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(result.ownerToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    } catch {
      // Fallback
    }
  };

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(terminalSnippet);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently destroy this encrypted share?')) {
      return;
    }
    setDeleting(true);
    try {
      await onDeleteNow(result.shareId, result.ownerToken);
      setDeletedMsg(true);
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const terminalSnippet = `# Open in default browser directly from terminal:
${navigator.userAgent.includes('Mac') ? 'open' : 'xdg-open'} "${result.shareUrl}"

# Or view share manifest via cURL:
curl -s "${result.shareUrl.split('#')[0].replace('/#', '/api/shares')}"`;

  if (deletedMsg) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(244, 63, 94, 0.1)',
            color: 'var(--accent-rose)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <Trash2 size={28} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Share Permanently Destroyed
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: 460, margin: '0 auto 1.5rem' }}>
          All ciphertext blobs and metadata have been purged from the server. The link is no longer valid.
        </p>
        <button onClick={onReset} className="btn btn-primary">
          Create Another Share
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.1)',
            color: 'var(--accent-emerald)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldCheck size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Encrypted Share Ready</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Ciphertext uploaded. Decryption key attached to URI fragment (#).
          </p>
        </div>
      </div>

      {/* Share Method Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.35rem',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '1.25rem',
        }}
      >
        <button
          onClick={() => setActiveTab('link')}
          className="btn"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            fontSize: '0.82rem',
            background: activeTab === 'link' ? 'var(--bg-card-hover)' : 'transparent',
            border: activeTab === 'link' ? '1px solid var(--border-medium)' : '1px solid transparent',
            color: activeTab === 'link' ? 'var(--text-main)' : 'var(--text-dim)',
          }}
        >
          <LinkIcon size={14} /> Share Link
        </button>

        <button
          onClick={() => setActiveTab('qr')}
          className="btn"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            fontSize: '0.82rem',
            background: activeTab === 'qr' ? 'var(--bg-card-hover)' : 'transparent',
            border: activeTab === 'qr' ? '1px solid var(--border-medium)' : '1px solid transparent',
            color: activeTab === 'qr' ? 'var(--accent-cyan)' : 'var(--text-dim)',
          }}
        >
          <QrCode size={14} /> Scan QR Code
        </button>

        <button
          onClick={() => setActiveTab('terminal')}
          className="btn"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            fontSize: '0.82rem',
            background: activeTab === 'terminal' ? 'var(--bg-card-hover)' : 'transparent',
            border: activeTab === 'terminal' ? '1px solid var(--border-medium)' : '1px solid transparent',
            color: activeTab === 'terminal' ? 'var(--text-main)' : 'var(--text-dim)',
          }}
        >
          <Terminal size={14} /> Terminal / CLI
        </button>
      </div>

      {/* TAB 1: Share Link */}
      {activeTab === 'link' && (
        <div className="form-group">
          <label className="form-label">End-to-End Encrypted Share Link</label>
          <div className="link-input-group">
            <input
              type="text"
              readOnly
              value={result.shareUrl}
              className="copy-input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button onClick={copyLink} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              {copiedLink ? 'Copied' : 'Copy Link'}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4, marginTop: '0.35rem' }}>
            The portion after <code>#</code> is the <strong>AES-256-GCM decryption key</strong>. Browsers never transmit this
            fragment to the server.
          </p>
        </div>
      )}

      {/* TAB 2: QR Code */}
      {activeTab === 'qr' && (
        <div
          style={{
            textAlign: 'center',
            padding: '1.25rem',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {qrDataUrl ? (
            <div>
              <div
                style={{
                  display: 'inline-block',
                  background: '#ffffff',
                  padding: '12px',
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
                }}
              >
                <img
                  src={qrDataUrl}
                  alt="Encrypted Share QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginTop: '1rem',
                  color: 'var(--text-muted)',
                  fontSize: '0.82rem',
                }}
              >
                <Smartphone size={16} style={{ color: 'var(--accent-cyan)' }} />
                <span>Point any iPhone or Android camera at the QR code to open & decrypt instantly</span>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <a
                  href={qrDataUrl}
                  download={`file-transfer-qr-${result.shareId.slice(0, 8)}.png`}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}
                >
                  <Download size={13} /> Save QR Image
                </a>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)', padding: '2rem' }}>Rendering QR Code...</p>
          )}
        </div>
      )}

      {/* TAB 3: Terminal */}
      {activeTab === 'terminal' && (
        <div>
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Terminal Access Snippet</span>
            <button
              onClick={copyCurl}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
            >
              {copiedCurl ? <Check size={12} /> : <Copy size={12} />}
              {copiedCurl ? 'Copied' : 'Copy'}
            </button>
          </label>
          <pre
            style={{
              padding: '0.85rem 1rem',
              background: '#04060a',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              fontSize: '0.78rem',
              color: 'var(--accent-cyan)',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {terminalSnippet}
          </pre>
        </div>
      )}

      {/* Owner Deletion Token Box */}
      <div
        style={{
          marginTop: '1.25rem',
          padding: '1.1rem',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Key size={14} /> Owner Deletion Token (Save to revoke manually)
          </label>
          <button
            onClick={copyToken}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
          >
            {copiedToken ? <Check size={12} /> : <Copy size={12} />}
            {copiedToken ? 'Copied' : 'Copy'}
          </button>
        </div>
        <input
          type="text"
          readOnly
          value={result.ownerToken}
          className="form-input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}
        />
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Expires: {new Date(result.expiresAt).toLocaleString()}
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn btn-danger btn-sm"
            style={{ fontSize: '0.75rem' }}
          >
            <Trash2 size={13} /> {deleting ? 'Destroying...' : 'Delete Share Now'}
          </button>
        </div>
      </div>

      {/* Disclaimers & Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginTop: '1.25rem',
          padding: '0.75rem 1rem',
          background: 'rgba(245, 158, 11, 0.05)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(245, 158, 11, 0.15)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        <AlertTriangle size={16} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
        <span>
          File Transfer holds no copies of this key. If you close this page without copying the link or token, recovery is mathematically impossible.
        </span>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <a
          href={result.shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ flex: 1 }}
        >
          <ExternalLink size={16} /> Open Link in New Tab
        </a>
        <button onClick={onReset} className="btn btn-primary" style={{ flex: 1 }}>
          Share More Data
        </button>
      </div>
    </div>
  );
};
