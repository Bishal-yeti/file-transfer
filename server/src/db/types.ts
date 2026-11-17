export interface ShareRecord {
  id: string;
  owner_token_hash: string;
  is_password_protected: number | boolean;
  password_salt: string | null;
  is_one_time: number | boolean;
  max_downloads: number;
  download_count: number;
  created_at: string;
  expires_at: string;
  total_size_bytes: number;
  chunk_count: number;
  encrypted_manifest: string; // Base64 ciphertext of manifest
  is_destroyed: number | boolean;
  destroyed_reason: string | null;
}

export interface CreateShareParams {
  id: string;
  owner_token_hash: string;
  is_password_protected: boolean;
  password_salt?: string | null;
  is_one_time: boolean;
  max_downloads: number;
  expires_at: string;
  total_size_bytes: number;
  chunk_count: number;
  encrypted_manifest: string;
}

export interface IDatabase {
  init(): Promise<void>;
  createShare(params: CreateShareParams): Promise<void>;
  getShare(id: string): Promise<ShareRecord | null>;
  incrementDownloadCount(id: string): Promise<number>;
  destroyShare(id: string, reason: string): Promise<void>;
  deleteSharePermanent(id: string): Promise<void>;
  getExpiredOrDestroyedShares(nowIso: string): Promise<ShareRecord[]>;
  close(): Promise<void>;
}
