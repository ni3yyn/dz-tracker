import React, { useState } from 'react';
import type { GlobalDialogOptions } from '../../../../../components/GlobalDialogProvider';
import {
  fetchProductUrlMetadata,
  getMerchantUpsells,
  saveMerchantUpsell,
  deleteMerchantUpsell,
  toggleMerchantUpsell,
  reorderMerchantUpsell,
} from '../../actions';
import type { MerchantUpsellItem } from '../../shared/upsell-types';

interface UseMerchantUpsellsOptions {
  merchantId: string;
  initialUpsells: MerchantUpsellItem[];
  showToast: (message: string) => void;
  confirmDialog: (options: GlobalDialogOptions) => Promise<boolean>;
}

export function useMerchantUpsells({
  merchantId,
  initialUpsells,
  showToast,
  confirmDialog,
}: UseMerchantUpsellsOptions) {
  const [upsellsList, setUpsellsList] = useState<MerchantUpsellItem[]>(initialUpsells);
  const [upsellScrapeUrl, setUpsellScrapeUrl] = useState('');
  const [isScrapingUpsell, setIsScrapingUpsell] = useState(false);
  const [scrapeUpsellError, setScrapeUpsellError] = useState<string | null>(null);

  const [editingUpsellId, setEditingUpsellId] = useState<string | null>(null);
  const [upsellTitle, setUpsellTitle] = useState('');
  const [upsellImageUrl, setUpsellImageUrl] = useState('');
  const [upsellProductUrl, setUpsellProductUrl] = useState('');
  const [upsellPrice, setUpsellPrice] = useState('');
  const [upsellIsActive, setUpsellIsActive] = useState(true);
  const [isSavingUpsell, setIsSavingUpsell] = useState(false);
  const [saveUpsellError, setSaveUpsellError] = useState<string | null>(null);
  const [togglingUpsellId, setTogglingUpsellId] = useState<string | null>(null);
  const [deletingUpsellId, setDeletingUpsellId] = useState<string | null>(null);
  const [reorderingUpsellId, setReorderingUpsellId] = useState<string | null>(null);
  const handleScrapeProductUrl = async () => {
    if (!upsellScrapeUrl.trim()) {
      setScrapeUpsellError('يرجى لصق رابط المنتج أولاً');
      return;
    }
    try {
      setIsScrapingUpsell(true);
      setScrapeUpsellError(null);
      const res = await fetchProductUrlMetadata(upsellScrapeUrl.trim());
      if (res.error) {
        setScrapeUpsellError(res.error);
        setUpsellProductUrl(upsellScrapeUrl.trim());
      } else {
        if (res.title) setUpsellTitle(res.title);
        if (res.image_url) setUpsellImageUrl(res.image_url);
        if (res.price) setUpsellPrice(res.price);
        setUpsellProductUrl(upsellScrapeUrl.trim());
        showToast('تم جلب تفاصيل المنتج بنجاح! ⚡');
      }
    } catch (err: any) {
      setScrapeUpsellError('تعذر جلب البيانات تلقائياً، يمكنك إدخالها يدوياً');
    } finally {
      setIsScrapingUpsell(false);
    }
  };

  const handleSaveUpsellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upsellTitle.trim() || !upsellImageUrl.trim() || !upsellProductUrl.trim()) {
      setSaveUpsellError('يرجى ملء جميع الحقول المطلوبة: العنوان، الصورة، ورابط المنتج');
      return;
    }

    try {
      setIsSavingUpsell(true);
      setSaveUpsellError(null);

      const formData = new FormData();
      if (editingUpsellId) {
        formData.append('id', editingUpsellId);
      }
      formData.append('title', upsellTitle.trim());
      formData.append('image_url', upsellImageUrl.trim());
      formData.append('product_url', upsellProductUrl.trim());
      if (upsellPrice.trim()) {
        formData.append('price', upsellPrice.trim());
      }
      formData.append('is_active', upsellIsActive ? 'true' : 'false');

      const res = await saveMerchantUpsell(formData);
      if (res.error) {
        setSaveUpsellError(res.error);
        return;
      }

      if (editingUpsellId) {
        setUpsellsList((prev) =>
          prev.map((item) =>
            item.id === editingUpsellId
              ? {
                  ...item,
                  title: upsellTitle.trim(),
                  image_url: upsellImageUrl.trim(),
                  product_url: upsellProductUrl.trim(),
                  price: upsellPrice.trim() || null,
                  is_active: upsellIsActive,
                }
              : item
          )
        );
        showToast('تم تعديل المنتج بنجاح');
      } else {
        const fresh = await getMerchantUpsells();
        if (fresh.success && fresh.upsells) {
          setUpsellsList(fresh.upsells as any);
        } else {
          const tempItem: MerchantUpsellItem = {
            id: 'temp-' + Date.now(),
            merchant_id: merchantId,
            title: upsellTitle.trim(),
            image_url: upsellImageUrl.trim(),
            product_url: upsellProductUrl.trim(),
            price: upsellPrice.trim() || null,
            is_active: upsellIsActive,
            created_at: new Date().toISOString(),
          };
          setUpsellsList((prev) => [tempItem, ...prev]);
        }
        showToast('تمت إضافة المنتج بنجاح! سيظهر لزبائنك في صفحة التتبع');
      }

      setEditingUpsellId(null);
      setUpsellScrapeUrl('');
      setUpsellTitle('');
      setUpsellImageUrl('');
      setUpsellProductUrl('');
      setUpsellPrice('');
      setUpsellIsActive(true);
    } catch (err: any) {
      setSaveUpsellError('حدث خطأ أثناء حفظ المنتج');
    } finally {
      setIsSavingUpsell(false);
    }
  };

  const handleEditUpsell = (item: MerchantUpsellItem) => {
    setEditingUpsellId(item.id);
    setUpsellTitle(item.title);
    setUpsellImageUrl(item.image_url);
    setUpsellProductUrl(item.product_url);
    setUpsellPrice(item.price || '');
    setUpsellIsActive(item.is_active);
    setUpsellScrapeUrl(item.product_url);
    setSaveUpsellError(null);
    setScrapeUpsellError(null);
    const formElem = document.getElementById('dz-upsell-form-anchor');
    if (formElem) {
      formElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCancelEditUpsell = () => {
    setEditingUpsellId(null);
    setUpsellScrapeUrl('');
    setUpsellTitle('');
    setUpsellImageUrl('');
    setUpsellProductUrl('');
    setUpsellPrice('');
    setUpsellIsActive(true);
    setSaveUpsellError(null);
    setScrapeUpsellError(null);
  };

  const handleToggleUpsell = async (item: MerchantUpsellItem) => {
    const nextState = !item.is_active;
    try {
      setTogglingUpsellId(item.id);
      setUpsellsList((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, is_active: nextState } : u))
      );
      const res = await toggleMerchantUpsell(item.id, nextState);
      if (res.error) {
        setUpsellsList((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, is_active: !nextState } : u))
        );
        showToast(res.error);
      } else {
        showToast(nextState ? 'تم تفعيل ظهور المنتج' : 'تم إخفاء المنتج من صفحة التتبع');
      }
    } catch (err) {
      setUpsellsList((prev) =>
        prev.map((u) => (u.id === item.id ? { ...u, is_active: !nextState } : u))
      );
      showToast('تعذر تحديث حالة المنتج');
    } finally {
      setTogglingUpsellId(null);
    }
  };

  const handleDeleteUpsell = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'حذف المنتج',
      message: 'سيتم حذف هذا المنتج من صفحة التتبع نهائياً. لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'حذف المنتج',
      cancelLabel: 'إبقاء المنتج',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      setDeletingUpsellId(id);
      setUpsellsList((prev) => prev.filter((u) => u.id !== id));
      const res = await deleteMerchantUpsell(id);
      if (res.error) {
        showToast(res.error);
        const fresh = await getMerchantUpsells();
        if (fresh.success && fresh.upsells) setUpsellsList(fresh.upsells as any);
      } else {
        showToast('تم حذف المنتج بنجاح');
        if (editingUpsellId === id) {
          handleCancelEditUpsell();
        }
      }
    } catch (err) {
      showToast('تعذر حذف المنتج');
      const fresh = await getMerchantUpsells();
      if (fresh.success && fresh.upsells) setUpsellsList(fresh.upsells as any);
    } finally {
      setDeletingUpsellId(null);
    }
  };

  const handleReorderUpsell = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = upsellsList.findIndex((u) => u.id === id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= upsellsList.length) return;

    // Optimistically swap in the UI for instantaneous feedback
    const nextList = [...upsellsList];
    const [moved] = nextList.splice(currentIndex, 1);
    nextList.splice(targetIndex, 0, moved);
    setUpsellsList(nextList);
    setReorderingUpsellId(id);

    try {
      const res = await reorderMerchantUpsell(id, direction);
      if (res.error) {
        showToast(res.error);
        const fresh = await getMerchantUpsells();
        if (fresh.success && fresh.upsells) setUpsellsList(fresh.upsells as any);
      }
    } catch {
      showToast('تعذر تغيير ترتيب المنتج');
      const fresh = await getMerchantUpsells();
      if (fresh.success && fresh.upsells) setUpsellsList(fresh.upsells as any);
    } finally {
      setReorderingUpsellId(null);
    }
  };


  return {
    upsellsList,
    upsellScrapeUrl,
    setUpsellScrapeUrl,
    isScrapingUpsell,
    scrapeUpsellError,
    editingUpsellId,
    upsellTitle,
    setUpsellTitle,
    upsellImageUrl,
    setUpsellImageUrl,
    upsellProductUrl,
    setUpsellProductUrl,
    upsellPrice,
    setUpsellPrice,
    upsellIsActive,
    setUpsellIsActive,
    isSavingUpsell,
    saveUpsellError,
    togglingUpsellId,
    deletingUpsellId,
    reorderingUpsellId,
    handleScrapeProductUrl,
    handleSaveUpsellSubmit,
    handleEditUpsell,
    handleCancelEditUpsell,
    handleToggleUpsell,
    handleDeleteUpsell,
    handleReorderUpsell,
  };
}
