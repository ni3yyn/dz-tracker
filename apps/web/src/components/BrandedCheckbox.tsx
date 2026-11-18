'use client';

import React, { forwardRef } from 'react';
import type { CSSProperties, InputHTMLAttributes } from 'react';
import styles from './branded-checkbox.module.css';

export interface BrandedCheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'className' | 'style'> {
  /** Visual control size in CSS pixels. */
  size?: number;
  /** Class applied to the visual control wrapper. */
  className?: string;
  /** Inline layout styles applied to the visual control wrapper. */
  style?: CSSProperties;
  /** Optional class for the real, accessible native input. */
  inputClassName?: string;
  /** Optional inline styles for the real native input. */
  inputStyle?: CSSProperties;
}

/**
 * TajerTrack's shared animated checkbox.
 * The native input remains in the form and in the accessibility tree;
 * the visual layer is only decorative and never intercepts interaction.
 */
export const BrandedCheckbox = forwardRef<HTMLInputElement, BrandedCheckboxProps>(
  function BrandedCheckbox(
    {
      size = 20,
      className,
      style,
      inputClassName,
      inputStyle,
      ...inputProps
    },
    forwardedRef,
  ) {
    return (
      <span
        className={[styles.root, className].filter(Boolean).join(' ')}
        data-branded-checkbox=""
        style={{
          width: size,
          height: size,
          flex: `0 0 ${size}px`,
          ...style,
        }}
      >
        <input
          {...inputProps}
          ref={forwardedRef}
          type="checkbox"
          className={[styles.input, inputClassName].filter(Boolean).join(' ')}
          style={inputStyle}
        />
        <span className={styles.box} aria-hidden="true">
          <svg className={styles.check} viewBox="0 0 20 20" fill="none">
            <path d="m4.2 10.2 3.6 3.6 8-8.1" />
          </svg>
        </span>
      </span>
    );
  },
);

BrandedCheckbox.displayName = 'BrandedCheckbox';
