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
  /** JPEG quality 0–1. */
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

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so the same file can be selected again.
    event.target.value = '';
  };

  const onDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !uploading) void handleFile(file);
  }, [handleFile, uploading]);

  const controlClassName = [
    'dz-image-upload-control',
    dragOver ? 'is-drag-over' : '',
    value ? 'has-image' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="dz-image-upload-field" data-upload-folder={folder}>
      {label && (
        <div className="dz-image-upload-label">
          <span>{label}</span>
          {required && <span aria-hidden="true">*</span>}
        </div>
      )}

      <div className="dz-image-upload-row">
        <button
          type="button"
          className={controlClassName}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          disabled={uploading}
          aria-label={uploading ? 'جارٍ رفع الصورة' : value ? 'تغيير الصورة' : placeholder}
        >
          <span className="dz-image-upload-preview" aria-hidden="true">
            {value ? (
              <img
                src={value}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : (
              <UploadIcon />
            )}
          </span>

          <span className="dz-image-upload-copy">
            <strong>
              {uploading ? 'جارٍ الرفع والضغط...' : value ? 'الصورة جاهزة' : placeholder}
            </strong>
            <small>
              {uploading
                ? 'يتم ضغط الصورة ورفعها بأمان'
                : 'JPG / PNG / WebP · حتى 5 ميغابايت'}
            </small>
          </span>

          <span className="dz-image-upload-action">
            {uploading ? <Spinner /> : value ? 'تغيير' : 'اختيار'}
          </span>
        </button>

        {value && !uploading && (
          <button
            type="button"
            className="dz-image-upload-remove"
            onClick={() => {
              reset();
              onChange('');
            }}
            aria-label="إزالة الصورة"
            title="إزالة الصورة"
          >
            <RemoveIcon />
          </button>
        )}
      </div>

      {error && <p className="dz-image-upload-error" role="alert">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="dz-image-upload-input"
        onChange={onInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v4h16v-4" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

function Spinner() {
  return <span className="dz-image-upload-spinner" aria-hidden="true" />;
}
