'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabaseClient } from '../lib/supabase-browser';

export function useSiteAuthentication(enabled = true): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
    });

    return () => subscription.unsubscribe();
  }, [enabled]);

  return isAuthenticated;
}
