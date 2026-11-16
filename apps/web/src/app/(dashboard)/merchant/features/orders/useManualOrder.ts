import React, { useCallback, useLayoutEffect, useState } from 'react';
import { createManualOrder } from '../../actions';
import { normalizeMerchantServerError } from '../../../../../lib/merchant-error-messages';

export interface ManualOrderSuccess {
  trackingUuid: string;
  externalOrderId: string;
  telegramTrackingEnabled: boolean;
  telegramTrackingQueued: boolean;
  telegramQueueCheckFailed: boolean;
  exchangeReplacement: boolean;
  exchangeReplacementNeedsConfirmation: boolean;
  carrierTrackingNumber: string;
  carrierLabelUrl: string;
  carrierShipmentCreated: boolean;
  carrierShipmentReused: boolean;
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
  const handleCreateOrder = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreatingOrder) return;
    setIsCreatingOrder(true);
    setAddOrderError(null);

    const formData = new FormData(e.currentTarget);
    formData.append('merchant_id', merchantId);

    try {
      const res = await createManualOrder(formData);
      if (res?.error) {
        setAddOrderError(normalizeMerchantServerError(res.error, 'order'));
      } else if (res?.success) {
        setNewOrderSuccess({
          trackingUuid: res.trackingUuid || '',
          externalOrderId: res.externalOrderId!,
          telegramTrackingEnabled: telegramEnabled,
          exchangeReplacement: Boolean(res.exchangeReplacement),
          exchangeReplacementNeedsConfirmation: Boolean(res.exchangeReplacementNeedsConfirmation),
          carrierTrackingNumber: res.carrierTrackingNumber || '',
          carrierLabelUrl: res.carrierLabelUrl || '',
          carrierShipmentCreated: Boolean(res.carrierShipmentCreated),
          carrierShipmentReused: Boolean(res.carrierShipmentReused),
          telegramTrackingQueued: Boolean(res.telegramTrackingQueued),
          telegramQueueCheckFailed: Boolean(res.telegramTrackingQueueCheckFailed),
        });
        if (res.carrierShipmentCreated && res.carrierShipmentReused) {
          showToast('تم ربط الشحنة الموجودة في Guepex بطلب تاجر تراك دون إنشاء شحنة مكررة.');
        } else if (res.carrierShipmentCreated) {
          showToast('تم إنشاء الشحنة في Guepex وحفظ رقم التتبع في تاجر تراك.');
        } else if (res.telegramTrackingQueueCheckFailed) {
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
      setAddOrderError(normalizeMerchantServerError(err, 'order'));
    } finally {
      setIsCreatingOrder(false);
    }
  }, [isCreatingOrder, merchantId, showToast, telegramEnabled]);

  const openAddOrder = useCallback(() => {
    setIsAddOrderModalOpen(true);
    setAddOrderError(null);
    setNewOrderSuccess(null);
  }, []);

  const closeAddOrder = useCallback(() => setIsAddOrderModalOpen(false), []);

  const closeAddOrderSuccess = useCallback(() => {
    // Keep the success screen mounted during the drawer's exit animation.
    // The next open action clears it before the form is shown again.
    setIsAddOrderModalOpen(false);
  }, []);

  const finishAddOrderPanelClose = useCallback(() => setIsAddOrderPanelMounted(false), []);

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
