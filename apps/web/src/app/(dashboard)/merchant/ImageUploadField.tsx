'use client';

import React, { useRef, useState, useCallback } from 'react';
import { useImageUpload } from '../../../hooks/useImageUpload';

interface ImageUploadFieldProps {
  /** Current image URL (controlled) */
  value: string;
  /** Called when a new image is successfully uploaded */
  onChange: (url: string) => void;
  merchantId?: string;
  /** Storage sub-folder */
  folder?: 'upsell-products' | 'payment-receipts';
  /**
   * JPEG quality 0–1.
   * Default: 0.72 for products, 0.78 for receipts (keeps numbers clear)
   */
  quality?: number;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export function ImageUploadField({
  value,
  onChange,
  merchantId,
  folder = 'upsell-products',
  quality,
  label,
  placeholder = 'اختر صورة أو اسحبها هنا',
  required = false,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { uploading, error, upload, reset } = useImageUpload();

  // Receipts get higher quality to keep numbers readable
  const resolvedQuality = quality ?? (folder === 'payment-receipts' ? 0.78 : 0.68);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    reset();
    const result = await upload(file, {
      bucket: 'merchant-uploads',
      folder,
      merchantId,
      quality: resolvedQuality,
      maxDimension: folder === 'payment-receipts' ? 1600 : 1200,
    });
    if (result) onChange(result.url);
  }, [upload, reset, onChange, folder, merchantId, resolvedQuality]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so same file can be re-picked
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <label style={{ fontWeight: 700, fontSize: '13px', color: '#374151' }}>{label}{required && ' *'}</label>}

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragOver ? '#27342d' : error ? '#ef4444' : '#d1d5db'}`,
          borderRadius: '10px',
          padding: '14px 16px',
          cursor: uploading ? 'wait' : 'pointer',
          background: dragOver ? 'rgba(39,52,45,0.04)' : '#fafafa',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'border-color 0.15s, background 0.15s',
          userSelect: 'none',
        }}
      >
        {/* Preview thumbnail or upload icon */}
        {value ? (
          <img
            src={value}
            alt="معاينة"
            style={{
              width: '52px',
              height: '52px',
              objectFit: 'cover',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              flexShrink: 0,
            }}
            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '6px',
            background: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <UploadIcon />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            {uploading ? 'جاري الرفع والضغط...' : value ? 'تغيير الصورة' : placeholder}
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
            {uploading ? (
              <span style={{ color: '#27342d' }}>يتم الضغط ورفع الصورة ⏳</span>
            ) : (
              'JPG / PNG / WebP · حجم أقصى 5 ميغابايت'
            )}
          </div>
        </div>

        {uploading && <Spinner />}
        {!uploading && value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            title="إزالة الصورة"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '4px',
              borderRadius: '4px',
              lineHeight: 1,
              fontSize: '16px',
            }}
          >✕</button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{
      width: '18px',
      height: '18px',
      border: '2px solid #e5e7eb',
      borderTopColor: '#27342d',
      borderRadius: '50%',
      flexShrink: 0,
      animation: 'spin 0.7s linear infinite',
    }} />
  );
}

