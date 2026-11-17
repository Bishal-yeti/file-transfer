import React, { useState, useRef } from 'react';
import { Video, Music, Image, Trash2, ArrowRight, Loader2, PlayCircle, ShieldCheck } from 'lucide-react';
import { SecuritySettings, SecurityConfig } from './SecuritySettings.js';
import { SecurityIndicator } from './SecurityIndicator.js';
import { ShareManager, CreateShareResult, UploadProgress } from '../services/shareManager.js';

interface MediaShareTabProps {
  shareManager: ShareManager;
  onShareCreated: (result: CreateShareResult) => void;
}

export const MediaShareTab: React.FC<MediaShareTabProps> = ({ shareManager, onShareCreated }) => {
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
      addMediaFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addMediaFiles(Array.from(e.target.files));
    }
  };

  const addMediaFiles = (newFiles: File[]) => {
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

  const getMediaIcon = (mime: string) => {
    if (mime.startsWith('video/')) return <Video size={18} style={{ color: 'var(--accent-cyan)' }} />;
    if (mime.startsWith('audio/')) return <Music size={18} style={{ color: 'var(--accent-amber)' }} />;
    return <Image size={18} style={{ color: 'var(--accent-emerald)' }} />;
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setErrorMsg('Please select at least one media file to encrypt and share.');
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
        shareType: 'media',
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
      {/* Media Dropzone */}
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
          accept="video/*,audio/*,image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem', color: 'var(--accent-cyan)' }}>
          <Video size={36} />
          <Image size={36} />
          <Music size={36} />
        </div>
        <h3 className="dropzone-title">Select Videos, Audio, or Images</h3>
        <p className="dropzone-desc">
          MP4, WEBM, MP3, WAV, PNG, JPG, GIF. Playback and render locally in-browser without server exposure.
        </p>
      </div>

      {/* Selected Media List */}
      {files.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Media Queue ({files.length}) — Total: {formatSize(totalBytes)}
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
                  {getMediaIcon(file.type)}
                  <div>
                    <div className="file-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="file-meta">
                      {formatSize(file.size)} • {file.type || 'media'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                  aria-label="Remove media"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security & Access Controls */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Media Security Settings
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Recipients can stream media locally directly from memory without server-side transcoding.
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
          disabled={loading || files.length === 0}
          className="btn btn-primary btn-full"
          style={{ padding: '0.95rem' }}
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Encrypting & Uploading Media...</span>
            </>
          ) : (
            <>
              <PlayCircle size={18} />
              <span>Encrypt & Share Private Media</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
