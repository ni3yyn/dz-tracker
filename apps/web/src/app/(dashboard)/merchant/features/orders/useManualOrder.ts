import React, { useLayoutEffect, useState } from 'react';
import { createManualOrder } from '../../actions';

export interface ManualOrderSuccess {
  trackingUuid: string;
  externalOrderId: string;
  telegramTrackingEnabled: boolean;
  telegramTrackingQueued: boolean;
  telegramQueueCheckFailed: boolean;
  exchangeReplacement: boolean;
  exchangeReplacementNeedsConfirmation: boolean;
}

interface UseManualOrderOptions {
  merchantId: string;
  telegramEnabled: boolean;
  showToast: (message: string) => void;
}

export function useManualOrder({
  merchantId,
  telegramEnabled,
  showToast,
}: UseManualOrderOptions) {
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [isAddOrderPanelMounted, setIsAddOrderPanelMounted] = useState(false);
  const [isAddOrderPanelOpen, setIsAddOrderPanelOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [addOrderError, setAddOrderError] = useState<string | null>(null);
  const [newOrderSuccess, setNewOrderSuccess] = useState<ManualOrderSuccess | null>(null);

  useLayoutEffect(() => {
    if (!isAddOrderModalOpen) {
      setIsAddOrderPanelOpen(false);
      return;
    }

    setIsAddOrderPanelMounted(true);
    const frame = requestAnimationFrame(() => setIsAddOrderPanelOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [isAddOrderModalOpen]);
  const handleCreateOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsCreatingOrder(true);
    setAddOrderError(null);

    const formData = new FormData(e.currentTarget);
    formData.append('merchant_id', merchantId);

    try {
      const res = await createManualOrder(formData);
      if (res?.error) {
        setAddOrderError(res.error);
      } else if (res?.success) {
        setNewOrderSuccess({
          trackingUuid: res.trackingUuid || '',
          externalOrderId: res.externalOrderId!,
          telegramTrackingEnabled: telegramEnabled,
          exchangeReplacement: Boolean(res.exchangeReplacement),
          exchangeReplacementNeedsConfirmation: Boolean(res.exchangeReplacementNeedsConfirmation),
          telegramTrackingQueued: Boolean(res.telegramTrackingQueued),
          telegramQueueCheckFailed: Boolean(res.telegramTrackingQueueCheckFailed),
        });
        if (res.telegramTrackingQueueCheckFailed) {
          showToast('تم إنشاء الطلب، لكن تعذّر التحقق من جدولة رابط التتبع عبر تيليجرام.');
        } else if (res.confirmationQueueError && res.telegramTrackingQueued) {
          showToast('تم إنشاء الطلب وجدولة رابط التتبع، لكن تعذرت جدولة رسالة التأكيد.');
        } else if (res.confirmationQueueError && telegramEnabled) {
          showToast('تم إنشاء الطلب، لكن لم تُجدول رسالة التتبع أو التأكيد. راجع إعدادات قاعدة البيانات والعامل.');
        } else if (res.confirmationQueueError) {
          showToast('تم إنشاء الطلب، لكن تعذرت جدولة رسالة تأكيد تيليجرام.');
        } else if (res.telegramTrackingQueued && res.confirmationQueued) {
          showToast('تم إنشاء الطلب وجدولة رابط التتبع ورسالة التأكيد عبر تيليجرام.');
        } else if (res.telegramTrackingQueued) {
          showToast('تم إنشاء الطلب وجدولة رابط التتبع عبر تيليجرام.');
        } else if (res.confirmationQueued) {
          showToast('تم إنشاء الطلب وجدولة رسالة التأكيد. إرسال روابط التتبع متوقف من الإعدادات.');
        } else if (telegramEnabled) {
          showToast('تم إنشاء الطلب، لكن لم تُدرج مهمة رابط التتبع رغم تفعيل الخدمة. تحقق من تحديث قاعدة البيانات.');
        } else {
          showToast('تم إنشاء الطلب. إرسال روابط التتبع عبر تيليجرام متوقف من الإعدادات.');
        }
      }
    } catch (err: any) {
      setAddOrderError(err?.message || 'حدث خطأ غير متوقع أثناء إضافة الطلب');
    } finally {
      setIsCreatingOrder(false);
    }
  };


  const openAddOrder = () => {
    setIsAddOrderModalOpen(true);
    setAddOrderError(null);
    setNewOrderSuccess(null);
  };

  const closeAddOrder = () => setIsAddOrderModalOpen(false);

  const closeAddOrderSuccess = () => {
    setNewOrderSuccess(null);
    setIsAddOrderModalOpen(false);
  };

  const finishAddOrderPanelClose = () => setIsAddOrderPanelMounted(false);

  return {
    isAddOrderModalOpen,
    isAddOrderPanelMounted,
    isAddOrderPanelOpen,
    isCreatingOrder,
    addOrderError,
    newOrderSuccess,
    openAddOrder,
    closeAddOrder,
    closeAddOrderSuccess,
    finishAddOrderPanelClose,
    handleCreateOrder,
  };
}
