import React, { useState } from 'react';
import { Check, Copy, Key, Trash2, AlertTriangle, ExternalLink, ShieldCheck, Flame } from 'lucide-react';
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedMsg, setDeletedMsg] = useState(false);

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

      {/* Share URL Box */}
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

      {/* Owner Deletion Token Box */}
      <div
        style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Key size={14} /> Owner Deletion Token (Save this to revoke manually)
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
          marginTop: '1.5rem',
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
          Zero Trace holds no copies of this key. If you close this page without copying the link or token, recovery is mathematically impossible.
        </span>
      </div>

      <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem' }}>
        <a
          href={result.shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ flex: 1 }}
        >
          <ExternalLink size={16} /> Test Link in New Tab
        </a>
        <button onClick={onReset} className="btn btn-primary" style={{ flex: 1 }}>
          Share More Data
        </button>
      </div>
    </div>
  );
};
