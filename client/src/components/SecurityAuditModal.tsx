import React from 'react';
import { Shield, Lock, EyeOff, Server, Terminal, Key, Flame, X, CheckCircle2 } from 'lucide-react';

interface SecurityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityAuditModal: React.FC<SecurityAuditModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="logo-badge" style={{ width: 36, height: 36 }}>
              <Shield size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Security Architecture & Audit</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Zero-Knowledge Cryptographic Guarantees</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.4rem', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.875rem' }}>
          {/* Section 1 */}
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
              <Lock size={16} />
              <span>1. Client-Side Authenticated Encryption (AES-256-GCM)</span>
            </div>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              All payloads, filenames, MIME types, and notes are encrypted entirely inside your browser using the native
              W3C <strong>Web Crypto API</strong> before transmission. The cipher suite is AES-256 in Galois/Counter Mode
              with 128-bit authentication tags and unique 96-bit random initialization vectors (IVs) generated per chunk.
            </p>
          </div>

          {/* Section 2 */}
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
              <EyeOff size={16} />
              <span>2. RFC 3986 URL Fragment Isolation</span>
            </div>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Decryption keys reside strictly in the URL fragment (after the <code>#</code> symbol). By web standards,
              browsers <em>never</em> send fragments in HTTP request headers or URIs. The backend server and intermediate
              proxies never receive or log the key.
            </p>
          </div>

          {/* Section 3 */}
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
              <Key size={16} />
              <span>3. Password Key Derivation (PBKDF2-SHA-256)</span>
            </div>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              For password-protected shares, keys are derived client-side using <strong>PBKDF2 with 100,000 iterations</strong> and
              a 16-byte random salt. Incorrect passwords cause immediate authentication tag rejection during AES-GCM verification.
            </p>
          </div>

          {/* Section 4 */}
          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
              <Flame size={16} />
              <span>4. Irrecoverable Destruction & Deletion Tokens</span>
            </div>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Shares marked as one-time are automatically and atomically shredded after the first download. Owners receive a
              256-bit deletion token (hashed with HMAC-SHA256 on the server) allowing instant permanent revocation at any time.
            </p>
          </div>

          {/* Section 5: Tor & Limitations */}
          <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--accent-amber)', fontWeight: 600 }}>
              <Terminal size={16} />
              <span>5. Tor Onion Service & Threat Model Disclaimers</span>
            </div>
            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <li><strong>Transport Anonymity:</strong> For total network-layer anonymity, access ZERO TRACE via the Tor Browser.</li>
              <li><strong>Recipient Redistribution:</strong> Once a recipient decrypts content, DRM is mathematically impossible; the recipient can copy or photograph it.</li>
              <li><strong>Zero Cookies / Zero Fingerprinting:</strong> No analytics, tracking pixels, or accounts are employed anywhere in this platform.</li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Close Audit Overview
          </button>
        </div>
      </div>
    </div>
  );
};
