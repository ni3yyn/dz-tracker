'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './branded-select.module.css';

export interface BrandedSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface BrandedSelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: BrandedSelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'standard' | 'compact' | 'status' | 'field';
  className?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function BrandedSelect({
  id,
  name,
  value,
  defaultValue = '',
  options,
  onChange,
  placeholder = 'اختر...',
  ariaLabel,
  disabled = false,
  loading = false,
  variant = 'standard',
  className,
}: BrandedSelectProps) {
  const generatedId = useId();
  const listboxId = `branded-select-${generatedId}`;
  const isControlled = value !== undefined;
  const [localValue, setLocalValue] = useState(defaultValue);
  const selectedValue = isControlled ? value : localValue;
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const [menuHeight, setMenuHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedOption = options.find((option) => option.value === selectedValue);
  const enabledIndexes = useMemo(
    () => options.reduce<number[]>((indexes, option, index) => {
      if (!option.disabled) indexes.push(index);
      return indexes;
    }, []),
    [options]
  );

  const initialActiveIndex = useCallback(() => {
    const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);
    return selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1);
  }, [enabledIndexes, options, selectedValue]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const gap = 5;
    const viewportPadding = 10;
    const width = Math.min(Math.max(rect.width, 200), window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      window.innerWidth - width - viewportPadding
    );
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
    const availableAbove = Math.max(0, rect.top - gap - viewportPadding);
    const estimatedHeight = Math.min(320, Math.max(48, enabledIndexes.length * 43 + 8));
    const opensAbove = availableBelow < Math.min(estimatedHeight, 230) && availableAbove > availableBelow;
    const available = opensAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(120, Math.min(320, available));
    const menuHeight = Math.min(estimatedHeight, maxHeight);
    const top = opensAbove
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : Math.min(window.innerHeight - viewportPadding - 120, rect.bottom + gap);

    setMenuPosition({ top, left, width, maxHeight });
  }, [enabledIndexes.length]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    setIsMenuExpanded(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    if (disabled || loading) return;
    setActiveIndex(initialActiveIndex());
    updateMenuPosition();
    if (!isMenuMounted) {
      setMenuHeight(0);
      setIsMenuExpanded(false);
    }
    setIsMenuMounted(true);
    setIsOpen(true);
  }, [disabled, initialActiveIndex, isMenuMounted, loading, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!isMenuMounted || !isOpen || !menuPosition) return;

    const frame = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const naturalHeight = menu.scrollHeight;
      setMenuHeight(Math.min(naturalHeight, menuPosition.maxHeight));
      setIsMenuExpanded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isMenuMounted, isOpen, menuPosition?.maxHeight, options.length]);

  const handleMenuTransitionEnd = useCallback((event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'height') return;
    if (!isOpen) {
      setIsMenuMounted(false);
      setMenuHeight(0);
    }
  }, [isOpen]);

  const chooseOption = useCallback((option: BrandedSelectOption) => {
    if (option.disabled) return;
    if (!isControlled) setLocalValue(option.value);
    onChange?.(option.value);
    closeMenu(true);
  }, [closeMenu, isControlled, onChange]);

  const moveActive = useCallback((direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? (direction === 1 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPosition]);
  }, [activeIndex, enabledIndexes]);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      closeMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener('pointerdown', handleOutsidePointer, true);
    document.addEventListener('keydown', handleEscape, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      document.removeEventListener('keydown', handleEscape, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [closeMenu, isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const activeOption = activeIndex >= 0 ? optionRefs.current[activeIndex] : null;
    if (activeOption) activeOption.focus();
    else menuRef.current?.focus();
  }, [isOpen, activeIndex]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) openMenu();
      else moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) {
        const activeOption = options[activeIndex];
        if (activeOption) chooseOption(activeOption);
      } else {
        openMenu();
      }
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? (enabledIndexes[0] ?? -1) : (enabledIndexes[enabledIndexes.length - 1] ?? -1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  };

  const rootClassName = [
    styles.root,
    styles[variant],
    className,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const notifyBackLayerChange = () => {
      window.dispatchEvent(new Event('tajer-dashboard-back-layer-change'));
    };
    notifyBackLayerChange();
    return notifyBackLayerChange;
  }, [isMenuMounted]);

  return (
    <div
      ref={rootRef}
      className={rootClassName}
      aria-busy={loading || undefined}
      data-dashboard-back-dismiss={isMenuMounted ? 'dropdown' : undefined}
    >
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-disabled={disabled || loading || undefined}
        disabled={disabled || loading}
        onClick={() => isOpen ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.value}>{selectedOption?.label ?? placeholder}</span>
        <span className={styles.indicator} aria-hidden="true">
          {loading ? (
            <svg className={styles.spinner} viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 1 1-6.2-8.56" />
            </svg>
          ) : (
            <svg className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} viewBox="0 0 24 24" fill="none">
              <path d="m6 9 6 6 6-6" />
            </svg>
          )}
        </span>
      </button>

      {isMenuMounted && menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-hidden={!isOpen}
          data-expanded={isMenuExpanded && isOpen ? 'true' : 'false'}
          className={styles.menu}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
            height: isMenuExpanded && isOpen ? String(menuHeight) + 'px' : '0px',
          }}
          onKeyDown={handleMenuKeyDown}
          onTransitionEnd={handleMenuTransitionEnd}
          dir="rtl"
        >
          {options.map((option, index) => {
            const isSelected = option.value === selectedValue;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={[
                  styles.option,
                  isSelected ? styles.selected : '',
                  isActive ? styles.active : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <svg className={styles.check} viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
