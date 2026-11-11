'use client';

import './merchant-dashboard.css';

import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
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
import type { BrandPreset, BrandingCategory, EditableBrandSettings, TimelineLineStyle } from './shared/branding-types';
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
import type { ShipmentExceptionState } from './shipment-exceptions';
import { BrandedSelect } from './BrandedSelect';
import { MappingForm } from './MappingForm';
import { ImageUploadField } from './ImageUploadField';
import { toCachedImageUrl } from '../../../lib/imageProxy';
import { useGlobalDialog } from '../../../components/GlobalDialogProvider';
import {
  TimelineEvent,
  BrandSettings,
  DEFAULT_BRAND_SETTINGS,
  BackgroundStyle,
  TimelineDesign,
  CardRadius,
  CardSurface,
  ThemeMode,
  FontFamily,
  AnimationLevel,
} from '@saas/ui';

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


const DEFAULT_EDITABLE_BRAND_SETTINGS: EditableBrandSettings = {
  ...DEFAULT_BRAND_SETTINGS,
  brandColor: '#27342D',
  brandSubtitle: '',
  showWhatsAppButton: true,
  animateBackgroundBlobs: false,
  backgroundBlur: true,
  timelineLineStyle: 'straight',
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

const SAMPLE_PREVIEW_EVENTS: TimelineEvent[] = [
  {
    id: 'sample-1',
    title: 'خرج للتوصيل مع المندوب',
    date: new Date().toISOString(),
    description: 'الشحنة في مرحلة التوصيل النهائية. ستظهر أي تفاصيل جديدة هنا عند تسجيلها.',
    isCurrent: true,
  },
  {
    id: 'sample-2',
    title: 'وصلت إلى مركز التوزيع',
    date: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    description: 'تم تسجيل وصول الشحنة إلى مركز الفرز والتوزيع.',
    isCurrent: false,
  },
  {
    id: 'sample-3',
    title: 'انطلقت نحو ولاية الوجهة',
    date: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    description: 'تم تسجيل مغادرة الشحنة من مركز الإرسال.',
    isCurrent: false,
  },
  {
    id: 'sample-4',
    title: 'تم تأكيد الطلب وتجهيزه',
    date: new Date(Date.now() - 3600 * 1000 * 36).toISOString(),
    description: 'اكتمل تجهيز الطلب لإحالته إلى شركة الشحن.',
    isCurrent: false,
  },
];

const BRANDING_CATEGORIES = [
  { id: 'identity', number: '01', label: 'الهوية', description: 'العلامة والألوان' },
  { id: 'appearance', number: '02', label: 'المظهر', description: 'الخلفية والخطوط والحركة' },
  { id: 'layout', number: '03', label: 'سجل الشحنة', description: 'طريقة عرض مراحل التوصيل' },
  { id: 'customer', number: '04', label: 'معلومات الزبون', description: 'الدعم والمحتوى الظاهر' },
] as const;

const BRANDING_MOTIFS: Record<string, string> = {
  stars: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22160%22%20height=%22160%22%20viewBox=%220%200%20160%20160%22%3E%3Cg%20fill=%22none%22%20stroke=%22%236D8A78%22%20stroke-opacity=%22.26%22%20stroke-width=%221.25%22%3E%3Cpath%20d=%22M28%2022v12m-6-6h12M116%2042v10m-5-5h10M77%20115v12m-6-6h12%22/%3E%3Ccircle%20cx=%22130%22%20cy=%22122%22%20r=%222%22/%3E%3Ccircle%20cx=%2248%22%20cy=%2282%22%20r=%221.8%22/%3E%3Ccircle%20cx=%2291%22%20cy=%2225%22%20r=%221.4%22/%3E%3C/g%3E%3C/svg%3E")`,
  leaves: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22190%22%20height=%22190%22%20viewBox=%220%200%20190%20190%22%3E%3Cg%20fill=%22none%22%20stroke=%22%2362846A%22%20stroke-opacity=%22.23%22%20stroke-width=%221.4%22%20stroke-linecap=%22round%22%3E%3Cpath%20d=%22M30%20156C55%20122%2067%2089%2073%2035M44%20137C18%20127%2017%20105%2025%2096c19%202%2028%2018%2019%2041ZM56%20113C37%2092%2043%2071%2054%2065c17%2011%2019%2028%202%2048ZM68%2082C75%2059%2097%2053%20109%2060c-3%2021-18%2031-41%2022ZM104%20165c14-28%2029-53%2056-75M126%20132c-3-20%2011-34%2025-34%207%2017-1%2031-25%2034ZM140%20106c-1-20%2013-31%2027-29%205%2018-5%2031-27%2029Z%22/%3E%3C/g%3E%3C/svg%3E")`,
  hearts: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22150%22%20height=%22150%22%20viewBox=%220%200%20150%20150%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B47791%22%20stroke-opacity=%22.25%22%20stroke-width=%221.35%22%3E%3Cpath%20d=%22M32%2037c-8-9-22%202-13%2013l17%2017%2017-17c9-11-5-22-14-13l-3%204-4-4Z%22/%3E%3Cpath%20d=%22M105%20104c-6-7-17%201-10%209l13%2013%2013-13c7-8-4-16-10-9l-3%203-3-3Z%22/%3E%3Cpath%20d=%22M111%2024c-4-5-12%201-7%206l9%209%209-9c5-5-3-11-7-6l-2%202-2-2Z%22/%3E%3C/g%3E%3C/svg%3E")`,
  waves: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22300%22%20height=%22180%22%20viewBox=%220%200%20300%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%234F8790%22%20stroke-opacity=%22.22%22%20stroke-width=%221.35%22%3E%3Cpath%20d=%22M-10%2028C30%206%2062%2049%20102%2028S174%206%20214%2028s72%2021%2096%200M-10%2050C30%2028%2062%2071%20102%2050s72-22%20112%200%2072%2021%2096%200M-10%20112c40-22%2072%2021%20112%200s72-22%20112%200%2072%2021%2096%200M-10%20134c40-22%2072%2021%20112%200s72-22%20112%200%2072%2021%2096%200%22/%3E%3C/g%3E%3C/svg%3E")`,
  arches: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22210%22%20height=%22240%22%20viewBox=%220%200%20210%20240%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B7775D%22%20stroke-opacity=%22.22%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M12%20240V105a93%2093%200%200%201%20186%200v135M31%20240V106a74%2074%200%200%201%20148%200v134M51%20240V108a54%2054%200%200%201%20108%200v132%22/%3E%3Cpath%20d=%22M0%20220h210%22/%3E%3C/g%3E%3C/svg%3E")`,
  contours: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22260%22%20height=%22210%22%20viewBox=%220%200%20260%20210%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23718394%22%20stroke-opacity=%22.22%22%20stroke-width=%221.2%22%3E%3Cpath%20d=%22M-20%2045C18%207%2063%208%2088%2036s62%2035%2093%200%2066-27%20100%204M-20%2062C18%2024%2063%2025%2088%2053s62%2035%2093%200%2066-27%20100%204M-20%2079C18%2041%2063%2042%2088%2070s62%2035%2093%200%2066-27%20100%204M-5%20153c29-29%2062-31%2086-8s49%2028%2075-1%2062-26%2099%204M-5%20170c29-29%2062-31%2086-8s49%2028%2075-1%2062-26%2099%204%22/%3E%3C/g%3E%3C/svg%3E")`,
  blueprint: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22180%22%20height=%22180%22%20viewBox=%220%200%20180%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23527AA1%22%20stroke-opacity=%22.23%22%20stroke-width=%221%22%3E%3Cpath%20d=%22M0%2030H180M0%2060H180M0%2090H180M0%20120H180M0%20150H180M30%200V180M60%200V180M90%200V180M120%200V180M150%200V180%22/%3E%3Ccircle%20cx=%2290%22%20cy=%2290%22%20r=%2228%22/%3E%3Ccircle%20cx=%2290%22%20cy=%2290%22%20r=%2219%22/%3E%3Cpath%20d=%22M90%2053v12M90%20115v12M53%2090h12M115%2090h12M130%2026h20v20h-20zM18%20128h18v18H18z%22/%3E%3C/g%3E%3C/svg%3E")`,
  dunes: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22280%22%20height=%22180%22%20viewBox=%220%200%20280%20180%22%3E%3Cg%20fill=%22none%22%20stroke=%22%23B79A69%22%20stroke-opacity=%22.25%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M-10%2080C34%2013%2073%2020%20111%2062s66%2056%2099%2013%2048-43%2080-2M-10%2099C34%2032%2073%2039%20111%2081s66%2056%2099%2013%2048-43%2080-2M-10%20118C34%2051%2073%2058%20111%20100s66%2056%2099%2013%2048-43%2080-2M-10%20151C39%20117%2085%20124%20129%20145s87%2010%20161-4%22/%3E%3C/g%3E%3C/svg%3E")`,
  petals: `url("data:image/svg+xml,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%22170%22%20height=%22170%22%20viewBox=%220%200%20170%20170%22%3E%3Cg%20fill=%22none%22%20stroke=%22%239B83AF%22%20stroke-opacity=%22.22%22%20stroke-width=%221.4%22%3E%3Cpath%20d=%22M42%2045c-13-17-28-1-13%2011%209%207%2015%2015%2015%2015s6-8%2015-15c15-12%200-28-13-11l-2%203-2-3Z%22/%3E%3Cpath%20d=%22M121%20112c-10-13-22-1-10%209%207%206%2011%2011%2011%2011s5-5%2011-11c12-10%200-22-10-9l-1%202-1-2Z%22/%3E%3Cpath%20d=%22M111%2030v12m-6-6h12M29%20119v10m-5-5h10%22/%3E%3C/g%3E%3C/svg%3E")`,
  zellige: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQiIGhlaWdodD0iMTQ0IiB2aWV3Qm94PSIwIDAgMTQ0IDE0NCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNTI3YjY4IiBzdHJva2Utb3BhY2l0eT0iLjI4IiBzdHJva2Utd2lkdGg9IjEuMSI+PHBhdGggZD0iTTcyIDQgODQgMTYgMTAxIDE0IDEwMyAzMSAxMjAgMzYgMTE1IDUzIDEzMSA2NiAxMjAgNzkgMTI1IDk2IDEwOCAxMDIgMTA2IDExOSA4OSAxMTcgNzIgMTM2IDU1IDExNyAzOCAxMTkgMzYgMTAyIDE5IDk2IDI0IDc5IDkgNjYgMjUgNTMgMjAgMzYgMzcgMzEgMzkgMTQgNTYgMTZaIi8+PHBhdGggZD0iTTcyIDE5IDgzIDM0IDEwMCAzNiA5OCA1MyAxMTEgNjYgOTggODAgMTAwIDk3IDgzIDk5IDcyIDExOSA2MSA5OSA0NCA5NyA0NiA4MCAzMyA2NiA0NiA1MyA0NCAzNiA2MSAzNFoiLz48cGF0aCBkPSJNMCAwIDI0IDAgMCAyNFpNMTIwIDBoMjR2MjRaTTAgMTIwdjI0aDI0Wk0xMjAgMTQ0bDI0LTI0djI0WiIvPjxwYXRoIGQ9Ik0wIDQ4aDE0NE0wIDk2aDE0NE00OCAwdjE0NE05NiAwdjE0NCIgc3Ryb2tlLW9wYWNpdHk9Ii4xMiIvPjwvZz48L3N2Zz4=")`,
  blockprint: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxODAiIGhlaWdodD0iMTgwIiB2aWV3Qm94PSIwIDAgMTgwIDE4MCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOWU3MTVhIiBzdHJva2Utb3BhY2l0eT0iLjI4IiBzdHJva2Utd2lkdGg9IjEuMzUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDUgNDUpIj48Y2lyY2xlIHI9IjgiLz48cGF0aCBkPSJNMC0yMmMtOCA4LTggMTQgMCAxOCA4LTQgOC0xMCAwLTE4Wk0yMiAwYy04LTgtMTQtOC0xOCAwIDQgOCAxMCA4IDE4IDBaTTAgMjJjOC04IDgtMTQgMC0xOC04IDQtOCAxMCAwIDE4Wk0tMjIgMGM4IDggMTQgOCAxOCAwLTQtOC0xMC04LTE4IDBaIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDEzNSAxMzUpIj48Y2lyY2xlIHI9IjgiLz48cGF0aCBkPSJNMC0yMmMtOCA4LTggMTQgMCAxOCA4LTQgOC0xMCAwLTE4Wk0yMiAwYy04LTgtMTQtOC0xOCAwIDQgOCAxMCA4IDE4IDBaTTAgMjJjOC04IDgtMTQgMC0xOC04IDQtOCAxMCAwIDE4Wk0tMjIgMGM4IDggMTQgOCAxOCAwLTQtOC0xMC04LTE4IDBaIi8+PC9nPjxwYXRoIGQ9Ik05MCA2djE0bS03LTdoMTRNOTAgMTYwdjE0bS03LTdoMTRNNiA5MGgxNG0tNy03djE0TTE2MCA5MGgxNG0tNy03djE0Ii8+PC9nPjwvc3ZnPg==")`,
  weave: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1NCIgaGVpZ2h0PSI1NCIgdmlld0JveD0iMCAwIDU0IDU0Ij48ZyBmaWxsPSJub25lIiBzdHJva2U9IiM3ZDhhNzciIHN0cm9rZS1vcGFjaXR5PSIuMjMiIHN0cm9rZS13aWR0aD0iMS4xIj48cGF0aCBkPSJNLTYgNiA2LTZNMCAxOCAxOCAwTTEyIDMwIDMwIDEyTTI0IDQyIDQyIDI0TTM2IDU0IDU0IDM2TTQ4IDY2IDY2IDQ4TS02IDQ4IDQ4LTZNNiA2MCA2MCA2Ii8+PHBhdGggZD0iTS02IDE4IDE4IDQyTS02IDMwIDMwIDY2TTYgNiA0OCA0OE0xOC02IDYwIDM2IiBzdHJva2Utb3BhY2l0eT0iLjE0Ii8+PC9nPjwvc3ZnPg==")`,
  mashrabiya: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMTIiIGhlaWdodD0iMTEyIiB2aWV3Qm94PSIwIDAgMTEyIDExMiI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjY4NTZGIiBzdHJva2Utb3BhY2l0eT0iLjI1IiBzdHJva2Utd2lkdGg9IjEuMSI+PHBhdGggZD0iTTI4IDAgNTYgMjggODQgMCBNMCAyOCAyOCA1NiAwIDg0IE01NiAyOCA4NCA1NiA1NiA4NCAyOCA1NiA1NiAyOCBNODQgNTYgMTEyIDI4IE0yOCAxMTIgNTYgODQgODQgMTEyIE04NCAwIDExMiAyOCA4NCA1NiAxMTIgODQgODQgMTEyIE0wIDI4aDI4djI4SDAgTTg0IDU2aDI4djI4SDg0IE0yOCAwaDU2IE0yOCAxMTJoNTYiLz48cGF0aCBkPSJNMjggMjhoNTZ2NTZIMjh6IE00MiA0MmgyOHYyOEg0MnoiIHN0cm9rZS1vcGFjaXR5PSIuMTQiLz48L2c+PC9zdmc+")`, 
  amazigh: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDQiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCAxNDQgOTYiPjxnIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0E5NkU1OCIgc3Ryb2tlLW9wYWNpdHk9Ii4yNSIgc3Ryb2tlLXdpZHRoPSIxLjI1IiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMCAyNCAxMiAxMiAyNCAyNCAxMiAzNlogTTI0IDI0IDM2IDEyIDQ4IDI0IDM2IDM2WiBNNDggMjQgNjAgMTIgNzIgMjQgNjAgMzZaIE03MiAyNCA4NCAxMiA5NiAyNCA4NCAzNlogTTk2IDI0IDEwOCAxMiAxMjAgMjQgMTA4IDM2WiBNMTIwIDI0IDEzMiAxMiAxNDQgMjQgMTMyIDM2WiIvPjxwYXRoIGQ9Ik0wIDcyIDEyIDYwIDI0IDcyIDEyIDg0WiBNMjQgNzIgMzYgNjAgNDggNzIgMzYgODRaIE00OCA3MiA2MCA2MCA3MiA3MiA2MCA4NFogTTcyIDcyIDg0IDYwIDk2IDcyIDg0IDg0WiBNOTYgNzIgMTA4IDYwIDEyMCA3MiAxMDggODRaIE0xMjAgNzIgMTMyIDYwIDE0NCA3MiAxMzIgODRaIi8+PHBhdGggZD0iTTEyIDM2djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0bTI0LTI0djI0IiBzdHJva2UtZGFzaGFycmF5PSIzIDUiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjQ4IiByPSIyIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI0OCIgcj0iMiIvPjxjaXJjbGUgY3g9IjEwOCIgY3k9IjQ4IiByPSIyIi8+PC9nPjwvc3ZnPg==")`, 
  embroidery: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIiB2aWV3Qm94PSIwIDAgMTYwIDE2MCI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOEI3OTYzIiBzdHJva2Utb3BhY2l0eT0iLjI1IiBzdHJva2Utd2lkdGg9IjEuMjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTI2IDE0NWMxNi0yNiAyMy01MCAyOS04M20tOCA1OUMyMyAxMTcgMTYgMTAxIDIyIDg4YzE4IDEgMzAgMTUgMjUgMzNabTgtMjhDNDMgNzcgNDggNjEgNjEgNTdjMTIgMTEgMTAgMjYtNSAzNlptMzggNDdjMTAtMjQgMjItNDcgNDUtNjNtLTI4IDQyYy01LTE2IDQtMjkgMTctMzEgNyAxMyAxIDI2LTE3IDMxWm0xNC0xOWMtMS0xNyAxMC0yNiAyMS0yMyA1IDE1LTQgMjUtMjEgMjNaIi8+PHBhdGggZD0iTTk4IDI4Yy04LTExLTIxIDEtMTEgMTFsMTEgMTEgMTEtMTFjMTAtMTAtMy0yMi0xMS0xMVogTTQwIDM0djEwbS01LTVoMTAgTTExNCAxMTZ2MTBtLTUtNWgxMCIvPjxjaXJjbGUgY3g9Ijk4IiBjeT0iMjgiIHI9IjIiLz48Y2lyY2xlIGN4PSIyNiIgY3k9IjE0NSIgcj0iMiIvPjwvZz48L3N2Zz4=")`,
};

/* =========================================================
   PHONE PREVIEW — Fully isolated memo component.
   Re-renders ONLY when the deferred brandConfig settles —
   never triggered by the 1800-line parent's other state.
   ========================================================= */
const BrandingPhonePreview = memo(function BrandingPhonePreview({
  brandConfig,
  storeName,
}: {
  brandConfig: EditableBrandSettings;
  storeName: string;
}) {
  const isDark = brandConfig.themeMode === 'dark';
  const backgroundTokens: Record<string, { light: string; dark: string; surface?: string; surfaceDark?: string; image?: string; size?: string }> = {
    aurora: { light: '#F2F1ED', dark: '#222924', surface: '#FFFEFA', surfaceDark: '#1D2420', image: 'radial-gradient(ellipse at 12% 7%, rgba(166,205,177,.38), transparent 38%), radial-gradient(ellipse at 91% 20%, rgba(245,204,148,.28), transparent 36%), radial-gradient(ellipse at 55% 100%, rgba(189,202,211,.23), transparent 42%)' },
    midnight: { light: '#E5E9E6', dark: '#151A18', surface: '#F7F9F6', surfaceDark: '#1D2420', image: `radial-gradient(circle at 16% 16%, rgba(215,229,218,.13), transparent 32%), ${BRANDING_MOTIFS.stars}`, size: 'auto, 160px 160px' },
    minimal: { light: '#F8F8F5', dark: '#252825', surface: '#FFFFFF', surfaceDark: '#202420', image: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.72), transparent 55%)' },
    sunset: { light: '#F4EEE5', dark: '#2B2420', surface: '#FFFAF2', surfaceDark: '#2B2420', image: `radial-gradient(ellipse at 85% 15%, rgba(241,174,118,.24), transparent 44%), ${BRANDING_MOTIFS.arches}`, size: 'auto, 210px 240px' },
    emerald: { light: '#EDF1EB', dark: '#1A2920', surface: '#FBFDF9', surfaceDark: '#1D2922', image: BRANDING_MOTIFS.leaves, size: '190px 190px' },
    mesh: { light: '#F0F2F1', dark: '#202624', image: `linear-gradient(rgba(42,62,52,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(42,62,52,.04) 1px, transparent 1px), ${BRANDING_MOTIFS.blueprint}`, size: '18px 18px, 18px 18px, 180px 180px', surface: '#FCFDFC', surfaceDark: '#1D2420' },
    linen: { light: '#F2EEE5', dark: '#292720', surface: '#FFFDF7', surfaceDark: '#292720', image: 'repeating-linear-gradient(0deg, rgba(112,92,62,.035) 0, rgba(112,92,62,.035) 1px, transparent 1px, transparent 5px)' },
    porcelain: { light: '#F5F0F3', dark: '#27232A', surface: '#FFFBFD', surfaceDark: '#27232A', image: BRANDING_MOTIFS.hearts, size: '150px 150px' },
    slate: { light: '#E6E9EC', dark: '#20262D', surface: '#F8FAFB', surfaceDark: '#20262D', image: BRANDING_MOTIFS.contours, size: '260px 210px' },
    ocean: { light: '#E7F1F1', dark: '#1C2A2B', surface: '#FBFFFF', surfaceDark: '#1C2A2B', image: BRANDING_MOTIFS.waves, size: '300px 180px' },
    terracotta: { light: '#F3E8E1', dark: '#30231F', surface: '#FFFAF6', surfaceDark: '#30231F', image: `radial-gradient(ellipse at 50% 0%, rgba(255,220,184,.36), transparent 46%), ${BRANDING_MOTIFS.arches}`, size: 'auto, 210px 240px' },
    plum: { light: '#F0EBF3', dark: '#29232E', surface: '#FDFAFF', surfaceDark: '#29232E', image: `radial-gradient(ellipse at 15% 10%, rgba(218,195,231,.32), transparent 43%), ${BRANDING_MOTIFS.petals}`, size: 'auto, 170px 170px' },
    blueprint: { light: '#EAF0F7', dark: '#1D2734', image: BRANDING_MOTIFS.blueprint, size: '180px 180px', surface: '#FBFDFF', surfaceDark: '#1D2734' },
    sandstone: { light: '#F1EEE5', dark: '#2B2923', image: BRANDING_MOTIFS.dunes, size: '280px 180px', surface: '#FFFDF6', surfaceDark: '#2B2923' },
    zellige: { light: '#EDEFE7', dark: '#202821', surface: '#FBFCF8', surfaceDark: '#242D26', image: BRANDING_MOTIFS.zellige, size: '144px 144px' },
    blockprint: { light: '#F3EDE3', dark: '#2B2520', surface: '#FFFBF5', surfaceDark: '#302923', image: BRANDING_MOTIFS.blockprint, size: '180px 180px' },
    weave: { light: '#F0F1E9', dark: '#202620', surface: '#FBFCF8', surfaceDark: '#252D26', image: BRANDING_MOTIFS.weave, size: '54px 54px' },
    mashrabiya: { light: '#EFF1E9', dark: '#202821', surface: '#FBFCF8', surfaceDark: '#242D26', image: BRANDING_MOTIFS.mashrabiya, size: '112px 112px' },
    amazigh: { light: '#F2ECE3', dark: '#2A2420', surface: '#FFFBF5', surfaceDark: '#302923', image: BRANDING_MOTIFS.amazigh, size: '144px 96px' },
    embroidery: { light: '#F2F0E8', dark: '#272821', surface: '#FFFEFA', surfaceDark: '#292A23', image: BRANDING_MOTIFS.embroidery, size: '160px 160px' },
    blobs: { light: '#F2F0EA', dark: '#202722', surface: '#FFFEFA', surfaceDark: '#242D27', image: 'radial-gradient(ellipse at 16% 18%, rgba(104,157,126,.16), transparent 34%), radial-gradient(ellipse at 84% 77%, rgba(207,145,115,.17), transparent 36%), radial-gradient(ellipse at 70% 9%, rgba(126,144,196,.11), transparent 28%)', size: 'auto' },
  };
  const backgroundToken = backgroundTokens[String(brandConfig.bgStyle)] || backgroundTokens.aurora;
  const screenBg = isDark ? backgroundToken.dark : backgroundToken.light;
  const textColor = isDark ? '#F2F4EF' : '#202824';
  const mutedColor = isDark ? '#B4BDB6' : '#69736E';
  const quietColor = isDark ? '#89958D' : '#8B948F';
  const borderColor = isDark ? 'rgba(245,248,243,.13)' : '#E5E6DF';
  const strongBorderColor = isDark ? 'rgba(245,248,243,.2)' : '#D5D9D1';
  const raisedSurface = isDark ? '#232C27' : '#FFFFFF';
  const baseSurface = isDark ? (backgroundToken.surfaceDark || backgroundToken.dark) : (backgroundToken.surface || '#FFFEFA');
  const isBorderless = brandConfig.cardSurface === 'borderless';
  const isOpenCanvas = isBorderless || brandConfig.cardSurface === 'solid';
  const cardBg = isOpenCanvas ? 'transparent'
    : brandConfig.cardSurface === 'glass' ? (isDark ? 'rgba(29,36,32,.84)' : 'rgba(255,254,250,.84)')
    : String(brandConfig.cardSurface) === 'tinted' ? (isDark ? `color-mix(in srgb, ${brandConfig.brandColor} 13%, #1D2420)` : `color-mix(in srgb, ${brandConfig.brandColor} 6%, #FFFEFA)`)
    : String(brandConfig.cardSurface) === 'inset' ? (isDark ? '#1A211D' : '#F2F3EE')
    : String(brandConfig.cardSurface) === 'paper' ? (isDark ? '#252720' : '#FFFDF7')
    : baseSurface;
  const cardBorder = brandConfig.cardSurface === 'bordered' || String(brandConfig.cardSurface) === 'paper' || String(brandConfig.cardSurface) === 'inset' || String(brandConfig.cardSurface) === 'tinted'
    ? `1px solid ${strongBorderColor}`
    : isOpenCanvas ? 'none' : String(brandConfig.cardSurface) === 'elevated' ? '1px solid transparent' : `1px solid ${borderColor}`;
  const cardRadius = brandConfig.cardRadius === 'sleek' ? '14px' : brandConfig.cardRadius === 'pebble' ? '38px' : '26px';
  const cardShadow = brandConfig.cardSurface === 'bordered' || String(brandConfig.cardSurface) === 'inset' || isOpenCanvas
    ? 'none'
    : String(brandConfig.cardSurface) === 'elevated' ? '0 18px 38px rgba(17,31,22,.17)'
    : String(brandConfig.cardSurface) === 'paper' ? '0 3px 0 rgba(50,43,32,.035), 0 12px 24px rgba(17,31,22,.055)'
    : '0 12px 30px rgba(17,31,22,.10)';
  const fontFamily = brandConfig.fontFamily === 'cairo' ? "'Cairo', system-ui, sans-serif"
    : brandConfig.fontFamily === 'tajawal' ? "'Tajawal', system-ui, sans-serif"
    : brandConfig.fontFamily === 'ibm-plex' ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
    : brandConfig.fontFamily === 'noto-kufi' ? "'Noto Kufi Arabic', system-ui, sans-serif"
    : "'Readex Pro', system-ui, sans-serif";
  const cardWidth = '100%';
  const density = { padding: '16px 14px', gap: '12px', avatar: '39px', avatarRadius: '12px', topMargin: '14px' };
  const panelRadius = brandConfig.cardRadius === 'sleek' ? '10px' : brandConfig.cardRadius === 'pebble' ? '21px' : '16px';
  const softFill = isDark ? 'rgba(255,255,255,.045)' : 'rgba(32,40,36,.035)';
  const brandTint = `${brandConfig.brandColor}16`;

  return (
    <div className="dz-phone-chassis">
      <div className="dz-phone-notch"><div className="dz-phone-speaker" /></div>
      <div
        className="dz-phone-screen"
        data-background-style={String(brandConfig.bgStyle)}
        data-animate-blobs={brandConfig.animateBackgroundBlobs ? 'true' : 'false'}
        data-background-blur={brandConfig.backgroundBlur !== false ? 'true' : 'false'}
        data-theme-mode={brandConfig.themeMode}
        style={{
          backgroundColor: screenBg,
          backgroundImage: 'none',
          color: textColor,
          fontFamily,
          ['--preview-brand' as string]: brandConfig.brandColor,
          ['--preview-text' as string]: textColor,
          ['--preview-muted' as string]: mutedColor,
          ['--preview-border' as string]: borderColor,
          ['--preview-surface' as string]: raisedSurface,
          ['--preview-tint' as string]: brandTint,
          transition: 'background-color .2s ease, color .2s ease',
        } as React.CSSProperties}
      >
        <div
          className="dz-preview-background-blur"
          aria-hidden="true"
          style={{
            backgroundColor: screenBg,
            backgroundImage: backgroundToken.image,
            backgroundSize: backgroundToken.size || 'auto',
            backgroundRepeat: 'repeat',
            backgroundPosition: '0 0',
          }}
        />
        <div className="dz-phone-scroll-viewport">
        <div style={{ width: cardWidth, maxWidth: '100%', margin: '0 auto', background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none', overflow: 'visible', position: 'relative', zIndex: 1, transition: 'width .2s ease' }}>
          <div style={{ height: '4px', width: '100%', background: brandConfig.brandColor }} />

          <header style={{ padding: density.padding, borderBottom: `1px solid ${borderColor}` }}>
            {brandConfig.announcementText && (
              <div style={{ background: brandTint, border: `1px solid ${brandConfig.brandColor}35`, color: textColor, padding: '9px 11px', borderRadius: '10px', fontSize: '12px', lineHeight: 1.7, fontWeight: 600, marginBottom: density.topMargin, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>تنبيه</span>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{brandConfig.announcementText}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '7px', marginBottom: density.topMargin }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: mutedColor, fontSize: '12px', fontWeight: 750 }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '2px', transform: 'rotate(45deg)', background: brandConfig.brandColor }} />
                تتبّع الطلب
              </span>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                {brandConfig.showOrderNumberBadge !== false && (
                  <span style={{ fontSize: '10px', color: mutedColor, background: softFill, border: `1px solid ${borderColor}`, padding: '5px 7px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                    طلب <b style={{ color: textColor }} dir="ltr">DZ-1042</b>
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: density.gap, minWidth: 0 }}>
              <div style={{ width: density.avatar, height: density.avatar, borderRadius: density.avatarRadius, background: brandConfig.brandColor, color: getReadableOnBrand(brandConfig.brandColor), display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 800, fontSize: '17px', overflow: 'hidden' }}>
                {brandConfig.logoUrl ? (
                  <img
                    src={toCachedImageUrl(brandConfig.logoUrl)}
                    alt={storeName}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  storeName.trim().charAt(0) || 'م'
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{storeName}</div>
                {brandConfig.brandSubtitle && <div style={{ fontSize: '12px', lineHeight: 1.6, marginTop: '3px', color: mutedColor, overflowWrap: 'anywhere' }}>{brandConfig.brandSubtitle}</div>}
              </div>
            </div>
          </header>

          <section aria-label="معلومات العميل والمنتج" style={{ padding: '15px 14px 16px', borderBottom: `1px solid ${borderColor}`, display: 'grid', gridTemplateColumns: brandConfig.showProductSection !== false ? 'minmax(0, .9fr) minmax(0, 1.1fr)' : 'minmax(0, 1fr)', gap: '13px', alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: quietColor, fontSize: '10px', fontWeight: 750, marginBottom: '5px' }}>العميل</div>
              <div style={{ color: textColor, fontSize: '17px', lineHeight: 1.55, fontWeight: 850, overflowWrap: 'anywhere' }}>ليان بن صالح</div>
            </div>
            {brandConfig.showProductSection !== false && <div style={{ minWidth: 0, paddingInlineStart: '12px', borderInlineStart: `2px solid ${brandConfig.brandColor}70` }}>
              <div style={{ color: quietColor, fontSize: '10px', fontWeight: 750, marginBottom: '5px' }}>المنتج</div>
              <div style={{ color: textColor, fontSize: '15px', lineHeight: 1.6, fontWeight: 800, overflowWrap: 'anywhere' }}>حقيبة جلدية زيتونية</div>
            </div>}
          </section>

          <section style={{ padding: '15px 13px 21px', borderBottom: `1px solid ${borderColor}` }}>
            <div style={{ border: isOpenCanvas ? 'none' : cardBorder, borderInlineStart: isBorderless ? 'none' : `3px solid ${brandConfig.brandColor}`, borderRadius: isOpenCanvas ? 0 : cardRadius, background: isOpenCanvas ? 'transparent' : cardBg, boxShadow: isOpenCanvas ? 'none' : cardShadow, backdropFilter: brandConfig.cardSurface === 'glass' ? 'blur(10px)' : undefined, WebkitBackdropFilter: brandConfig.cardSurface === 'glass' ? 'blur(10px)' : undefined, padding: isOpenCanvas ? '8px 0 12px' : '15px 13px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '5px 10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: mutedColor }}>آخر تحديث</span>
                <span style={{ fontSize: '10px', color: quietColor, whiteSpace: 'nowrap' }}>اليوم · 10:42</span>
              </div>
              <div style={{ color: textColor, fontSize: '17px', lineHeight: 1.65, fontWeight: 850, overflowWrap: 'anywhere' }}>خرج للتوصيل مع المندوب</div>
              <p style={{ margin: '6px 0 0', color: mutedColor, fontSize: '12px', lineHeight: 1.8 }}>الشحنة في مرحلة التوصيل النهائية. ستظهر أي تفاصيل جديدة هنا.</p>
            </div>

            {brandConfig.showCarrierBadge && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '15px', padding: '12px 0', borderBlock: `1px solid ${borderColor}`, minWidth: 0 }}>
                <span style={{ width: '31px', height: '31px', display: 'grid', placeItems: 'center', borderRadius: '9px', background: brandTint, color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), flexShrink: 0, fontWeight: 800, fontSize: '15px' }}>↗</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '11px', color: mutedColor, marginBottom: '3px' }}>ياليدين</span>
                  <strong style={{ display: 'block', fontSize: '13px', color: textColor, overflowWrap: 'anywhere' }} dir="ltr">12839401</strong>
                </span>
                <span style={{ fontSize: '11px', color: getReadableBrandAccent(brandConfig.brandColor, brandConfig.themeMode), fontWeight: 750, flexShrink: 0 }}>نسخ</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', margin: '22px 0 15px', paddingTop: '18px', borderTop: `1px solid ${borderColor}` }}>
              <div style={{ fontSize: '16px', fontWeight: 850, letterSpacing: '-.02em', color: textColor }}>سجل التحديثات</div>
              <span style={{ minWidth: '23px', height: '23px', padding: '2px 6px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: mutedColor, background: softFill, fontSize: '11px', fontWeight: 750 }}>{SAMPLE_PREVIEW_EVENTS.length - 1}</span>
            </div>

            {SAMPLE_PREVIEW_EVENTS.slice(1).map((event, index) => {
              const timelineKind = String(brandConfig.timelineDesign);
              const isLast = index === SAMPLE_PREVIEW_EVENTS.length - 2;
              return (
                <div key={event.id} className={`dz-preview-event dz-preview-event--${timelineKind}${isLast ? ' is-last' : ''}`}>
                  <div className="dz-preview-event-gutter" aria-hidden="true">
                    <span className="dz-preview-event-marker">{timelineKind === 'numbered' ? (index + 1).toLocaleString('ar-DZ') : timelineKind === 'editorial' ? '' : '✓'}</span>
                    {!isLast && !['cards', 'compact', 'milestones', 'dossier'].includes(timelineKind) && brandConfig.timelineLineStyle !== 'none' && (
                      <span className={`dz-preview-event-line dz-preview-event-line--${brandConfig.timelineLineStyle || 'straight'}`}>
                        {brandConfig.timelineLineStyle === 'curved' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C2 23 2 77 12 100" /></svg>}
                        {brandConfig.timelineLineStyle === 'wave' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C0 14 0 25 12 36 S24 60 12 72 S0 88 12 100" /></svg>}
                      </span>
                    )}
                  </div>
                  <div className="dz-preview-event-content">
                    {['editorial', 'dossier', 'milestones'].includes(timelineKind) && (
                      <div className="dz-preview-event-kicker">{timelineKind === 'dossier' ? `سجل الشحنة / ${String(index + 1).padStart(2, '0')}` : timelineKind === 'milestones' ? 'محطة من الرحلة' : `المرحلة ${String(index + 1).padStart(2, '0')}`}</div>
                    )}
                    <div className="dz-preview-event-head">
                      <strong>{event.title}</strong>
                      <time>أمس · 22:15</time>
                    </div>
                    {event.description && <p>{event.description}</p>}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
        </div>
      </div>
      {brandConfig.supportPhone && brandConfig.showWhatsAppButton !== false && (
        <div aria-hidden="true" style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 40, display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 12px', borderRadius: '99px', background: '#188B55', color: '#fff', boxShadow: '0 7px 18px rgba(18,107,63,.25)', fontSize: '11px', fontWeight: 800, pointerEvents: 'none' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 7.5 7.5v.5Z" /></svg> تواصل معنا
        </div>
      )}
    </div>
  );
});

const BACKGROUND_STYLES: { id: BackgroundStyle; name: string; desc: string; icon: string; previewBg: string }[] = [
  { id: 'aurora', name: 'ضوء شفق', desc: 'هالات ضوئية واسعة بتمويه ناعم يخلق عمقاً هادئاً.', icon: '✧', previewBg: 'radial-gradient(ellipse at 12% 7%, rgba(166,205,177,.7), transparent 45%), radial-gradient(ellipse at 91% 20%, rgba(245,204,148,.48), transparent 44%), #F2F1ED' },
  { id: 'midnight', name: 'ليل مضيء', desc: 'نقاط نجميّة وخطوط ضوء خافتة فوق سطح ليلي.', icon: '✦', previewBg: `radial-gradient(circle at 16% 16%, rgba(215,229,218,.45), transparent 36%), ${BRANDING_MOTIFS.stars}, #222924` },
  { id: 'minimal', name: 'ورق صامت', desc: 'ورق نقي مع انعكاس ضوء خفيف؛ دون زخرفة مشتتة.', icon: '◯', previewBg: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.96), transparent 60%), #F8F8F5' },
  { id: 'sunset', name: 'أقواس الغروب', desc: 'أقواس معمارية تتدرج داخل إضاءة شمس دافئة.', icon: '◒', previewBg: `radial-gradient(ellipse at 85% 15%, rgba(241,174,118,.52), transparent 50%), ${BRANDING_MOTIFS.arches}, #F4EEE5` },
  { id: 'emerald', name: 'أثر نباتي', desc: 'رسوم أوراق خطية خفيفة بطابع طبيعي راقٍ.', icon: '❧', previewBg: `${BRANDING_MOTIFS.leaves}, #EDF1EB` },
  { id: 'mesh', name: 'شبكة تقنية', desc: 'شبكة هندسية مع علامات قياس دقيقة كلوحة تشغيل.', icon: '⌗', previewBg: `linear-gradient(rgba(42,62,52,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(42,62,52,.12) 1px, transparent 1px), ${BRANDING_MOTIFS.blueprint}, #F0F2F1` },
  { id: 'linen' as BackgroundStyle, name: 'نسيج الكتان', desc: 'ألياف ورقية دقيقة تمنح الخلفية ملمساً غير لامع.', icon: '▤', previewBg: 'repeating-linear-gradient(0deg, rgba(112,92,62,.12) 0, rgba(112,92,62,.12) 1px, transparent 1px, transparent 5px), #F2EEE5' },
  { id: 'porcelain' as BackgroundStyle, name: 'قلوب رقيقة', desc: 'قلوب مرسومة بخط رفيع ومتباعدة، بطابع ودود غير طفولي.', icon: '♡', previewBg: `${BRANDING_MOTIFS.hearts}, #F5F0F3` },
  { id: 'slate' as BackgroundStyle, name: 'خرائط كنتورية', desc: 'خطوط تضاريس متدفقة بتباين منخفض وطابع معماري.', icon: '≋', previewBg: `${BRANDING_MOTIFS.contours}, #E6E9EC` },
  { id: 'ocean' as BackgroundStyle, name: 'موج بحري', desc: 'خطوط أمواج متكررة تمنح إحساساً بالحركة والاتساع.', icon: '〰', previewBg: `${BRANDING_MOTIFS.waves}, #E7F1F1` },
  { id: 'terracotta' as BackgroundStyle, name: 'أقواس طينية', desc: 'طبقات أقواس مستوحاة من العمارة المتوسطية.', icon: '⌒', previewBg: `radial-gradient(ellipse at 50% 0%, rgba(255,220,184,.5), transparent 48%), ${BRANDING_MOTIFS.arches}, #F3E8E1` },
  { id: 'plum' as BackgroundStyle, name: 'بتلات ضبابية', desc: 'بتلات وخطوط صغيرة فوق توهج ليلكي خفيف.', icon: '✿', previewBg: `radial-gradient(ellipse at 15% 10%, rgba(218,195,231,.58), transparent 48%), ${BRANDING_MOTIFS.petals}, #F0EBF3` },
  { id: 'blueprint' as BackgroundStyle, name: 'رسم هندسي', desc: 'شبكة ومخطط دائري وعلامات مرجعية شبيهة بالرسومات الفنية.', icon: '⌖', previewBg: `${BRANDING_MOTIFS.blueprint}, #EAF0F7` },
  { id: 'sandstone' as BackgroundStyle, name: 'كثبان رملية', desc: 'خطوط كثبان متراكبة بإحساس عضوي ودفء صحراوي.', icon: '∿', previewBg: `${BRANDING_MOTIFS.dunes}, #F1EEE5` },
  { id: 'zellige' as BackgroundStyle, name: 'زليج حرفي', desc: 'نجوم هندسية مستوحاة من الزليج التقليدي بتباين هادئ.', icon: '✳', previewBg: `${BRANDING_MOTIFS.zellige}, #EDEFE7` },
  { id: 'blockprint' as BackgroundStyle, name: 'طباعة يدوية', desc: 'زخارف نباتية تشبه الأختام المطبوعة يدوياً.', icon: '❋', previewBg: `${BRANDING_MOTIFS.blockprint}, #F3EDE3` },
  { id: 'weave' as BackgroundStyle, name: 'نسيج متشابك', desc: 'خيوط متقاطعة بنمط حرفي هادئ يشبه النسيج.', icon: '▧', previewBg: `${BRANDING_MOTIFS.weave}, #F0F1E9` },
  { id: 'mashrabiya' as BackgroundStyle, name: 'شبكة مشربية', desc: 'شبكة هندسية مخرّمة مستوحاة من المشربية، بظل خفيف ومساحة تنفّس.', icon: '⌘', previewBg: `${BRANDING_MOTIFS.mashrabiya}, #EFF1E9` },
  { id: 'amazigh' as BackgroundStyle, name: 'نسيج أمازيغي', desc: 'معينات وخطوط متناوبة مستوحاة من النسيج التقليدي.', icon: '◇', previewBg: `${BRANDING_MOTIFS.amazigh}, #F2ECE3` },
  { id: 'embroidery' as BackgroundStyle, name: 'تطريز يدوي', desc: 'خطوط نباتية دقيقة وغرز زخرفية بإحساس مصنوع يدوياً.', icon: '✿', previewBg: `${BRANDING_MOTIFS.embroidery}, #F2F0E8` },
  { id: 'blobs' as BackgroundStyle, name: 'أشكال عضوية', desc: 'كتل لونية عضوية ناعمة موزعة كطبقات إضاءة ضبابية.', icon: '◉', previewBg: 'radial-gradient(ellipse at 16% 18%, rgba(104,157,126,.5), transparent 36%), radial-gradient(ellipse at 84% 77%, rgba(207,145,115,.5), transparent 38%), #F2F0EA' },
];

const TIMELINE_DESIGNS: { id: TimelineDesign; name: string; desc: string; icon: string }[] = [
  { id: 'stepper', name: 'مسار متصل', desc: 'خط رفيع ونقاط بسيطة لتسلسل كلاسيكي هادئ.', icon: '│' },
  { id: 'cards', name: 'بطاقات مستقلة', desc: 'كل تحديث بطاقة منفصلة بحد وظل ومساحة خاصة.', icon: '▤' },
  { id: 'journey', name: 'مسار متقطع', desc: 'عُقد مائلة ومسار متقطع يوحي بمحطات الرحلة.', icon: '◇' },
  { id: 'compact', name: 'سجل مضغوط', desc: 'عنوان وتوقيت في سطر واحد مع فواصل متقطعة.', icon: '≡' },
  { id: 'rail' as TimelineDesign, name: 'سكة العلامة', desc: 'سكة سميكة بلون المتجر مع علامات مربعة بارزة.', icon: '┃' },
  { id: 'editorial' as TimelineDesign, name: 'تحرير زمني', desc: 'عناوين كبيرة، توقيت أسفلها وفواصل على الهامش.', icon: '¶' },
  { id: 'milestones' as TimelineDesign, name: 'لوحات المحطات', desc: 'كل مرحلة لوحة بصبغة خفيفة وحد جانبي، دون مسار.', icon: '▰' },
  { id: 'numbered' as TimelineDesign, name: 'خطوات مرقّمة', desc: 'أرقام متتابعة داخل مربعات واضحة متصلة بخط.', icon: '①' },
  { id: 'dossier' as TimelineDesign, name: 'ملف الشحنة', desc: 'سجل جدولي مفتوح مع ترقيم وفواصل، بلا علامات مسار.', icon: '▥' },
];

const TIMELINE_LINE_STYLES: { id: TimelineLineStyle; name: string; desc: string; icon: string }[] = [
  { id: 'straight', name: 'خط مستقيم', desc: 'اتصال رفيع وواضح بين النقاط.', icon: '│' },
  { id: 'dashed', name: 'متقطع', desc: 'مقاطع قصيرة توحي بمراحل منفصلة.', icon: '┆' },
  { id: 'dotted', name: 'منقّط', desc: 'نقاط صغيرة بإيقاع خفيف.', icon: '⁝' },
  { id: 'curved', name: 'منحني', desc: 'انحناءات ناعمة تصل كل محطة بالتالية.', icon: '∿' },
  { id: 'wave', name: 'متموّج', desc: 'مسار عضوي متموّج بدلاً من خط عمودي.', icon: '〰' },
  { id: 'none', name: 'بلا خط', desc: 'نقاط مستقلة دون وصل بصري.', icon: '·' },
];

const CARD_SURFACES: { id: CardSurface; name: string; desc: string; icon: string }[] = [
  { id: 'glass', name: 'سطح شفاف', desc: 'شفافية محدودة؛ الأفضل مع خلفية هادئة.', icon: '◌' },
  { id: 'solid', name: 'محتوى مفتوح', desc: 'تفاصيل الحالة فوق الخلفية مباشرة، دون بطاقة ممتلئة.', icon: '↔' },
  { id: 'bordered', name: 'إطار تحريري', desc: 'حدود دقيقة تفصل المحتوى بلا ظلال.', icon: '▱' },
  { id: 'borderless', name: 'تخطيط مفتوح', desc: 'محتوى مباشر بلا إطار أو طبقات إضافية.', icon: '↔' },
  { id: 'elevated' as CardSurface, name: 'طبقات مرتفعة', desc: 'ظل عميق خفيف يرفع بطاقة التتبع عن الخلفية.', icon: '▱' },
  { id: 'tinted' as CardSurface, name: 'صبغة العلامة', desc: 'خلفية ملونة بنسبة منخفضة مشتقة من لون المتجر.', icon: '◈' },
  { id: 'paper' as CardSurface, name: 'ورق فاخر', desc: 'سطح دافئ مع حد رفيع وظل قصير جداً.', icon: '▤' },
  { id: 'inset' as CardSurface, name: 'سطح غائر', desc: 'طبقة داخلية هادئة بإطار دقيق بلا ظل خارجي.', icon: '▱' },
];

const CARD_RADII: { id: CardRadius; name: string; px: string }[] = [
  { id: 'sleek', name: 'زوايا دقيقة (14px)', px: '14px' },
  { id: 'modern', name: 'زوايا متوازنة (26px)', px: '26px' },
  { id: 'pebble', name: 'زوايا لينة (38px)', px: '38px' },
];

function getBrandContrastRatio(hex: string, backgroundHex: string): number {
  const luminance = (value: string) => {
    const normalized = value.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) return 0.2;
    const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
    const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const a = luminance(hex);
  const b = luminance(backgroundHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function getReadableOnBrand(hex: string): string {
  return getBrandContrastRatio(hex, '#FFFFFF') >= getBrandContrastRatio(hex, '#17211B') ? '#FFFFFF' : '#17211B';
}

function getReadableBrandAccent(hex: string, themeMode: string | undefined): string {
  const dark = themeMode === 'dark';
  const canvas = dark ? '#202622' : '#F4F5F1';
  if (getBrandContrastRatio(hex, canvas) >= 4.5) return hex;
  return dark ? '#D4E6D8' : '#28513B';
}


const BRAND_PALETTES = [
  { name: 'فحمي رصين', hex: '#27342D' },
  { name: 'أزرق عميق', hex: '#315A70' },
  { name: 'أخضر غابي', hex: '#35634A' },
  { name: 'بنفسجي داكن', hex: '#635174' },
  { name: 'قرمزي هادئ', hex: '#A34F4F' },
  { name: 'أزرق مخضر', hex: '#39736D' },
  { name: 'وردي ترابي', hex: '#A75D70' },
  { name: 'عنبري دافئ', hex: '#A87536' },
];

const FONT_FAMILIES: { id: FontFamily; name: string; sample: string }[] = [
  { id: 'readex',   name: 'Readex Pro',          sample: 'سريع وعصري' },
  { id: 'cairo',    name: 'Cairo',               sample: 'أنيق ومتوازن' },
  { id: 'tajawal',  name: 'Tajawal',             sample: 'خط عربي حديث' },
  { id: 'ibm-plex', name: 'IBM Plex Arabic',     sample: 'تقني واحترافي' },
  { id: 'noto-kufi',name: 'Noto Kufi Arabic',    sample: 'كوفي أصيل' },
];

const ANIMATION_LEVELS: { id: AnimationLevel; name: string; desc: string; icon: string }[] = [
  { id: 'full',   name: 'حركة كاملة',   desc: 'انتقالات أوضح مع بقاء المحتوى مقروءاً', icon: '∿' },
  { id: 'subtle', name: 'حركة هادئة', desc: 'انتقالات قصيرة دون تشتيت', icon: '⌁' },
  { id: 'none',   name: 'ثابت',   desc: 'من دون انتقالات أو حركات إضافية', icon: '—' },
];

const BRAND_PRESETS: BrandPreset[] = [
  { id: 'atelier', name: 'Atelier', description: 'حرفي، دافئ، ومساحة مفتوحة', colors: ['#4F6A55', '#F2F0E8', '#C6A47A'], settings: { brandColor: '#4F6A55', bgStyle: 'zellige' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'solid' as CardSurface, cardRadius: 'modern' as CardRadius, timelineDesign: 'editorial' as TimelineDesign, timelineLineStyle: 'curved', fontFamily: 'cairo' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
  { id: 'botanical', name: 'Botanical', description: 'عضوي وهادئ مع إضاءة ناعمة', colors: ['#416B52', '#E9EFE7', '#D6AC91'], settings: { brandColor: '#416B52', bgStyle: 'blobs' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'glass' as CardSurface, cardRadius: 'pebble' as CardRadius, timelineDesign: 'journey' as TimelineDesign, timelineLineStyle: 'wave', fontFamily: 'tajawal' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: true } },
  { id: 'editorial', name: 'Editorial', description: 'طباعة واضحة وفواصل دقيقة', colors: ['#27342D', '#F7F7F2', '#B9BDB2'], settings: { brandColor: '#27342D', bgStyle: 'minimal' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'borderless' as CardSurface, cardRadius: 'sleek' as CardRadius, timelineDesign: 'editorial' as TimelineDesign, timelineLineStyle: 'straight', fontFamily: 'ibm-plex' as FontFamily, animationLevel: 'none' as AnimationLevel, backgroundBlur: false, animateBackgroundBlobs: false } },
  { id: 'obsidian', name: 'Obsidian', description: 'داكن، تقني، وتباين واضح', colors: ['#B4D4C0', '#202722', '#647D70'], settings: { brandColor: '#B4D4C0', bgStyle: 'midnight' as BackgroundStyle, themeMode: 'dark' as ThemeMode, cardSurface: 'elevated' as CardSurface, cardRadius: 'modern' as CardRadius, timelineDesign: 'rail' as TimelineDesign, timelineLineStyle: 'dashed', fontFamily: 'readex' as FontFamily, animationLevel: 'subtle' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
  { id: 'playful', name: 'Playful', description: 'ألوان مرحة وتفاصيل أكثر ليونة', colors: ['#9A536B', '#F4EAF0', '#E3B27F'], settings: { brandColor: '#9A536B', bgStyle: 'porcelain' as BackgroundStyle, themeMode: 'light' as ThemeMode, cardSurface: 'tinted' as CardSurface, cardRadius: 'pebble' as CardRadius, timelineDesign: 'milestones' as TimelineDesign, timelineLineStyle: 'wave', fontFamily: 'cairo' as FontFamily, animationLevel: 'full' as AnimationLevel, backgroundBlur: true, animateBackgroundBlobs: false } },
];

const BRAND_CATEGORY_DEFAULT_KEYS: Record<BrandingCategory, (keyof EditableBrandSettings)[]> = {
  identity: ['brandColor', 'brandSubtitle'],
  appearance: ['bgStyle', 'themeMode', 'backgroundBlur', 'cardSurface', 'cardRadius', 'fontFamily', 'animationLevel', 'animateBackgroundBlobs'],
  layout: ['timelineDesign', 'timelineLineStyle'],
  customer: ['showWhatsAppButton', 'supportPhone', 'announcementText', 'showCarrierBadge', 'showProductSection', 'showOrderNumberBadge'],
};





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
                    <div>
                      <strong>انتهت فترة اشتراكك في باقة تاجر تراك</strong>
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
              brandPresets={BRAND_PRESETS}
              activeBrandPresetId={activeBrandPresetId}
              onApplyBrandPreset={applyBrandPreset}
              brandingCategories={BRANDING_CATEGORIES}
              brandingCategory={brandingCategory}
              onSetBrandingCategory={setBrandingCategory}
              brandHistoryTick={brandHistoryTick}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undoBrandChange}
              onRedo={redoBrandChange}
              onResetCategory={resetBrandCategory}
              brandPalettes={BRAND_PALETTES}
              getBrandContrastRatio={getBrandContrastRatio}
              getReadableBrandAccent={getReadableBrandAccent}
              getReadableOnBrand={getReadableOnBrand}
              backgroundStyles={BACKGROUND_STYLES}
              timelineDesigns={TIMELINE_DESIGNS}
              timelineLineStyles={TIMELINE_LINE_STYLES}
              cardSurfaces={CARD_SURFACES}
              cardRadii={CARD_RADII}
              fontFamilies={FONT_FAMILIES}
              animationLevels={ANIMATION_LEVELS}
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

          {isCustomMappingModalOpen && typeof document !== 'undefined' && createPortal((
            <div
              className="dz-mapping-modal-backdrop"
              data-dashboard-back-dismiss="custom-status-modal"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeCustomMappingModal();
              }}
            >
              <section
                className="dz-mapping-modal-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dz-create-mapping-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="dz-mapping-modal-head">
                  <div>
                    <span className="dz-mapping-modal-kicker">مطابقة الحالات والترجمة</span>
                    <h2 id="dz-create-mapping-title">إضافة مسمى مخصص</h2>
                    <p>اربط كود الحالة الأصلي بالعبارة التي ستظهر للعميل في صفحة التتبع.</p>
                  </div>
                  <button
                    type="button"
                    className="dz-mapping-modal-close"
                    aria-label="إغلاق النافذة"
                    onClick={() => closeCustomMappingModal()}
                  >
                    <Icons.X />
                  </button>
                </header>
                <MappingForm merchantId={merchantId} />
              </section>
            </div>
          ), document.body)}

          <OrderDetailsSidePanel
            ref={orderDetailsPanelRef}
            orders={orders}
            getStatusLabel={getStatusLabel}
            getStatusBadgeStyle={getStatusBadgeStyle}
            getWhatsAppRecoveryUrl={getWhatsAppRecoveryUrl}
            formatOrderDate={formatOrderDate}
            isAttentionStatus={isAttentionStatus}
          />

          {isAddOrderPanelMounted && typeof document !== 'undefined' && createPortal((
            <div
              className="dz-order-detail-backdrop dz-order-side-backdrop"
              data-dashboard-back-dismiss="add-order-panel"
              data-open={isAddOrderPanelOpen ? 'true' : 'false'}
              aria-hidden={!isAddOrderPanelOpen}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && isAddOrderPanelOpen && !isCreatingOrder) {
                  closeAddOrder();
                }
              }}
            >
              <aside
                className="dz-order-detail-panel dz-order-side-panel dz-order-side-panel--add"
                data-open={isAddOrderPanelOpen ? 'true' : 'false'}
                role="dialog"
                aria-modal="true"
                aria-hidden={!isAddOrderPanelOpen}
                aria-labelledby="add-order-title"
                onMouseDown={(event) => event.stopPropagation()}
                onTransitionEnd={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    event.propertyName === 'flex-basis' &&
                    !isAddOrderModalOpen &&
                    !isAddOrderPanelOpen
                  ) {
                    finishAddOrderPanelClose();
                  }
                }}
              >
                <div className="dz-order-side-panel-inner dz-order-side-panel-inner--add">
                <div className="dz-order-detail-head">
                  <div>
                    <span className="dz-order-detail-kicker">شحنة تجريبية / يدوية</span>
                    <h2 id="add-order-title" style={{ fontSize: '22px', fontWeight: 850 }}>إضافة طلب جديد</h2>
                    <p>أدخل بيانات الطلب لتجربة التتبع المباشر وإرسال رابط تيليجرام</p>
                  </div>
                  <button
                    type="button"
                    className="dz-order-detail-close"
                    aria-label="إغلاق النافذة"
                    onClick={() => closeAddOrder()}
                    disabled={isCreatingOrder}
                  >
                    <Icons.X />
                  </button>
                </div>

                {newOrderSuccess ? (
                  <div style={{ padding: '24px 0', textAlign: 'center' }}>
                    <div style={{
                      width: '58px',
                      height: '58px',
                      borderRadius: '50%',
                      background: '#dcfce7',
                      color: '#16a34a',
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: 'var(--ink-main)' }}>
                      تم تسجيل الطلب بنجاح!
                    </h3>
                    <p style={{ margin: '0 0 18px', fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                      رقم الطلب: <strong>{newOrderSuccess.externalOrderId}</strong><br />
                      {newOrderSuccess.telegramQueueCheckFailed ? 'تم تسجيل الطلب، لكن تعذّر التحقق من حالة جدولة رابط التتبع.' : newOrderSuccess.telegramTrackingQueued ? 'تم إدراج رابط التتبع في طابور تيليجرام، وسيحاول حساب تاجر تراك إرساله إلى الحساب المرتبط برقم العميل.' : newOrderSuccess.telegramTrackingEnabled ? 'الخدمة مفعّلة، لكن لم تُدرج مهمة الإرسال. تحقق من تطبيق تحديث قاعدة البيانات وسجلات العامل.' : 'خدمة إرسال روابط التتبع عبر تيليجرام متوقفة حالياً. فعّلها من إعدادات المتجر لإرسال روابط الطلبات الجديدة.'}
                    </p>

                    <div style={{
                      background: 'var(--bg-base, #f4f5f1)',
                      padding: '14px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      marginBottom: '18px',
                      border: '1px solid var(--border-soft)',
                      textAlign: 'left',
                      direction: 'ltr',
                    }}>
                      {`${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${newOrderSuccess.trackingUuid}`}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <a
                        href={`/t/${newOrderSuccess.trackingUuid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="dz-btn"
                        style={{ flex: 1, textDecoration: 'none', fontSize: '14px', padding: '12px 18px', minHeight: '44px' }}
                      >
                        <Icons.ExternalLink /> فتح صفحة التتبع
                      </a>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        style={{ flex: 1, fontSize: '14px', padding: '12px 18px', minHeight: '44px' }}
                        onClick={() => {
                          const url = `${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${newOrderSuccess.trackingUuid}`;
                          copyToClipboard(url, 'new-tracking-link');
                          showToast('تم نسخ رابط التتبع');
                        }}
                      >
                        <Icons.Copy /> نسخ الرابط
                      </button>
                    </div>

                    <button
                      type="button"
                      className="dz-btn dz-btn-outline"
                      style={{ width: '100%', marginTop: '14px', fontSize: '14px', padding: '12px', minHeight: '44px' }}
                      onClick={closeAddOrderSuccess}                    >
                      إغلاق
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateOrder} style={{ padding: '18px 0' }}>
                    {addOrderError && (
                      <div style={{
                        background: '#fee2e2',
                        color: '#991b1b',
                        padding: '12px 16px',
                        borderRadius: '9px',
                        fontSize: '13.5px',
                        fontWeight: 600,
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <Icons.AlertTriangle /> {addOrderError}
                      </div>
                    )}


                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                          رقم الطلب (Order ID) *
                        </label>
                        <input
                          type="text"
                          name="external_order_id"
                          defaultValue={`ORD-${Math.floor(100000 + Math.random() * 900000)}`}
                          required
                          className="dz-input-field"
                          placeholder="ORD-123456"
                          dir="ltr"
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            اسم العميل *
                          </label>
                          <input
                            type="text"
                            name="customer_name"
                            placeholder="محمد عبد الله"
                            required
                            className="dz-input-field"
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            رقم الهاتف *
                          </label>
                          <input
                            type="text"
                            name="customer_phone"
                            placeholder="0550123456"
                            required
                            className="dz-input-field"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            شركة التوصيل لهذه الشحنة
                          </label>
                          <BrandedSelect
                            name="carrier_name"
                            ariaLabel="شركة الشحن"
                            defaultValue="Yalidine Express"
                            variant="field"
                            options={[
                              { value: 'Yalidine Express', label: 'Yalidine Express (ياليدين)' },
                              { value: 'ZR Express', label: 'ZR Express' },
                              { value: 'Maystro Delivery', label: 'Maystro Delivery' },
                              { value: 'EcoTrack', label: 'EcoTrack' },
                              { value: 'Zimou Express', label: 'Zimou Express' },
                              { value: 'Elogistia', label: 'Elogistia' },
                              { value: 'Procolis', label: 'Procolis' },
                              { value: 'E-com Delivery v2', label: 'E-com Delivery v2' },
                              { value: 'توصيل خاص', label: 'توصيل خاص (متجرنا)' },
                            ]}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            رقم التتبع لشركة الشحن
                          </label>
                          <input
                            type="text"
                            name="carrier_tracking_number"
                            placeholder="اختياري (YAL-1234)"
                            className="dz-input-field"
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            اسم المنتج (اختياري)
                          </label>
                          <input
                            type="text"
                            name="product_name"
                            placeholder="ساعة ذكية Ultra"
                            className="dz-input-field"
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 750, marginBottom: '7px', color: 'var(--ink-main)' }}>
                            حالة الشحنة الأولية
                          </label>
                          <BrandedSelect
                            name="status_raw"
                            ariaLabel="حالة الشحنة الأولية"
                            defaultValue="order_placed"
                            variant="field"
                            options={[
                              { value: 'order_placed', label: 'تم استلام الطلب (order_placed)' },
                              { value: 'processing', label: 'قيد التجهيز (processing)' },
                              { value: 'shipped', label: 'خرج للشحن والتوصيل (shipped)' },
                            ]}
                          />
                        </div>
                      </div>

                      <div style={{
                        borderInlineStart: '3px solid #52775a',
                        background: '#f3f6f0',
                        padding: '12px 14px',
                        marginTop: '6px',
                      }}>
                        <strong style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--ink-main)' }}>
                          الإرسال عبر حساب Telegram الخاص بتاجر تراك
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--ink-muted)', lineHeight: 1.8, display: 'block', marginTop: '4px' }}>
                          عند تفعيل «روابط التتبع» من إعدادات المتجر، يُدرج رابط هذا الطلب للإرسال تلقائياً إلى حساب Telegram الذي يمكن العثور عليه برقم الهاتف. لا يحتاج العميل إلى بدء محادثة مع بوت؛ ويعتمد نجاح العثور على الحساب على صحة الرقم وإعدادات خصوصية Telegram.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                      <button
                        type="submit"
                        className="dz-btn"
                        disabled={isCreatingOrder}
                        style={{ flex: 2, background: '#263b30', fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        {isCreatingOrder ? 'جاري إنشاء الطلب...' : 'إنشاء الطلب وجدولة التتبع'}
                      </button>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        onClick={() => closeAddOrder()}
                        disabled={isCreatingOrder}
                        style={{ flex: 1, fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
              </aside>
            </div>
          ), document.body)}

        </main>

        {/* TOAST — inside dz-admin-root so CSS vars (--ink-main, --ease-spring) resolve correctly */}
        <div className={`dz-toast ${toastMsg ? 'show' : ''}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      </div>

    </>
  );
}