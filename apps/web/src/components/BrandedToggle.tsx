'use client';

import React, { forwardRef } from 'react';
import type { CSSProperties, InputHTMLAttributes } from 'react';
import styles from './branded-toggle.module.css';

export interface BrandedToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'className' | 'style'> {
  width?: number;
  height?: number;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Shared TajerTrack on/off control.
 * The native checkbox remains form-associated and keyboard accessible;
 * the visible switch is decorative and driven by its checked state.
 */
export const BrandedToggle = forwardRef<HTMLInputElement, BrandedToggleProps>(
  function BrandedToggle(
    {
      width = 48,
      height = 27,
      loading = false,
      className,
      style,
      disabled,
      ...inputProps
    },
    forwardedRef,
  ) {
    return (
      <span
        className={[styles.root, className].filter(Boolean).join(' ')}
        data-branded-toggle=""
        style={{
          width,
          height,
          flex: `0 0 ${width}px`,
          ['--toggle-travel' as string]: `${Math.max(0, width - 27)}px`,
          ...style,
        } as CSSProperties}
      >
        <input
          {...inputProps}
          ref={forwardedRef}
          type="checkbox"
          role="switch"
          aria-busy={loading || undefined}
          disabled={disabled || loading}
          className={styles.input}
        />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb}>
            {loading && <span className={styles.spinner} />}
          </span>
        </span>
      </span>
    );
  },
);

BrandedToggle.displayName = 'BrandedToggle';
