'use client';

import './merchant-dashboard.css';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useDashboardBackHandler } from '../useDashboardBackHandler';
import { StatusSelector } from './StatusSelector';
import { Icons } from './components/DashboardIcons';
import { OrderDetailsSidePanel, type OrderDetailsSidePanelHandle } from './components/OrderDetailsSidePanel';
import { DashboardSidebar, type MerchantDashboardTab } from './dashboard/DashboardSidebar';
import { DashboardPanelTransition } from './dashboard/DashboardPanelTransition';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { ExceptionsTab } from './tabs/ExceptionsTab';
import { IntegrationsTab } from './tabs/IntegrationsTab';
import { OverviewTab } from './tabs/OverviewTab';
import type { MerchantUpsellItem } from './shared/upsell-types';
export type { MerchantUpsellItem } from './shared/upsell-types';
import type { PaymentRecord, SubscriptionInfo } from './shared/subscription-types';
export type { PaymentRecord, SubscriptionInfo } from './shared/subscription-types';
import { OrdersTab } from './tabs/OrdersTab';
import { BrandingTab } from './tabs/BrandingTab';
import { UpsellsTab } from './tabs/UpsellsTab';
import { useMerchantUpsells } from './features/upsells/useMerchantUpsells';
import { useMerchantMappings } from './features/mappings/useMerchantMappings';
import { useBrandingEditor } from './features/branding/useBrandingEditor';
import { useMerchantSettings } from './features/settings/useMerchantSettings';
import { useManualOrder } from './features/orders/useManualOrder';
import { useOrderFilters } from './features/orders/useOrderFilters';
import { useShipmentAnalytics } from './features/analytics/useShipmentAnalytics';
import { useOrderSelection } from './features/orders/useOrderSelection';
import { useDashboardFeedback } from './features/dashboard/useDashboardFeedback';
import { useCustomMappingModal } from './features/mappings/useCustomMappingModal';
import { useDashboardNavigation } from './features/dashboard/useDashboardNavigation';
import { MappingsTab } from './tabs/MappingsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { CustomMappingModal } from './features/mappings/CustomMappingModal';
import { AddOrderPanel } from './features/orders/AddOrderPanel';
import type { ShipmentExceptionState } from './shipment-exceptions';
import { ImageUploadField } from './ImageUploadField';
import { toCachedImageUrl } from '../../../lib/imageProxy';
import { useGlobalDialog } from '../../../components/GlobalDialogProvider';
import type { BrandSettings } from '@saas/ui';
import {
  BRAND_CATEGORY_DEFAULT_KEYS,
  DEFAULT_EDITABLE_BRAND_SETTINGS,
  getReadableOnBrand,
} from './features/branding/branding-options';
import { BrandingPhonePreview } from './features/branding/BrandingPhonePreview';

interface OrderItem {
  id: string;
  external_order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  carrier_order_id?: string | null;
  carrier_metadata?: any | null;
  current_status: string;
  carrier_name: string | null;
  carrier_tracking_number: string | null;
  carrier_last_event_at?: string | null;
  tracking_uuid: string;
  created_at: string;
  confirmation_status?: 'pending' | 'confirmed' | 'cancelled' | null;
}

interface MappingItem {
  id: string;
  source_status: string;
  display_status: string;
}

const isAttentionStatus = (status: string) =>
  status.includes('attempt_failed') || status.includes('alerte') || status === 'postponed';

const formatOrderDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'short' });
};

const formatOrderTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
};


interface Props {
  storeName: string;
  merchantId: string;
  orders: OrderItem[];
  mappings: MappingItem[];
  brandSettings?: BrandSettings;
  brandColor?: string;
  brandSubtitle?: string;
  logoUrl?: string | null;
  siteUrl: string;
  subscription?: SubscriptionInfo;
  payments?: PaymentRecord[];
  telegramTrackingLinkEnabled?: boolean;
  confirmationTelegramEnabled?: boolean;
  initialUpsells?: MerchantUpsellItem[];
  exceptionStates?: ShipmentExceptionState[];
  exceptionStateStorageAvailable?: boolean;
}

const MERCHANT_DASHBOARD_TAB_ORDER: Record<MerchantDashboardTab, number> = {
  overview: 0,
  orders: 1,
  analytics: 2,
  exceptions: 3,
  branding: 4,
  upsells: 5,
  integrations: 6,
  mappings: 7,
  settings: 8,
};

/**
 * Keeps the active dashboard surface at its measured size while content changes.
 * Height changes are animated from the previous measured value; the content itself
 * enters with a small directional x/y reveal. ResizeObserver covers nested forms,
 * filters, validation messages, and responsive reflows without hard-coded heights.
 */

export function MerchantDashboardView({
  storeName,
  merchantId,
  orders,
  mappings,
  brandSettings,
  brandColor = '#09090B',
  brandSubtitle = '',
  logoUrl,
  siteUrl,
  subscription = { tier: 'starter', status: 'active', limit: 30, used: 0, expiresAt: null },
  payments = [],
  telegramTrackingLinkEnabled = false,
  confirmationTelegramEnabled = false,
  initialUpsells = [],
  exceptionStates = [],
  exceptionStateStorageAvailable = false,
}: Props) {
  const { alert: alertDialog, confirm: confirmDialog } = useGlobalDialog();

  const { toastMsg, showToast, copiedKey, copyToClipboard } = useDashboardFeedback();

  const {
    isOpen: isCustomMappingModalOpen,
    triggerRef: customMappingTriggerRef,
    open: openCustomMappingModal,
    close: closeCustomMappingModal,
  } = useCustomMappingModal();

  const {
    activeTab,
    setActiveTab,
    dashboardMainRef,
    mobileMenuOpen,
    setMobileMenuOpen,
    navigateDashboard,
  } = useDashboardNavigation({ storeName });




  const orderDetailsPanelRef = useRef<OrderDetailsSidePanelHandle | null>(null);


  // Full Brand Customization State


  const {
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
  } = useMerchantUpsells({
    merchantId,
    initialUpsells,
    showToast,
    confirmDialog,
  });

  const {
    editingMappingId,
    editDisplayStatus,
    setEditDisplayStatus,
    isSavingEdit,
    handleSaveInlineEdit,
    handleCancelInlineEdit,
    handleBeginInlineEdit,
    handleApplyPreset,
    handleDeleteMapping,
  } = useMerchantMappings({ merchantId, showToast });

  const {
    brandConfig,
    deferredBrandConfig,
    brandHistoryTick,
    activeBrandPresetId,
    brandingCategory,
    setBrandingCategory,
    hasUnsavedBrandChanges,
    storeNameDraft,
    setStoreNameDraft,
    hasUnsavedStoreNameChanges,
    isSavingBrand,
    canUndo,
    canRedo,
    updateBrandConfig,
    undoBrandChange,
    redoBrandChange,
    applyBrandPreset,
    resetBrandCategory,
    handleSaveBranding,
  } = useBrandingEditor({
    merchantId,
    brandSettings,
    brandColor,
    brandSubtitle,
    logoUrl,
    defaultEditableBrandSettings: DEFAULT_EDITABLE_BRAND_SETTINGS,
    categoryDefaultKeys: BRAND_CATEGORY_DEFAULT_KEYS,
    storeName,
    showToast,
  });
  const displayStoreName = storeNameDraft.trim() || storeName;

  const {
    isUnlimitedPlan,
    normalizedLimit,
    hasActivePaidPlan,
    expiryDateFormatted,
    telegramEnabled,
    isSavingTelegram,
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
    handleToggleConfirmationTelegram,
    handleSubmitProof,
  } = useMerchantSettings({
    merchantId,
    subscription,
    telegramTrackingLinkEnabled,
    confirmationTelegramEnabled,
    showToast,
  });

  const {
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
  } = useManualOrder({
    merchantId,
    telegramEnabled,
    showToast,
  });
  useDashboardBackHandler({
    scope: 'merchant',
    activeTab,
    setActiveTab,
    hasActiveOverlay: Boolean(
      mobileMenuOpen ||
      isCustomMappingModalOpen ||
      isAddOrderModalOpen ||
      isAddOrderPanelMounted
    ),
    onBack: () => {
      const globalDialog = typeof document !== 'undefined'
        ? document.querySelector('[data-dashboard-back-dismiss="global-dialog"]')
        : null;
      if (globalDialog instanceof HTMLElement) {
        globalDialog.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }));
        return true;
      }

      const openDropdown = typeof document !== 'undefined'
        ? document.querySelector('[data-dashboard-back-dismiss="dropdown"]')
        : null;
      if (openDropdown instanceof HTMLElement) {
        openDropdown.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }));
        return true;
      }
      if (isCustomMappingModalOpen) {
        closeCustomMappingModal();
        return true;
      }
      if (isAddOrderModalOpen || isAddOrderPanelMounted) {
        if (isAddOrderModalOpen && !isCreatingOrder) closeAddOrder();
        return true;
      }
      const orderDetailsLayer = typeof document !== 'undefined'
        ? document.querySelector('[data-dashboard-back-dismiss="order-details-panel"]')
        : null;
      if (orderDetailsLayer) {
        orderDetailsLayer.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        }));
        return true;
      }
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        return true;
      }
      return false;
    },
  });


  const {
    deliveredCount,
    inTransitCount,
    stopdeskCount,
    returnedCount,
    exceptionCount,
    exceptionOrders,
    exceptionOrderIds,
    successRate,
    recentOrders,
    lastSevenDays,
    ordersCreatedLastSevenDays,
    maxDailyOrders,
    statusBreakdown,
  } = useShipmentAnalytics({
    orders,
    exceptionStates,
    formatOrderDate,
  });

  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    carrierFilter,
    setCarrierFilter,
    sortBy,
    setSortBy,
    uniqueCarriers,
    filteredOrders,
    visibleOrders,
    setVisibleOrders,
  } = useOrderFilters({
    orders,
    exceptionOrderIds,
    activeTab,
    isAttentionStatus,
  });

  const {
    selectedOrderIds,
    isDeletingOrders,
    toggleOrderSelection,
    toggleFilteredOrderSelection,
    clearSelectedOrders,
    handleDeleteOrders,
  } = useOrderSelection({
    filteredOrders,
    confirmDialog,
    alertDialog,
    showToast,
    onOrdersDeleted: (ids) => orderDetailsPanelRef.current?.closeIfDeleted(ids),
  });

  const allFilteredOrdersSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) => selectedOrderIds.includes(order.id));

  const getWhatsAppRecoveryUrl = (order: OrderItem) => {
    let phone = (order.customer_phone || '').replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '213' + phone.substring(1);
    const trackingUrl = `${siteUrl}/t/${order.tracking_uuid}`;

    let msg = '';
    if (order.current_status === 'attempt_failed_no_answer') {
      msg = `⚠️ تنبيه عاجل من ${displayStoreName}!\nمرحباً ${order.customer_name || ''}، حاول مندوب التوصيل الاتصال بك بخصوص طلبك (${order.external_order_id}) ولم يتم الرد.\nيرجى فتح الرابط لتأكيد توفرك اليوم لتجنب إرجاع الطلب:\n${trackingUrl}`;
    } else if (order.current_status === 'ready_for_pickup') {
      msg = `🏢 إشعار استلام من ${displayStoreName}!\nمرحباً ${order.customer_name || ''}، طردك جاهز للاستلام الآن من مكتب شركة الشحن.\nتفاصيل الاستلام والتتبع:\n${trackingUrl}`;
    } else {
      msg = `مرحباً ${order.customer_name || ''}، يمكنك متابعة شحنتك رقم (${order.external_order_id}) لحظة بلحظة عبر الرابط:\n${trackingUrl}`;
    }

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const getStatusBadgeStyle = (status: string) => {
    if (status.includes('attempt_failed') || status.includes('alerte') || status === 'postponed') {
      return 'alert';
    }
    if (status === 'delivered') return 'success';
    if (status === 'returned' || status === 'cancelled') return 'danger';
    if (status === 'ready_for_pickup') return 'warning';
    return 'info';
  };

  const getStatusLabel = (status: string) => {
    const normalizedStatus = (status || '').trim().toLowerCase();
    const customLabel = mappings.find(
      (mapping) => mapping.source_status.trim().toLowerCase() === normalizedStatus
    )?.display_status;
    if (customLabel) return customLabel;

    const labels: Record<string, string> = {
      created: 'تم التسجيل',
      order_placed: 'تم استلام الطلب',
      'order placed': 'تم استلام الطلب',
      pending: 'قيد المعالجة',
      confirmed: 'تم التأكيد',
      processing: 'قيد التجهيز لدى شركة التوصيل',
      at_local_hub: 'وصلت إلى مركز الفرز',
      held_at_hub: 'معلّقة لدى شركة التوصيل',
      shipped: 'تم الشحن',
      dispatched: 'غادرت المستودع',
      in_transit: 'في الطريق',
      out_for_delivery: 'خرجت للتوصيل',
      delivered: 'تم التسليم',
      ready_for_pickup: 'جاهزة للاستلام',
      postponed: 'مؤجلة',
      returned: 'مرتجعة',
      cancelled: 'ملغاة',
      attempt_failed_no_answer: 'تعذر الاتصال بالعميل',
      attempt_failed: 'فشلت محاولة التوصيل',
      alerte: 'تحتاج إلى متابعة',
    };
    return labels[normalizedStatus] || normalizedStatus.replace(/_/g, ' ');
  };

  const openShipmentList = (filter: 'all' | 'transit' | 'stopdesk' | 'attention' | 'exceptions' | 'delivered' | 'returned', query = '') => {
    setSearchTerm(query);
    setStatusFilter(filter === 'exceptions' ? 'all' : filter);
    setActiveTab(filter === 'exceptions' ? 'exceptions' : 'orders');
    setVisibleOrders(20);
  };

  return (
    <>


      <div className="dz-admin-root">
        {/* AURORA BG */}
        <div className="dz-aurora">
          <div className="dz-blob dz-blob1" />
          <div className="dz-blob dz-blob2" />
          <div className="dz-blob dz-blob3" />
          <div className="dz-grain" />
        </div>

        {/* SIDEBAR */}
        <DashboardSidebar
          activeTab={activeTab}
          mobileMenuOpen={mobileMenuOpen}
          brandColor={brandConfig.brandColor}
          brandLogoUrl={brandConfig.logoUrl}
          logoSrc={brandConfig.logoUrl ? toCachedImageUrl(brandConfig.logoUrl) : ''}
          displayStoreName={displayStoreName}
          exceptionCount={exceptionCount}
          activeUpsellsCount={upsellsList.filter((u) => u.is_active).length}
          getReadableOnBrand={getReadableOnBrand}
          onNavigate={(tab, resetOrdersFilter) => {
            navigateDashboard(tab, resetOrdersFilter ? () => setStatusFilter('all') : undefined);
          }}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
        />

        {/* MAIN */}
        <main ref={dashboardMainRef} className={`dz-main dz-scrollable ${activeTab === 'branding' ? 'dz-main-branding' : ''}`}>
          

          <DashboardHeader
            activeTab={activeTab}
            displayStoreName={displayStoreName}
            menuOpen={mobileMenuOpen}
            searchTerm={searchTerm}
            onMenuToggle={() => setMobileMenuOpen((open) => !open)}
            onSearchChange={setSearchTerm}
            onSearchSubmit={() => {
              setActiveTab('orders');
              setStatusFilter('all');
            }}
            onAddOrder={openAddOrder}
          />

          {/* SUBSCRIPTION WARNING BANNER */}
          {(() => {
            const isSuspended = subscription.status === 'suspended';
            const isExpired = subscription.status === 'expired' || (subscription.expiresAt && new Date(subscription.expiresAt).getTime() < Date.now());
            const isLimitReached = !isSuspended && !isExpired && !isUnlimitedPlan && normalizedLimit > 0 && subscription.used >= normalizedLimit;
            const isNearLimit = !isSuspended && !isExpired && !isUnlimitedPlan && !isLimitReached && normalizedLimit > 0 && subscription.used >= normalizedLimit * 0.85;

            if (isSuspended) {
              return (
                <div className="dz-sub-alert-banner is-suspended">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icons.Shield />
                    <div>
                      <strong>حسابك معلق حالياً من قِبل إدارة تاجر تراك</strong>
                      <div style={{ fontSize: '12px', opacity: 0.9 }}>تم إيقاف معالجة واستقبال الطلبات. يرجى التواصل مع الدعم الفني للإدارة.</div>
                    </div>
                  </div>
                  <button type="button" className="dz-sub-alert-btn" onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
                    مراجعة حالة الحساب
                  </button>
                </div>
              );
            }

            if (isExpired) {
              return (
                <div className="dz-sub-alert-banner is-expired">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icons.AlertTriangle />
                    <div>                      <strong>انتهت فترة اشتراكك في باقة تاجر تراك</strong>
                      <div style={{ fontSize: '12px', opacity: 0.9 }}>
                        تم تجميد استقبال الطلبات الجديدة مؤقتاً. طلباتك السابقة وتتبعها يعمل بصورة طبيعية دون انقطاع.
                      </div>
                    </div>
                  </div>
                  <button type="button" className="dz-sub-alert-btn" onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
                    تجديد الاشتراك
                  </button>
                </div>
              );
            }

            if (isLimitReached) {
              return (
                <div className="dz-sub-alert-banner is-expired">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icons.AlertTriangle />
                    <div>
                      <strong>تم استنفاد الحد الأقصى لباقة اشتراكك ({subscription.used} / {normalizedLimit} طلب)</strong>
                      <div style={{ fontSize: '12px', opacity: 0.9 }}>
                        تم إيقاف معالجة الطلبات الجديدة لحين الترقية. لن تفقد أي طلبات سابقة وتبقى صفحات التتبع نشطة.
                      </div>
                    </div>
                  </div>
                  <button type="button" className="dz-sub-alert-btn" onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
                    ترقية الباقة
                  </button>
                </div>
              );
            }

            if (isNearLimit) {
              return (
                <div className="dz-sub-alert-banner is-limit">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icons.Zap />
                    <div>
                      <strong>تنبيه الاستهلاك: اقتربت من استهلاك الحد الشهري ({subscription.used} من أصل {normalizedLimit} طلب)</strong>
                      <div style={{ fontSize: '12px', opacity: 0.9 }}>
                        تبقى لديك {normalizedLimit - subscription.used} طلب فقط قبل إيقاف استقبال الطلبات تلقائياً.
                      </div>
                    </div>
                  </div>
                  <button type="button" className="dz-sub-alert-btn" onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
                    ترقية الباقة
                  </button>
                </div>
              );
            }

            return null;
          })()}

          {exceptionCount > 0 && activeTab === 'orders' && (
            <div className="dz-alert-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#ef4444' }}><Icons.AlertTriangle /></span>
                <div>
                  <strong style={{ color: '#991b1b', display: 'block', fontSize: '14px' }}>استثناءات تحتاج إلى متابعة</strong>
                  <span style={{ fontSize: '13px', color: '#b91c1c' }}>يوجد {exceptionCount} استثناءً يحتاج إلى مراجعة.</span>
                </div>
              </div>
              <button className="dz-btn" style={{ background: '#ef4444' }} onClick={() => { setActiveTab('exceptions'); setStatusFilter('all'); setMobileMenuOpen(false); }}>
                عرض الطلبات
              </button>
            </div>
          )}

          <DashboardPanelTransition transitionKey={activeTab} tabOrder={MERCHANT_DASHBOARD_TAB_ORDER}>

          {/* TAB: OPERATIONAL OVERVIEW */}
          {activeTab === 'overview' && (
            <OverviewTab
              orderCount={orders.length}
              inTransitCount={inTransitCount}
              stopdeskCount={stopdeskCount}
              deliveredCount={deliveredCount}
              returnedCount={returnedCount}
              exceptionCount={exceptionCount}
              exceptionOrders={exceptionOrders}
              recentOrders={recentOrders}
              getStatusLabel={getStatusLabel}
              getStatusBadgeStyle={getStatusBadgeStyle}
              formatOrderDate={formatOrderDate}
              onOpenShipmentList={openShipmentList}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                setMobileMenuOpen(false);
              }}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              orders={orders}
              filteredOrders={filteredOrders}
              inTransitCount={inTransitCount}
              stopdeskCount={stopdeskCount}
              deliveredCount={deliveredCount}
              exceptionCount={exceptionCount}
              exceptionOrderIds={exceptionOrderIds}
              visibleOrders={visibleOrders}
              onVisibleOrdersChange={setVisibleOrders}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              carrierFilter={carrierFilter}
              onCarrierFilterChange={setCarrierFilter}
              uniqueCarriers={uniqueCarriers}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              allFilteredOrdersSelected={allFilteredOrdersSelected}
              selectedOrderIds={selectedOrderIds}
              isDeletingOrders={isDeletingOrders}
              onToggleFilteredOrderSelection={toggleFilteredOrderSelection}
              onToggleOrderSelection={toggleOrderSelection}
              onDeleteOrders={handleDeleteOrders}
              onClearSelection={clearSelectedOrders}
              onAddOrder={openAddOrder}
              onOpenOrder={(orderId) => orderDetailsPanelRef.current?.open(orderId)}
              onOpenShipmentList={openShipmentList}
              onCloseMobileMenu={() => setMobileMenuOpen(false)}
              onCopyToClipboard={copyToClipboard}
              copiedKey={copiedKey}
              getStatusLabel={getStatusLabel}
              getStatusBadgeStyle={getStatusBadgeStyle}
              formatOrderDate={formatOrderDate}
              formatOrderTime={formatOrderTime}
              getWhatsAppRecoveryUrl={getWhatsAppRecoveryUrl}
            />
          )}

          {activeTab === 'exceptions' && (
            <ExceptionsTab
              orders={orders}
              exceptionStates={exceptionStates}
              exceptionStateStorageAvailable={exceptionStateStorageAvailable}
              siteUrl={siteUrl}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              onOpenOrder={(orderId) => orderDetailsPanelRef.current?.open(orderId)}
              getStatusLabel={getStatusLabel}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              orderCount={orders.length}
              successRate={successRate}
              exceptionCount={exceptionCount}
              ordersCreatedLastSevenDays={ordersCreatedLastSevenDays}
              lastSevenDays={lastSevenDays}
              maxDailyOrders={maxDailyOrders}
              statusBreakdown={statusBreakdown}
              onOpenOrders={() => openShipmentList('all')}
              onOpenExceptions={() => openShipmentList('exceptions')}
            />
          )}

          {/* TAB: BRANDING STUDIO */}
          {activeTab === 'branding' && (
            <BrandingTab
              brandConfig={brandConfig}
              onUpdateBrandConfig={updateBrandConfig}
              hasUnsavedBrandChanges={hasUnsavedBrandChanges}
              isSavingBrand={isSavingBrand}
              onSave={handleSaveBranding}
              preview={<BrandingPhonePreview brandConfig={deferredBrandConfig} storeName={displayStoreName} />}
            />
          )}

          {activeTab === 'upsells' && (
            <UpsellsTab
              merchantId={merchantId}
              siteUrl={siteUrl}
              orders={orders}
              upsells={upsellsList}
              editingUpsellId={editingUpsellId}
              onCancelEdit={handleCancelEditUpsell}
              scrapeUrl={upsellScrapeUrl}
              onScrapeUrlChange={setUpsellScrapeUrl}
              isScraping={isScrapingUpsell}
              scrapeError={scrapeUpsellError}
              onScrapeProductUrl={handleScrapeProductUrl}
              onSaveUpsellSubmit={handleSaveUpsellSubmit}
              title={upsellTitle}
              onTitleChange={setUpsellTitle}
              productUrl={upsellProductUrl}
              onProductUrlChange={setUpsellProductUrl}
              imageUrl={upsellImageUrl}
              onImageUrlChange={setUpsellImageUrl}
              price={upsellPrice}
              onPriceChange={setUpsellPrice}
              isActive={upsellIsActive}
              onActiveChange={setUpsellIsActive}
              isSaving={isSavingUpsell}
              saveError={saveUpsellError}
              reorderingId={reorderingUpsellId}
              togglingId={togglingUpsellId}
              deletingId={deletingUpsellId}
              onReorder={handleReorderUpsell}
              onToggle={handleToggleUpsell}
              onEdit={handleEditUpsell}
              onDelete={handleDeleteUpsell}
            />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsTab
              merchantId={merchantId}
              siteUrl={siteUrl}
              onOpenOrders={() => setActiveTab('orders')}
            />
          )}

          {/* TAB: STATUS LABELS */}
          {activeTab === 'mappings' && (
            <MappingsTab
              merchantId={merchantId}
              mappings={mappings}
              triggerRef={customMappingTriggerRef}
              onOpenCustomMapping={openCustomMappingModal}
              editingMappingId={editingMappingId}
              editDisplayStatus={editDisplayStatus}
              onEditDisplayStatusChange={setEditDisplayStatus}
              isSavingEdit={isSavingEdit}
              onSaveInlineEdit={handleSaveInlineEdit}
              onCancelInlineEdit={handleCancelInlineEdit}
              onBeginInlineEdit={handleBeginInlineEdit}
              onApplyPreset={handleApplyPreset}
              onDeleteMapping={handleDeleteMapping}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              merchantId={merchantId}
              brandConfig={brandConfig}
              onUpdateBrandConfig={updateBrandConfig}
              storeNameDraft={storeNameDraft}
              onStoreNameDraftChange={setStoreNameDraft}
              hasUnsavedBrandChanges={hasUnsavedBrandChanges}
              hasUnsavedStoreNameChanges={hasUnsavedStoreNameChanges}
              isSavingBrand={isSavingBrand}
              onSaveBranding={handleSaveBranding}
              telegramEnabled={telegramEnabled}
              isSavingTelegram={isSavingTelegram}
              onToggleTelegramTracking={handleToggleTelegramTracking}
              confirmationEnabled={confirmationEnabled}
              isSavingConfirmation={isSavingConfirmation}
              hasActivePaidPlan={hasActivePaidPlan}
              onToggleConfirmationTelegram={handleToggleConfirmationTelegram}
              subscription={subscription}
              normalizedLimit={normalizedLimit}
              isUnlimitedPlan={isUnlimitedPlan}
              expiryDateFormatted={expiryDateFormatted}
              showAdvanceRenewal={showAdvanceRenewal}
              onToggleAdvanceRenewal={toggleAdvanceRenewal}
              selectedUpgradeTier={selectedUpgradeTier}
              onSelectUpgradeTier={setSelectedUpgradeTier}
              onCopyToClipboard={copyToClipboard}
              payments={payments}
              onSubmitProof={handleSubmitProof}
              isSubmittingProof={isSubmittingProof}
              proofImageUrl={proofImageUrl}
              onProofImageUrlChange={setProofImageUrl}
            />
          )}

          </DashboardPanelTransition>

          <CustomMappingModal
            isOpen={isCustomMappingModalOpen}
            merchantId={merchantId}
            onClose={closeCustomMappingModal}
          />



          <OrderDetailsSidePanel
            ref={orderDetailsPanelRef}
            orders={orders}
            getStatusLabel={getStatusLabel}
            getStatusBadgeStyle={getStatusBadgeStyle}
            getWhatsAppRecoveryUrl={getWhatsAppRecoveryUrl}
            formatOrderDate={formatOrderDate}
            isAttentionStatus={isAttentionStatus}
          />

          <AddOrderPanel
            isAddOrderPanelMounted={isAddOrderPanelMounted}
            isAddOrderPanelOpen={isAddOrderPanelOpen}
            isAddOrderModalOpen={isAddOrderModalOpen}
            isCreatingOrder={isCreatingOrder}
            addOrderError={addOrderError}
            newOrderSuccess={newOrderSuccess}
            siteUrl={siteUrl}
            closeAddOrder={closeAddOrder}
            closeAddOrderSuccess={closeAddOrderSuccess}
            finishAddOrderPanelClose={finishAddOrderPanelClose}
            handleCreateOrder={handleCreateOrder}
            copyToClipboard={copyToClipboard}
            showToast={showToast}
          />



        </main>

        {/* TOAST — inside dz-admin-root so CSS vars (--ink-main, --ease-spring) resolve correctly */}
        <div className={`dz-toast ${toastMsg ? 'show' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>

    </>
  );
}