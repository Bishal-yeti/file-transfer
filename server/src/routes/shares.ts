import { Router, Request, Response } from 'express';
import express from 'express';
import { shareService } from '../services/shareService.js';

export const shareRouter = Router();

const getParam = (p: string | string[] | undefined): string => {
  if (Array.isArray(p)) return p[0] || '';
  return p || '';
};

// 1. Create a new share record
shareRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      ownerToken,
      isPasswordProtected,
      passwordSalt,
      isOneTime,
      maxDownloads,
      expiresInSeconds,
      totalSizeBytes,
      chunkCount,
      encryptedManifest,
    } = req.body;

    if (!ownerToken || !encryptedManifest) {
      res.status(400).json({ error: 'BadRequest', message: 'Missing required parameters' });
      return;
    }

    const { shareId } = await shareService.createShare({
      ownerToken,
      isPasswordProtected: Boolean(isPasswordProtected),
      passwordSalt,
      isOneTime: Boolean(isOneTime),
      maxDownloads: Number(maxDownloads) || 0,
      expiresInSeconds: Number(expiresInSeconds) || 3600,
      totalSizeBytes: Number(totalSizeBytes) || 0,
      chunkCount: Number(chunkCount) || 0,
      encryptedManifest,
    });

    res.status(201).json({
      success: true,
      shareId,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'BadRequest', message: err.message });
  }
});

// 2. Upload an encrypted chunk (binary stream)
shareRouter.post(
  '/:id/chunks/:index',
  express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const index = getParam(req.params.index);
      const chunkIndex = Number.parseInt(index, 10);

      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        res.status(400).json({ error: 'BadRequest', message: 'Invalid chunk index' });
        return;
      }

      if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
        res.status(400).json({ error: 'BadRequest', message: 'Missing or empty chunk payload' });
        return;
      }

      await shareService.uploadChunk(id, chunkIndex, req.body);

      res.status(200).json({
        success: true,
        chunkIndex,
        bytesReceived: req.body.length,
      });
    } catch (err: any) {
      res.status(400).json({ error: 'UploadError', message: err.message });
    }
  }
);

// 3. Get share metadata
shareRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const metadata = await shareService.getShareMetadata(id);

    if (!metadata) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Share does not exist, has expired, or was destroyed.',
      });
      return;
    }

    res.json({
      success: true,
      share: metadata,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 4. Download an encrypted chunk
shareRouter.get('/:id/chunks/:index', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const index = getParam(req.params.index);
    const chunkIndex = Number.parseInt(index, 10);

    if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
      res.status(400).json({ error: 'BadRequest', message: 'Invalid chunk index' });
      return;
    }

    const { buffer, isFinal, burned } = await shareService.downloadChunk(id, chunkIndex);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Is-Final-Chunk', isFinal ? 'true' : 'false');
    res.setHeader('X-Share-Burned', burned ? 'true' : 'false');

    res.send(buffer);
  } catch (err: any) {
    res.status(404).json({ error: 'NotFound', message: err.message });
  }
});

// 5. Delete a share by owner deletion token
shareRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const rawToken = req.headers['x-deletion-token'] || req.query.token;
    const ownerToken = typeof rawToken === 'string' ? rawToken : (Array.isArray(rawToken) && typeof rawToken[0] === 'string' ? rawToken[0] : undefined);

    if (!ownerToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing X-Deletion-Token header or query parameter',
      });
      return;
    }

    const deleted = await shareService.deleteShareByOwner(id, ownerToken);
    if (!deleted) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid deletion token or share already removed',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Share and all associated encrypted data permanently destroyed',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 6. Check share active status
shareRouter.get('/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const metadata = await shareService.getShareMetadata(id);

    if (!metadata) {
      res.json({ active: false, reason: 'expired_or_destroyed' });
      return;
    }

    res.json({
      active: true,
      expiresAt: metadata.expires_at,
      downloadCount: metadata.download_count,
      maxDownloads: metadata.max_downloads,
      isOneTime: metadata.is_one_time,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
