/**
 * Storage Service — ClipForge AI
 * Production media storage abstraction supporting both Google Cloud Storage & persistent local disk.
 * Enforces predictable object keys, validation, sanitization, and controlled media access.
 */

import path from 'path';
import os from 'os';
import fs from 'fs';
import { Storage as GCSStorage } from '@google-cloud/storage';

export interface StorageMetadata {
  size: number;
  contentType: string;
  updated: string;
  md5Hash?: string;
}

export interface UploadResult {
  key: string;
  publicUrl: string;
  sizeBytes: number;
  provider: 'gcs' | 'local';
}

export class StorageService {
  private static localRenderDir = path.join(process.cwd(), 'public', 'rendered');
  private static localStorageDir = path.join(process.cwd(), 'storage', 'clips');
  private static persistentMediaDir = path.join(process.cwd(), 'storage', 'media');
  private static cacheDir = path.join(process.cwd(), 'storage', 'cache');

  private static gcsClient: GCSStorage | null = null;
  private static gcsInitAttempted = false;

  /**
   * Initializes storage directories
   */
  public static init(): void {
    const dirs = [
      this.localRenderDir,
      this.localStorageDir,
      this.persistentMediaDir,
      this.cacheDir,
    ];
    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        try {
          fs.mkdirSync(d, { recursive: true });
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Sanitizes object key to prevent path traversal
   */
  public static sanitizeKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Storage key must be a non-empty string');
    }
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalized.split('/').filter((s) => s.length > 0 && s !== '.');
    if (segments.some((s) => s === '..')) {
      throw new Error(`Security Exception: Path traversal attempt detected in key: "${key}"`);
    }
    return segments.join('/');
  }

  /**
   * Deterministic Object Key Generators
   */
  public static getSourceVideoKey(projectId: string, filename = 'source.mp4'): string {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `projects/${safeProjectId}/source/${filename}`;
  }

  public static getAudioKey(projectId: string, filename = 'audio.mp3'): string {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `projects/${safeProjectId}/audio/${filename}`;
  }

  public static getClipVideoKey(projectId: string, clipId: string): string {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeClipId = clipId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `projects/${safeProjectId}/clips/${safeClipId}/video.mp4`;
  }

  public static getClipThumbnailKey(projectId: string, clipId: string): string {
    const safeProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeClipId = clipId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `projects/${safeProjectId}/clips/${safeClipId}/thumbnail.jpg`;
  }

  /**
   * Generates a temporary processing path in the system temp directory
   */
  public static getTempProcessingPath(filename: string): string {
    return path.join(os.tmpdir(), `clipforge_${Date.now()}_${path.basename(filename)}`);
  }

  /**
   * Determines active media storage provider: 'gcs' or 'local'
   */
  public static getProvider(): 'gcs' | 'local' {
    const explicitProvider = process.env.MEDIA_STORAGE_PROVIDER?.toLowerCase();
    if (explicitProvider === 'local') return 'local';
    if (explicitProvider === 'gcs') return 'gcs';

    const bucket = process.env.GCS_BUCKET_NAME || process.env.STORAGE_BUCKET;
    if (bucket && !bucket.includes('your_') && bucket !== 'clipforge-media') {
      return 'gcs';
    }
    return 'local';
  }

  /**
   * Checks whether Google Cloud Storage is configured and active
   */
  public static isCloudStorageConfigured(): boolean {
    return this.getProvider() === 'gcs';
  }

  /**
   * Returns GCS Bucket Name if configured
   */
  public static getGCSBucketName(): string | null {
    return process.env.GCS_BUCKET_NAME || process.env.STORAGE_BUCKET || null;
  }

  /**
   * Lazily initializes GCS Storage client
   */
  private static getGCS(): { client: GCSStorage; bucketName: string } {
    const bucketName = this.getGCSBucketName();
    if (!bucketName) {
      throw new Error('Google Cloud Storage is not configured. Missing GCS_BUCKET_NAME / STORAGE_BUCKET.');
    }

    if (!this.gcsClient && !this.gcsInitAttempted) {
      this.gcsInitAttempted = true;
      const options: any = {};
      if (process.env.GCS_PROJECT_ID) {
        options.projectId = process.env.GCS_PROJECT_ID;
      }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
      this.gcsClient = new GCSStorage(options);
    }

    if (!this.gcsClient) {
      throw new Error('Failed to initialize Google Cloud Storage client.');
    }

    return { client: this.gcsClient, bucketName };
  }

  /**
   * Guesses MIME type from file extension
   */
  public static getMimeType(filePathOrKey: string): string {
    const ext = path.extname(filePathOrKey).toLowerCase();
    switch (ext) {
      case '.mp4':
        return 'video/mp4';
      case '.mov':
        return 'video/quicktime';
      case '.webm':
        return 'video/webm';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.mp3':
        return 'audio/mpeg';
      case '.wav':
        return 'audio/wav';
      case '.json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Resolves stable accessible URL for a media key
   */
  public static getPublicUrl(key: string): string {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();

    if (provider === 'gcs') {
      const bucketName = this.getGCSBucketName();
      const customDomain = process.env.STORAGE_PUBLIC_DOMAIN;
      if (customDomain) {
        return `https://${customDomain}/${cleanKey}`;
      }
      return `https://storage.googleapis.com/${bucketName}/${cleanKey}`;
    }

    // Local mode:
    // If the file is in public/rendered or has a flat name, return standard /rendered route
    const filename = path.basename(cleanKey);
    return `/rendered/${filename}`;
  }

  /**
   * Returns a controlled access URL (signed URL if GCS private bucket, or local route)
   */
  public static async getAccessUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();

    if (provider === 'gcs') {
      try {
        return await this.getSignedUrl(cleanKey, expiresInSeconds);
      } catch (err: any) {
        console.warn(`[StorageService] Signed URL generation failed for ${cleanKey}, falling back to public URL:`, err?.message || err);
        return this.getPublicUrl(cleanKey);
      }
    }

    return this.getPublicUrl(cleanKey);
  }

  /**
   * Generates a v4 Signed URL for secure temporary object reading
   */
  public static async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();

    if (provider === 'gcs') {
      const { client, bucketName } = this.getGCS();
      const file = client.bucket(bucketName).file(cleanKey);
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
      return signedUrl;
    }

    // Local mode: return stream route or direct static URL
    return `/rendered/${path.basename(cleanKey)}`;
  }

  /**
   * Uploads a local file to persistent media storage (GCS or local persistent storage).
   * Verifies file existence, size > 0, and ensures required local serving paths.
   */
  public static async upload(
    localFilePath: string,
    key: string,
    contentTypeOverride?: string
  ): Promise<UploadResult> {
    this.init();

    if (!localFilePath || typeof localFilePath !== 'string') {
      throw new Error('Storage upload failed: localFilePath must be a valid path string.');
    }

    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Storage upload failed: Source file does not exist at ${localFilePath}`);
    }

    const stats = fs.statSync(localFilePath);
    if (stats.size === 0) {
      throw new Error(`Storage upload failed: Source file at ${localFilePath} is empty (0 bytes).`);
    }

    const cleanKey = this.sanitizeKey(key);
    const contentType = contentTypeOverride || this.getMimeType(cleanKey);
    const provider = this.getProvider();

    // 1. Always ensure persistent local copy in storage/media/{cleanKey}
    const localTarget = path.join(this.persistentMediaDir, cleanKey);
    const localTargetDir = path.dirname(localTarget);
    if (!fs.existsSync(localTargetDir)) {
      fs.mkdirSync(localTargetDir, { recursive: true });
    }
    if (path.resolve(localFilePath) !== path.resolve(localTarget)) {
      fs.copyFileSync(localFilePath, localTarget);
    }

    // 2. Also ensure file is accessible in public/rendered/ for immediate local playback
    const filename = path.basename(cleanKey);
    const renderedDestination = path.join(this.localRenderDir, filename);
    if (path.resolve(localFilePath) !== path.resolve(renderedDestination)) {
      try {
        fs.copyFileSync(localFilePath, renderedDestination);
      } catch {
        // non-fatal
      }
    }

    // 3. If GCS provider is active, upload object to Google Cloud Storage
    if (provider === 'gcs') {
      const { client, bucketName } = this.getGCS();
      try {
        const bucket = client.bucket(bucketName);
        await bucket.upload(localFilePath, {
          destination: cleanKey,
          metadata: {
            contentType,
            metadata: {
              uploadedAt: new Date().toISOString(),
              originalFilename: path.basename(localFilePath),
            },
          },
        });
        console.log(`[StorageService] Uploaded ${cleanKey} (${stats.size} bytes) to gs://${bucketName}/${cleanKey}`);
      } catch (err: any) {
        console.error(`[StorageService] GCS upload failed for ${cleanKey}:`, err);
        throw new Error(`Cloud storage upload failed for ${cleanKey}: ${err.message || err}`);
      }
    }

    const publicUrl = this.getPublicUrl(cleanKey);
    return {
      key: cleanKey,
      publicUrl,
      sizeBytes: stats.size,
      provider,
    };
  }

  /**
   * Downloads a media object by key or remote URL to a local destination
   */
  public static async download(keyOrUrl: string, destinationPath: string): Promise<string> {
    this.init();

    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Check if it's an HTTP URL
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      const response = await fetch(keyOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to download media from ${keyOrUrl}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
      return destinationPath;
    }

    const cleanKey = this.sanitizeKey(keyOrUrl);
    const provider = this.getProvider();

    // Check local storage candidates first
    const filename = path.basename(cleanKey);
    const localCandidates = [
      path.join(this.persistentMediaDir, cleanKey),
      path.join(this.localRenderDir, filename),
      path.join(this.localStorageDir, filename),
      keyOrUrl,
    ];

    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
        if (path.resolve(candidate) !== path.resolve(destinationPath)) {
          fs.copyFileSync(candidate, destinationPath);
        }
        return destinationPath;
      }
    }

    // If GCS is configured, download from GCS
    if (provider === 'gcs') {
      const { client, bucketName } = this.getGCS();
      const file = client.bucket(bucketName).file(cleanKey);
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File not found in Cloud Storage: gs://${bucketName}/${cleanKey}`);
      }
      await file.download({ destination: destinationPath });
      return destinationPath;
    }

    throw new Error(`Media file not found in storage: ${keyOrUrl}`);
  }

  /**
   * Ensures a local file path exists for media processing (downstream FFmpeg, probe, etc.).
   * If the file exists locally, returns the path. If not, fetches it from storage into cache.
   */
  public static async ensureLocalFile(keyOrPath: string): Promise<string> {
    this.init();

    // 1. Direct local file check
    if (fs.existsSync(keyOrPath) && fs.statSync(keyOrPath).size > 0) {
      return path.resolve(keyOrPath);
    }

    // 2. Local media candidates check
    const cleanKey = this.sanitizeKey(keyOrPath);
    const filename = path.basename(cleanKey);
    const candidates = [
      path.join(this.persistentMediaDir, cleanKey),
      path.join(this.localRenderDir, filename),
      path.join(this.localStorageDir, filename),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).size > 0) {
        return path.resolve(c);
      }
    }

    // 3. Cache directory download
    const cacheDestination = path.join(this.cacheDir, cleanKey.replace(/\//g, '_'));
    if (fs.existsSync(cacheDestination) && fs.statSync(cacheDestination).size > 0) {
      return cacheDestination;
    }

    return await this.download(cleanKey, cacheDestination);
  }

  /**
   * Checks whether an object exists in storage
   */
  public static async exists(key: string): Promise<boolean> {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();

    if (provider === 'gcs') {
      try {
        const { client, bucketName } = this.getGCS();
        const [exists] = await client.bucket(bucketName).file(cleanKey).exists();
        return exists;
      } catch {
        return false;
      }
    }

    const filename = path.basename(cleanKey);
    const candidates = [
      path.join(this.persistentMediaDir, cleanKey),
      path.join(this.localRenderDir, filename),
      path.join(this.localStorageDir, filename),
    ];
    return candidates.some((c) => fs.existsSync(c) && fs.statSync(c).size > 0);
  }

  /**
   * Retrieves object metadata
   */
  public static async getMetadata(key: string): Promise<StorageMetadata | null> {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();

    if (provider === 'gcs') {
      try {
        const { client, bucketName } = this.getGCS();
        const [meta] = await client.bucket(bucketName).file(cleanKey).getMetadata();
        return {
          size: parseInt(String(meta.size), 10) || 0,
          contentType: meta.contentType || this.getMimeType(cleanKey),
          updated: String(meta.updated || meta.timeCreated || new Date().toISOString()),
          md5Hash: meta.md5Hash,
        };
      } catch {
        return null;
      }
    }

    const filename = path.basename(cleanKey);
    const candidates = [
      path.join(this.persistentMediaDir, cleanKey),
      path.join(this.localRenderDir, filename),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const stat = fs.statSync(c);
        return {
          size: stat.size,
          contentType: this.getMimeType(cleanKey),
          updated: stat.mtime.toISOString(),
        };
      }
    }

    return null;
  }

  /**
   * Deletes a file from persistent storage
   */
  public static async delete(key: string): Promise<boolean> {
    const cleanKey = this.sanitizeKey(key);
    const provider = this.getProvider();
    let deleted = false;

    if (provider === 'gcs') {
      try {
        const { client, bucketName } = this.getGCS();
        await client.bucket(bucketName).file(cleanKey).delete({ ignoreNotFound: true });
        deleted = true;
      } catch (err) {
        console.warn(`[StorageService] Failed to delete gs://${cleanKey}:`, err);
      }
    }

    const filename = path.basename(cleanKey);
    const pathsToDelete = [
      path.join(this.persistentMediaDir, cleanKey),
      path.join(this.localRenderDir, filename),
      path.join(this.localStorageDir, filename),
      path.join(this.cacheDir, cleanKey.replace(/\//g, '_')),
    ];

    for (const p of pathsToDelete) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          deleted = true;
        } catch {
          // ignore
        }
      }
    }

    return deleted;
  }
}
