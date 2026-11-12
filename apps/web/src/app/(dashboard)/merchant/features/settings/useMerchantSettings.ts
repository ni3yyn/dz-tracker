import React, { useState } from 'react';
import { toggleTelegramTracking, toggleSmsTracking, toggleConfirmationTelegram, submitPaymentProof } from '../../actions';
import type { SubscriptionInfo } from '../../shared/subscription-types';
import type { UpgradeTier } from './settings-types';

interface UseMerchantSettingsOptions {
  merchantId: string;
  subscription: SubscriptionInfo;
  telegramTrackingLinkEnabled: boolean;
  smsTrackingLinkEnabled: boolean;
  smsTrackingStorageAvailable: boolean;
  confirmationTelegramEnabled: boolean;
  showToast: (message: string) => void;
}

export function useMerchantSettings({
  merchantId,
  subscription,
  telegramTrackingLinkEnabled,
  smsTrackingLinkEnabled,
  smsTrackingStorageAvailable,
  confirmationTelegramEnabled,
  showToast,
}: UseMerchantSettingsOptions) {
  const isUnlimitedPlan = subscription.tier === 'scale' || (subscription.limit !== undefined && subscription.limit >= 999999);
  const tierDefaults: Record<string, number> = { starter: 30, basic: 100, growth: 200, scale: 999999 };
  const normalizedLimit = isUnlimitedPlan
    ? 999999
    : Math.max(subscription.limit || 0, tierDefaults[subscription.tier] || 30);

  const hasActivePaidPlan =
    subscription.status === 'active' &&
    subscription.tier !== 'starter' &&
    Boolean(subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now());

  const expiryDateFormatted = subscription.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString('ar-DZ')
    : null;

  const [telegramEnabled, setTelegramEnabled] = useState(telegramTrackingLinkEnabled);
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(smsTrackingLinkEnabled);
  const [isSavingSms, setIsSavingSms] = useState(false);
  const [confirmationEnabled, setConfirmationEnabled] = useState(confirmationTelegramEnabled);
  const [isSavingConfirmation, setIsSavingConfirmation] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState<UpgradeTier>(() => subscription.tier === 'scale' ? 'scale' : subscription.tier === 'growth' ? 'growth' : 'basic');
  const [showAdvanceRenewal, setShowAdvanceRenewal] = useState(false);

  const handleToggleTelegramTracking = async () => {
    if (isSavingTelegram) return;
    const next = !telegramEnabled;
    setIsSavingTelegram(true);
    setTelegramEnabled(next);

    try {
      const result = await toggleTelegramTracking(merchantId, next);
      if (result?.error) {
        setTelegramEnabled(!next);
        showToast(result.error);
        return;
      }
      showToast(next ? 'تم تفعيل إرسال روابط التتبع.' : 'تم تعطيل إرسال روابط التتبع.');
    } catch (error) {
      console.error('[MerchantDashboard]: Telegram tracking setting update failed:', error);
      setTelegramEnabled(!next);
      showToast('تعذر تحديث إعداد تيليجرام. يرجى المحاولة مجدداً.');
    } finally {
      setIsSavingTelegram(false);
    }
  };

  const handleToggleSmsTracking = async () => {
    if (!smsTrackingStorageAvailable || isSavingSms) return;
    const next = !smsEnabled;
    setIsSavingSms(true);
    setSmsEnabled(next);

    try {
      const result = await toggleSmsTracking(next);
      if (result?.error) {
        setSmsEnabled(!next);
        showToast(result.error);
        return;
      }
      showToast(next
        ? 'تم تفعيل إرسال رابط التتبع برسالة SMS واحدة لكل طلب جديد.'
        : 'تم تعطيل إرسال روابط التتبع عبر SMS.');
    } catch (error) {
      console.error('[MerchantDashboard]: SMS tracking setting update failed:', error);
      setSmsEnabled(!next);
      showToast('تعذر تحديث إعداد رسائل SMS. يرجى المحاولة مجدداً.');
    } finally {
      setIsSavingSms(false);
    }
  };

  const handleToggleConfirmationTelegram = async () => {
    if (!hasActivePaidPlan || isSavingConfirmation) return;
    const next = !confirmationEnabled;
    setIsSavingConfirmation(true);
    setConfirmationEnabled(next);

    try {
      const result = await toggleConfirmationTelegram(next);
      if (result?.error) {
        setConfirmationEnabled(!next);
        showToast(result.error);
        return;
      }
      showToast(next ? 'تم تفعيل طلب تأكيد الطلب.' : 'تم تعطيل طلب تأكيد الطلب.');
    } catch (error) {
      console.error('[MerchantDashboard]: Telegram confirmation setting update failed:', error);
      setConfirmationEnabled(!next);
      showToast('تعذر تحديث إعداد تأكيد الطلب. يرجى المحاولة مجدداً.');
    } finally {
      setIsSavingConfirmation(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!proofImageUrl) {
      alert('يرجى رفع صورة وصل التحويل أولاً');
      return;
    }

    setIsSubmittingProof(true);

    const fd = new FormData(e.currentTarget);
    fd.append('merchant_id', merchantId);
    fd.append('plan_tier', selectedUpgradeTier);
    fd.append('amount_dzd', selectedUpgradeTier === 'scale' ? '2500' : selectedUpgradeTier === 'growth' ? '1800' : '1000');
    fd.append('payment_method', 'baridimob');
    // Inject the uploaded image URL (overrides any stale value)
    fd.set('payment_proof_url', proofImageUrl);

    const res = await submitPaymentProof(fd);
    setIsSubmittingProof(false);

    if (res?.error) {
      alert(res.error);
    } else {
      showToast('تم إرسال وصل التحويل بنجاح. ستتم مراجعته وتفعيل الباقة بعد الموافقة.');
      setProofImageUrl('');
      (e.target as HTMLFormElement).reset();
    }
  };


  const toggleAdvanceRenewal = () => setShowAdvanceRenewal((previous) => !previous);

  return {
    isUnlimitedPlan,
    normalizedLimit,
    hasActivePaidPlan,
    expiryDateFormatted,
    telegramEnabled,
    isSavingTelegram,
    smsEnabled,
    isSavingSms,
    confirmationEnabled,
    isSavingConfirmation,
    isSubmittingProof,
    proofImageUrl,
    setProofImageUrl,
    selectedUpgradeTier,
    setSelectedUpgradeTier,
    showAdvanceRenewal,
    toggleAdvanceRenewal,
    handleToggleTelegramTracking,
    handleToggleSmsTracking,
    handleToggleConfirmationTelegram,
    handleSubmitProof,
  };
}
