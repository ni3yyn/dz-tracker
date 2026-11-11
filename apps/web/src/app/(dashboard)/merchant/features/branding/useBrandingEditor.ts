import React, { useCallback, useDeferredValue, useRef, useState } from 'react';
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from '@saas/ui';
import { saveBrandSettings } from '../../actions';
import type { BrandingCategory, BrandPreset, EditableBrandSettings } from '../../shared/branding-types';

interface UseBrandingEditorOptions {
  merchantId: string;
  brandSettings?: BrandSettings;
  brandColor: string;
  brandSubtitle: string;
  logoUrl?: string | null;
  defaultEditableBrandSettings: EditableBrandSettings;
  categoryDefaultKeys: Record<BrandingCategory, (keyof EditableBrandSettings)[]>;
  storeNameDraft: string;
  savedStoreName: string;
  hasUnsavedStoreNameChanges: boolean;
  setStoreNameDraft: (value: string) => void;
  setSavedStoreName: (value: string) => void;
  showToast: (message: string) => void;
}

export function useBrandingEditor({
  merchantId,
  brandSettings,
  brandColor,
  brandSubtitle,
  logoUrl,
  defaultEditableBrandSettings,
  categoryDefaultKeys,
  storeNameDraft,
  savedStoreName,
  hasUnsavedStoreNameChanges,
  setStoreNameDraft,
  setSavedStoreName,
  showToast,
}: UseBrandingEditorOptions) {
  const [brandConfig, setBrandConfig] = useState<EditableBrandSettings>(() => ({
    ...DEFAULT_BRAND_SETTINGS,
    ...(brandSettings || {}),
    ...(brandColor ? { brandColor } : {}),
    ...(brandSubtitle ? { brandSubtitle } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    showWhatsAppButton: (brandSettings as EditableBrandSettings | undefined)?.showWhatsAppButton ?? true,
    backgroundBlur: (brandSettings as EditableBrandSettings | undefined)?.backgroundBlur ?? true,
    animateBackgroundBlobs: (brandSettings as EditableBrandSettings | undefined)?.animateBackgroundBlobs ?? false,
    timelineLineStyle: (brandSettings as EditableBrandSettings | undefined)?.timelineLineStyle ?? 'straight',
  }));
  const brandConfigRef = useRef(brandConfig);
  const savedBrandConfigRef = useRef<EditableBrandSettings>({ ...brandConfig });
  const brandUndoStackRef = useRef<EditableBrandSettings[]>([]);
  const brandRedoStackRef = useRef<EditableBrandSettings[]>([]);
  const [brandHistoryTick, setBrandHistoryTick] = useState(0);
  const [activeBrandPresetId, setActiveBrandPresetId] = useState<string | null>(null);

  // Keep editing responsive while the expensive preview updates at lower priority.
  const deferredBrandConfig = useDeferredValue(brandConfig);

  const commitBrandConfig = useCallback((next: EditableBrandSettings, recordHistory = true) => {
    const current = brandConfigRef.current;
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    if (recordHistory) {
      brandUndoStackRef.current.push({ ...current });
      if (brandUndoStackRef.current.length > 40) brandUndoStackRef.current.shift();
      brandRedoStackRef.current = [];
    }
    brandConfigRef.current = next;
    setBrandConfig(next);
    setHasUnsavedBrandChanges(JSON.stringify(next) !== JSON.stringify(savedBrandConfigRef.current));
    setActiveBrandPresetId(null);
    setBrandHistoryTick((tick) => tick + 1);
  }, []);

  const updateBrandConfig = useCallback(<K extends keyof EditableBrandSettings>(key: K, val: EditableBrandSettings[K]) => {
    if (Object.is(brandConfigRef.current[key], val)) return;
    commitBrandConfig({ ...brandConfigRef.current, [key]: val } as EditableBrandSettings);
  }, [commitBrandConfig]);

  const undoBrandChange = useCallback(() => {
    const previous = brandUndoStackRef.current.pop();
    if (!previous) return;
    brandRedoStackRef.current.push({ ...brandConfigRef.current });
    brandConfigRef.current = previous;
    setBrandConfig(previous);
    setHasUnsavedBrandChanges(JSON.stringify(previous) !== JSON.stringify(savedBrandConfigRef.current));
    setActiveBrandPresetId(null);
    setBrandHistoryTick((tick) => tick + 1);
  }, []);

  const redoBrandChange = useCallback(() => {
    const next = brandRedoStackRef.current.pop();
    if (!next) return;
    brandUndoStackRef.current.push({ ...brandConfigRef.current });
    brandConfigRef.current = next;
    setBrandConfig(next);
    setHasUnsavedBrandChanges(JSON.stringify(next) !== JSON.stringify(savedBrandConfigRef.current));
    setActiveBrandPresetId(null);
    setBrandHistoryTick((tick) => tick + 1);
  }, []);

  const applyBrandPreset = useCallback((preset: BrandPreset) => {
    const before = brandConfigRef.current;
    const next = { ...before, ...preset.settings } as EditableBrandSettings;
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      brandUndoStackRef.current.push({ ...before });
      if (brandUndoStackRef.current.length > 40) brandUndoStackRef.current.shift();
      brandRedoStackRef.current = [];
      brandConfigRef.current = next;
      setBrandConfig(next);
      setHasUnsavedBrandChanges(JSON.stringify(next) !== JSON.stringify(savedBrandConfigRef.current));
      setBrandHistoryTick((tick) => tick + 1);
    }
    setActiveBrandPresetId(preset.id);
  }, []);

  const resetBrandCategory = useCallback(() => {
    const defaults = { ...defaultEditableBrandSettings } as EditableBrandSettings;
    const current = brandConfigRef.current;
    const next = { ...current } as EditableBrandSettings;
    for (const key of categoryDefaultKeys[brandingCategory]) {
      (next as unknown as Record<string, unknown>)[key] = (defaults as unknown as Record<string, unknown>)[key];
    }
    commitBrandConfig(next);
  }, [brandingCategory, commitBrandConfig]);

  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBrand || (!hasUnsavedBrandChanges && !hasUnsavedStoreNameChanges)) return;
    setIsSavingBrand(true);
    const configBeingSaved = { ...brandConfigRef.current };
    const nextStoreName = storeNameDraft.trim() || savedStoreName;

    try {
      const fd = new FormData();
      fd.append('merchant_id', merchantId);
      fd.append('brand_settings_json', JSON.stringify(configBeingSaved));
      fd.append('brand_color', configBeingSaved.brandColor);
      fd.append('brand_subtitle', configBeingSaved.brandSubtitle);
      fd.append('store_name', nextStoreName);

      const res = await saveBrandSettings(fd);
      if (res?.error) {
        alert(res.error);
      } else {
        savedBrandConfigRef.current = { ...configBeingSaved };
        setHasUnsavedBrandChanges(JSON.stringify(brandConfigRef.current) !== JSON.stringify(configBeingSaved));
        setStoreNameDraft(nextStoreName);
        setSavedStoreName(nextStoreName);
        showToast('تم حفظ معلومات المتجر وشعاره بنجاح.');
      }
    } catch (error) {
      console.error('Failed to save branding settings:', error);
      alert('تعذر حفظ الإعدادات الآن. تحقق من اتصالك وحاول مجدداً.');
    } finally {
      setIsSavingBrand(false);
    }
  };


  return {
    brandConfig,
    deferredBrandConfig,
    brandHistoryTick,
    activeBrandPresetId,
    brandingCategory,
    setBrandingCategory,
    hasUnsavedBrandChanges,
    isSavingBrand,
    canUndo: brandUndoStackRef.current.length > 0,
    canRedo: brandRedoStackRef.current.length > 0,
    updateBrandConfig,
    undoBrandChange,
    redoBrandChange,
    applyBrandPreset,
    resetBrandCategory,
    handleSaveBranding,
  };
}
