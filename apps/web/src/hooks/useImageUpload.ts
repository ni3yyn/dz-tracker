'use client';

import { useState, useCallback } from 'react';

export interface UploadOptions {
  /** Supabase Storage bucket name */
  bucket?: string;
  /** Sub-folder inside the bucket */
  folder?: string;
  /** Merchant ID prefix for the filename */
  merchantId?: string;
  /**
   * JPEG quality 0–1.
   * - receipts: 0.78 (high — keeps numbers readable)
   * - product images: 0.62 (aggressive — fast load)
   */
  quality?: number;
  /** Max width/height in px. Image is scaled down proportionally. Default: 1400 */
  maxDimension?: number;
}

export interface UploadResult {
  url: string;
  path: string;
}

export interface UseImageUploadReturn {
  uploading: boolean;
  error: string | null;
  /** Call with a File from an <input type="file"> change event */
  upload: (file: File, opts?: UploadOptions) => Promise<UploadResult | null>;
  reset: () => void;
}

/**
 * Compresses an image client-side using Canvas API (no dependencies),
 * then uploads to /api/upload/image (Supabase Storage).
 *
 * Compression keeps numbers/text legible (quality ≥ 0.78 for receipts).
 */
export function useImageUpload(): UseImageUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setUploading(false);
  }, []);

  const upload = useCallback(async (
    file: File,
    opts: UploadOptions = {},
  ): Promise<UploadResult | null> => {
    const {
      bucket = 'merchant-uploads',
      folder = 'general',
      merchantId,
      quality = 0.72,
      maxDimension = 1400,
    } = opts;

    setError(null);
    setUploading(true);

    try {
      // 1. Compress client-side via Canvas
      const compressed = await compressImage(file, { quality, maxDimension });

      // 2. Build FormData
      const fd = new FormData();
      fd.append('file', compressed, file.name);
      fd.append('bucket', bucket);
      fd.append('folder', folder);
      if (merchantId) fd.append('merchant_id', merchantId);

      // 3. Upload
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok || !json.url) {
        const msg = json.error || 'فشل رفع الصورة';
        setError(msg);
        return null;
      }

      return { url: json.url, path: json.path };
    } catch (err: any) {
      const msg = err?.message || 'خطأ غير متوقع';
      setError(msg);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploading, error, upload, reset };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface CompressOptions {
  quality: number;
  maxDimension: number;
}

async function compressImage(file: File, opts: CompressOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { quality, maxDimension } = opts;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calculate new dimensions (maintain aspect ratio)
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas unavailable — upload original
        resolve(file);
        return;
      }

      // White background (avoids black PNG→JPEG alpha issue)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback to original if canvas.toBlob fails
            resolve(file);
          }
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذّر قراءة الصورة المختارة'));
    };

    img.src = objectUrl;
  });
}

