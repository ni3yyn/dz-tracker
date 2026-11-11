import { useEffect, useRef, useState } from 'react';

export function useCustomMappingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [isOpen]);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  return {
    isOpen,
    triggerRef,
    open,
    close,
  };
}
