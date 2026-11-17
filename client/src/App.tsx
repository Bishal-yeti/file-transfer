import React, { useState, useEffect } from 'react';
import {
  Shield,
  FileBox,
  FileText,
  Video,
  Key,
  Trash2,
  Lock,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { FileShareTab } from './components/FileShareTab.js';
import { InfoShareTab } from './components/InfoShareTab.js';
import { MediaShareTab } from './components/MediaShareTab.js';
import { ShareCreatedModal } from './components/ShareCreatedModal.js';
import { DecryptView } from './components/DecryptView.js';
import { SecurityAuditModal } from './components/SecurityAuditModal.js';
import { RevokeModal } from './components/RevokeModal.js';
import { shareManager, CreateShareResult } from './services/shareManager.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'files' | 'info' | 'media'>('files');
  const [createdShare, setCreatedShare] = useState<CreateShareResult | null>(null);

  // Hash route states
  const [shareIdFromHash, setShareIdFromHash] = useState<string | null>(null);
  const [keyFromHash, setKeyFromHash] = useState<string | null>(null);
  const [isPwdProtectedFromHash, setIsPwdProtectedFromHash] = useState(false);

  // Modals
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);

  // Parse URL Fragment on load and on hash change
  useEffect(() => {
    const parseFragment = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        setShareIdFromHash(null);
        setKeyFromHash(null);
        setIsPwdProtectedFromHash(false);
        return;
      }

      // Check standard format: share=<id>&key=<key> or path /share/<id>#key=<key>
      const params = new URLSearchParams(hash);
      const shareId = params.get('share');
      const key = params.get('key');
      const pwd = params.get('pwd');

      if (shareId) {
        setShareIdFromHash(shareId);
        setKeyFromHash(key || null);
        setIsPwdProtectedFromHash(pwd === '1' || !key);
      }
    };

    parseFragment();
    window.addEventListener('hashchange', parseFragment);
    return () => window.removeEventListener('hashchange', parseFragment);
  }, []);

  const handleReset = () => {
    setCreatedShare(null);
    setShareIdFromHash(null);
    setKeyFromHash(null);
    setIsPwdProtectedFromHash(false);
    window.location.hash = '';
  };

  const handleDeleteNow = async (shareId: string, ownerToken: string) => {
    const success = await shareManager.deleteShare(shareId, ownerToken);
    if (!success) {
      throw new Error('Server rejected deletion. The share may already be expired or deleted.');
    }
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="header-bar">
        <div className="logo-group" onClick={handleReset} style={{ cursor: 'pointer' }}>
          <div className="logo-badge">
            <Shield size={22} />
          </div>
          <div>
            <div className="logo-title">
              ZERO TRACE
              <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.1)', color: 'var(--accent-cyan)', padding: '0.15rem 0.45rem', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                E2EE v1.0
              </span>
            </div>
            <div className="logo-subtitle">Anonymous Zero-Knowledge Sharing</div>
          </div>
        </div>

        <div className="nav-actions">
          <button
            onClick={() => setRevokeModalOpen(true)}
            className="btn btn-secondary btn-sm"
            title="Revoke an existing share using your deletion token"
          >
            <Trash2 size={14} />
            <span>Revoke Share</span>
          </button>
          <button
            onClick={() => setAuditModalOpen(true)}
            className="btn btn-secondary btn-sm"
            title="Inspect cryptographic proof and architecture"
          >
            <Lock size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>Security Audit</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        {shareIdFromHash ? (
          /* Recipient Decryption View */
          <DecryptView
            shareId={shareIdFromHash}
            keyBase64={keyFromHash}
            hasPasswordPrompt={isPwdProtectedFromHash}
            shareManager={shareManager}
            onReset={handleReset}
          />
        ) : createdShare ? (
          /* Share Created Result Screen */
          <ShareCreatedModal
            result={createdShare}
            onReset={handleReset}
            onDeleteNow={handleDeleteNow}
          />
        ) : (
          /* Normal Uploader Dashboard */
          <>
            {/* 3 Main Workflow Options */}
            <div className="tabs-container">
              <button
                className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveTab('files')}
              >
                <FileBox size={18} />
                <span>Share Files</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => setActiveTab('info')}
              >
                <FileText size={18} />
                <span>Share Information</span>
              </button>
              <button
                className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`}
                onClick={() => setActiveTab('media')}
              >
                <Video size={18} />
                <span>Share Media</span>
              </button>
            </div>

            {/* Selected Workflow Tab */}
            {activeTab === 'files' && (
              <FileShareTab
                shareManager={shareManager}
                onShareCreated={(res) => setCreatedShare(res)}
              />
            )}
            {activeTab === 'info' && (
              <InfoShareTab
                shareManager={shareManager}
                onShareCreated={(res) => setCreatedShare(res)}
              />
            )}
            {activeTab === 'media' && (
              <MediaShareTab
                shareManager={shareManager}
                onShareCreated={(res) => setCreatedShare(res)}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: '4rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <p>
          ZERO TRACE is an open-source, client-side encrypted sharing platform.
          Keys are contained exclusively in RFC 3986 URL fragments and are never transmitted to any server.
        </p>
        <p style={{ marginTop: '0.35rem' }}>
          Zero accounts • Zero tracking cookies • Zero analytics • Ephemeral rate limiting • Tor Browser compatible
        </p>
        <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1.25rem' }}>
          <button
            onClick={() => setAuditModalOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Cryptographic Architecture
          </button>
          <span>•</span>
          <button
            onClick={() => setRevokeModalOpen(true)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Revoke Share by Token
          </button>
        </div>
      </footer>

      {/* Modals */}
      <SecurityAuditModal isOpen={auditModalOpen} onClose={() => setAuditModalOpen(false)} />
      <RevokeModal isOpen={revokeModalOpen} onClose={() => setRevokeModalOpen(false)} shareManager={shareManager} />
    </div>
  );
};
