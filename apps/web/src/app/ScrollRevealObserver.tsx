'use client';

import { useEffect } from 'react';
import styles from './home.module.css';

/** Adds progressive, viewport-triggered reveals to marked public-page elements. */
export default function ScrollRevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-dz-reveal]'));
    if (!elements.length) return;

    elements.forEach((element) => element.classList.add(styles.revealTarget));
    root.classList.add('dzRevealReady');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target as HTMLElement;
        const requestedDelay = Number(element.dataset.dzRevealDelay ?? 0);
        const delay = Number.isFinite(requestedDelay) ? Math.min(Math.max(requestedDelay, 0), 420) : 0;
        element.style.setProperty('--dz-reveal-delay', `${delay}ms`);
        element.classList.add(styles.revealVisible);
        observer.unobserve(element);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -44px 0px',
    });

    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      root.classList.remove('dzRevealReady');
      elements.forEach((element) => {
        element.classList.remove(styles.revealVisible, styles.revealTarget);
        element.style.removeProperty('--dz-reveal-delay');
      });
    };
  }, []);

  return null;
}
