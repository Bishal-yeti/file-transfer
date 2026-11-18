import React, { useState, useRef } from 'react';
import { UploadCloud, File, Trash2, Shield, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { SecuritySettings, SecurityConfig } from './SecuritySettings.js';
import { SecurityIndicator } from './SecurityIndicator.js';
import { ShareManager, CreateShareResult, UploadProgress } from '../services/shareManager.js';

interface FileShareTabProps {
  shareManager: ShareManager;
  onShareCreated: (result: CreateShareResult) => void;
}

export const FileShareTab: React.FC<FileShareTabProps> = ({ shareManager, onShareCreated }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [secConfig, setSecConfig] = useState<SecurityConfig>({
    expiresInSeconds: 3600,
    isOneTime: false,
    maxDownloads: 0,
    passwordEnabled: false,
    password: '',
    notes: '',
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    setErrorMsg(null);
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setErrorMsg('Please select at least one file to encrypt and share.');
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
        files,
        shareType: 'file',
        password: secConfig.passwordEnabled ? secConfig.password : undefined,
        isOneTime: secConfig.isOneTime,
        maxDownloads: secConfig.maxDownloads,
        expiresInSeconds: secConfig.expiresInSeconds,
        notes: secConfig.notes,
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
      {/* Dropzone */}
      <div
        className={`dropzone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <UploadCloud className="dropzone-icon" />
        <h3 className="dropzone-title">Select Files or Drag & Drop</h3>
        <p className="dropzone-desc">
          Documents, archives, code, PDFs, datasets up to 1GB. Encrypted locally with AES-256-GCM.
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Selected Files ({files.length}) — Total: {formatSize(totalBytes)}
            </h4>
            <button
              onClick={() => setFiles([])}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              Clear All
            </button>
          </div>

          <div className="file-list">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="file-row">
                <div className="file-info">
                  <File size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                  <div>
                    <div className="file-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="file-meta">
                      {formatSize(file.size)} • {file.type || 'binary'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                  aria-label="Remove file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security & Lifecycle Config */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Security & Access Settings
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Configure encryption options, automatic expiration, and destruction rules.
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

      {/* Submit Button */}
      <div style={{ marginTop: '1.5rem' }}>
        <button
          onClick={handleUpload}
          disabled={loading || files.length === 0}
          className="btn btn-primary btn-full"
          style={{ padding: '0.95rem' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Encrypting & Uploading...</span>
            </>
          ) : (
            <>
              <Lock size={18} />
              <span>Encrypt & Generate Anonymous Link</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
