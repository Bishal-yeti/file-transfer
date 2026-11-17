import React, { useState } from 'react';
import { Trash2, X, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { ShareManager } from '../services/shareManager.js';

interface RevokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareManager: ShareManager;
}

export const RevokeModal: React.FC<RevokeModalProps> = ({ isOpen, onClose, shareManager }) => {
  const [shareId, setShareId] = useState('');
  const [ownerToken, setOwnerToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareId.trim() || !ownerToken.trim()) {
      setResultMsg({ type: 'error', text: 'Please fill in both the Share ID and Owner Token.' });
      return;
    }

    setResultMsg(null);
    setLoading(true);

    try {
      const success = await shareManager.deleteShare(shareId.trim(), ownerToken.trim());
      if (success) {
        setResultMsg({
          type: 'success',
          text: 'Share and all associated ciphertext blobs were permanently destroyed from the server.',
        });
        setShareId('');
        setOwnerToken('');
      } else {
        setResultMsg({
          type: 'error',
          text: 'Revocation failed. Please verify the Share ID and Owner Token.',
        });
      }
    } catch (err: any) {
      setResultMsg({
        type: 'error',
        text: err.message || 'Server error occurred during deletion.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(244, 63, 94, 0.1)',
                color: 'var(--accent-rose)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={18} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Revoke / Destroy Share</h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.35rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          If you are the creator of an active share, you can destroy it immediately using your 256-bit Owner Deletion Token.
        </p>

        <form onSubmit={handleRevoke}>
          <div className="form-group">
            <label className="form-label">Share Identifier (UUID / Hex)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 7f3b89a012cd..."
              value={shareId}
              onChange={(e) => setShareId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Owner Deletion Token</label>
            <input
              type="text"
              className="form-input"
              placeholder="Paste your 64-character owner deletion token..."
              value={ownerToken}
              onChange={(e) => setOwnerToken(e.target.value)}
              required
            />
          </div>

          {resultMsg && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                fontSize: '0.825rem',
                background: resultMsg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                border: resultMsg.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                color: resultMsg.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
              }}
            >
              {resultMsg.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !shareId.trim() || !ownerToken.trim()}
              className="btn btn-danger"
              style={{ flex: 1 }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              <span>{loading ? 'Purging...' : 'Permanently Destroy'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
