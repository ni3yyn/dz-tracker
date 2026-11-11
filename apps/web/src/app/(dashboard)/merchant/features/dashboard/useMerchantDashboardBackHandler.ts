'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useDashboardBackHandler } from '../../../useDashboardBackHandler';
import type { MerchantDashboardTab } from '../../dashboard/DashboardSidebar';

interface UseMerchantDashboardBackHandlerOptions {
  activeTab: MerchantDashboardTab;
  setActiveTab: Dispatch<SetStateAction<MerchantDashboardTab>>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  isCustomMappingModalOpen: boolean;
  closeCustomMappingModal: () => void;
  isAddOrderModalOpen: boolean;
  isAddOrderPanelMounted: boolean;
  isCreatingOrder: boolean;
  closeAddOrder: () => void;
}

/**
 * Owns the merchant dashboard's Back priority:
 * global dialog → dropdown → feature overlays → order details → mobile menu.
 * The history stack itself remains in the shared dashboard back-handler hook.
 */
export function useMerchantDashboardBackHandler({
  activeTab,
  setActiveTab,
  mobileMenuOpen,
  setMobileMenuOpen,
  isCustomMappingModalOpen,
  closeCustomMappingModal,
  isAddOrderModalOpen,
  isAddOrderPanelMounted,
  isCreatingOrder,
  closeAddOrder,
}: UseMerchantDashboardBackHandlerOptions) {
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
    onBack: {
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
}
