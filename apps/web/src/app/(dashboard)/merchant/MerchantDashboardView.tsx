'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback, useTransition, useDeferredValue, memo } from 'react';
import { createPortal } from 'react-dom';
import { StatusSelector } from './StatusSelector';
import SiteHeader from '../../SiteHeader';
import { MappingForm } from './MappingForm';
import { ImageUploadField } from './ImageUploadField';
import { EcoTrackConnectionPanel } from './EcoTrackConnectionPanel';
import { ZRExpressConnectionPanel } from './ZRExpressConnectionPanel';
import { MaystroConnectionPanel } from './MaystroConnectionPanel';
import { ZimouConnectionPanel } from './ZimouConnectionPanel';
import { ElogistiaConnectionPanel } from './ElogistiaConnectionPanel';
import { ElogistiaDispatchPanel } from './ElogistiaDispatchPanel';
import { EcomV2ConnectionPanel } from './EcomV2ConnectionPanel';
import { EcomV2DispatchPanel } from './EcomV2DispatchPanel';
import { YalidineConnectionPanel } from './YalidineConnectionPanel';
import { toCachedImageUrl } from '../../../lib/imageProxy';
import { useGlobalDialog } from '../../../components/GlobalDialogProvider';
import {
  saveBrandSettings,
  applyPresetMappings,
  deleteStatusMapping,
  submitPaymentProof,
  toggleTelegramTracking,
  logout,
  createManualOrder,
  fetchProductUrlMetadata,
  getMerchantUpsells,
  saveMerchantUpsell,
  deleteMerchantUpsell,
  toggleMerchantUpsell,
  reorderMerchantUpsell,
  toggleConfirmationTelegram,
  getMerchantIntegrationApiKey,
  deleteMerchantOrders,
} from './actions';
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

export interface SubscriptionInfo {
  tier: string;
  status: string;
  limit: number;
  used: number;
  expiresAt: string | null;
}

export interface PaymentRecord {
  id: string;
  plan_tier: string;
  amount_dzd: number;
  payment_method: string;
  payment_proof_url: string | null;
  transaction_ref: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type TimelineLineStyle = 'straight' | 'dashed' | 'dotted' | 'curved' | 'wave' | 'none';
type EditableBrandSettings = BrandSettings & { showWhatsAppButton?: boolean; animateBackgroundBlobs?: boolean; backgroundBlur?: boolean; timelineLineStyle?: TimelineLineStyle };

const DEFAULT_EDITABLE_BRAND_SETTINGS: EditableBrandSettings = {
  ...DEFAULT_BRAND_SETTINGS,
  brandColor: '#27342D',
  brandSubtitle: '',
  showWhatsAppButton: true,
  animateBackgroundBlobs: false,
  backgroundBlur: true,
  timelineLineStyle: 'straight',
};

type BrandPreset = {
  id: string;
  name: string;
  description: string;
  colors: [string, string, string];
  settings: Partial<EditableBrandSettings>;
};

export interface MerchantUpsellItem {
  id: string;
  merchant_id: string;
  title: string;
  image_url: string;
  product_url: string;
  price: string | null;
  currency?: string | null;
  is_active: boolean;
  display_order?: number;
  clicks_count?: number;
  created_at: string;
  updated_at?: string;
}

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
type BrandingCategory = typeof BRANDING_CATEGORIES[number]['id'];

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

const Icons = {
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  Dashboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="11" rx="1"/><rect x="3" y="13" width="7" height="8" rx="1"/></svg>,
  Chart: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 5-7"/></svg>,
  Box: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
  AlertTriangle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
  Palette: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>,
  Plug: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5"></path><path d="M9 8V2"></path><path d="M15 8V2"></path><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"></path></svg>,
  Tag: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>,
  CreditCard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 2.94-.08-.02a1.7 1.7 0 0 0-1.8.55l-.05.07h-3.4l-.04-.08a1.7 1.7 0 0 0-1.55-1.04 1.7 1.7 0 0 0-.45.06l-.08.02-2.94-1.7.02-.08a1.7 1.7 0 0 0-.55-1.8l-.07-.05v-3.4l.08-.04a1.7 1.7 0 0 0 .98-2l-.02-.08 1.7-2.94.08.02a1.7 1.7 0 0 0 1.8-.55l.05-.07h3.4l.04.08a1.7 1.7 0 0 0 2 .98l.08-.02 2.94 1.7-.02.08a1.7 1.7 0 0 0 .55 1.8l.07.05v3.4l-.08.04a1.7 1.7 0 0 0-.56.78Z"/></svg>,
  Store: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 4.6 4h14.8L21 9.5"/><path d="M3 9.5c0 1.7 1.2 2.8 2.7 2.8s2.7-1.1 2.7-2.8c0 1.7 1.2 2.8 2.6 2.8s2.7-1.1 2.7-2.8c0 1.7 1.2 2.8 2.7 2.8S19 11.2 19 9.5"/><path d="M5.2 12.2V20h13.6v-7.8M9 20v-5h6v5"/></svg>,
  Clipboard: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 9h6M9 13h6M9 17h4"/></svg>,
  Refresh: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/></svg>,
  ArrowLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  Search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
  Code: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  Truck: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/></svg>,
  Edit: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>,
  HelpCircle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,
  Copy: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>,
  MessageCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>,
  WhatsApp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 7.5 7.5v.5Z"/><path d="M8.8 8.2c.2-.4.4-.4.7-.4h.4c.2 0 .3.1.4.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.4 0 .6.4.7 1.1 1.4 1.8 1.8.2.1.4.1.6-.1l.7-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.3.6-.1.5-.4 1-1 1.2-.5.2-1.2.2-1.8 0-1-.3-2.3-1.2-3.2-2.2-.8-.9-1.5-2.1-1.5-2.9 0-.6.1-1.2.3-1.9Z"/></svg>,
  ExternalLink: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>,
  LogOut: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  Eye: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>,
  Terminal: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>,
  BookOpen: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Zap: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Shield: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Key: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>,
  Send: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>,
  ShoppingBag: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>,
  Sparkles: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>,
  Link: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  ArrowUp: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>,
  ArrowDown: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  MousePointer: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>,
};

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
}: Props) {
  const { alert: alertDialog, confirm: confirmDialog } = useGlobalDialog();
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

  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'alerts' | 'analytics' | 'branding' | 'upsells' | 'integrations' | 'mappings' | 'settings'>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [storeNameDraft, setStoreNameDraft] = useState(storeName);
  const [savedStoreName, setSavedStoreName] = useState(storeName);
  const displayStoreName = storeNameDraft.trim() || storeName;
  const hasUnsavedStoreNameChanges = storeNameDraft.trim() !== savedStoreName;
  useEffect(() => { setMobileMenuOpen(false); }, [activeTab]);
  useEffect(() => {
    setStoreNameDraft(storeName);
    setSavedStoreName(storeName);
  }, [storeName]);

  // Mobile Back Button Handler: when mobile menu drawer is open, back button closes it instead of leaving dashboard
  useEffect(() => {
    if (!mobileMenuOpen) return;

    window.history.pushState({ tajerMobileMenu: true }, '');

    const handlePopState = () => {
      setMobileMenuOpen(false);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.tajerMobileMenu) {
        window.history.back();
      }
    };
  }, [mobileMenuOpen]);

  // Upsell Features State
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
  const [brandingCategory, setBrandingCategory] = useState<BrandingCategory>('identity');
  const [hasUnsavedBrandChanges, setHasUnsavedBrandChanges] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'transit' | 'stopdesk' | 'alerts' | 'delivered' | 'returned'>('all');
  const [carrierFilter, setCarrierFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'risk'>('newest');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeletingOrders, setIsDeletingOrders] = useState(false);
  const [integrationPlatform, setIntegrationPlatform] = useState<'shopify' | 'website' | 'manual' | null>(null);
  const [trackingSource, setTrackingSource] = useState<'carrier' | 'manual' | 'unsure' | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<'yalidine' | 'ecotrack' | 'zrexpress' | 'procolis' | 'maystro' | 'zimou' | 'elogistia' | 'other' | null>(null);
  const [integrationStep, setIntegrationStep] = useState<1 | 2 | 3>(1);
  const [integrationChoicesHydratedFor, setIntegrationChoicesHydratedFor] = useState<string | null>(null);
  // Persist integration choices locally per merchant, without sending preferences to the server.
  useEffect(() => {
    setIntegrationChoicesHydratedFor(null);
    setIntegrationPlatform(null);
    setTrackingSource(null);
    setSelectedCarrier(null);
    setIntegrationStep(1);

    try {
      const raw = window.localStorage.getItem(`tajertrack:integration-setup:v1:${merchantId}`);
      if (raw) {
        const saved = JSON.parse(raw) as {
          platform?: string;
          trackingSource?: string;
          carrier?: string | null;
        };

        const validPlatforms = ['shopify', 'website', 'manual'];
        const validSources = ['carrier', 'manual', 'unsure'];
        const validCarriers = ['yalidine', 'ecotrack', 'zrexpress', 'procolis', 'maystro', 'zimou', 'elogistia', 'other'];
        const restoredPlatform = validPlatforms.includes(saved.platform || '')
          ? saved.platform as 'shopify' | 'website' | 'manual'
          : null;
        const restoredSource = validSources.includes(saved.trackingSource || '')
          ? saved.trackingSource as 'carrier' | 'manual' | 'unsure'
          : null;
        const restoredCarrier = validCarriers.includes(saved.carrier || '')
          ? saved.carrier as 'yalidine' | 'ecotrack' | 'zrexpress' | 'procolis' | 'maystro' | 'zimou' | 'elogistia' | 'other'
          : null;

        setIntegrationPlatform(restoredPlatform);
        setTrackingSource(restoredSource);
        setSelectedCarrier(restoredCarrier);
        setIntegrationStep(
          restoredPlatform && restoredSource && (restoredSource !== 'carrier' || restoredCarrier)
            ? 3
            : restoredPlatform
              ? 2
              : 1
        );
      }
    } catch (error) {
      console.warn('[Integrations]: Could not restore saved browser choices:', error);
    }

    setIntegrationChoicesHydratedFor(merchantId);
  }, [merchantId]);

  useEffect(() => {
    if (!merchantId || integrationChoicesHydratedFor !== merchantId) return;

    const storageKey = `tajertrack:integration-setup:v1:${merchantId}`;
    if (!integrationPlatform && !trackingSource && !selectedCarrier) {
      try { window.localStorage.removeItem(storageKey); } catch { /* Browser storage may be disabled. */ }
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({
        version: 1,
        platform: integrationPlatform,
        trackingSource,
        carrier: selectedCarrier,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn('[Integrations]: Could not save browser choices:', error);
    }
  }, [merchantId, integrationChoicesHydratedFor, integrationPlatform, trackingSource, selectedCarrier]);

  const [telegramEnabled, setTelegramEnabled] = useState(telegramTrackingLinkEnabled);
  const [isSavingTelegram, startTransitionTelegram] = useTransition();
  const [confirmationEnabled, setConfirmationEnabled] = useState(confirmationTelegramEnabled);
  const [isSavingConfirmation, startTransitionConfirmation] = useTransition();
  const [sdkCodeTab, setSdkCodeTab] = useState<'html' | 'react' | 'node' | 'curl' | 'agent'>('agent');
  const [packageManager, setPackageManager] = useState<'npm' | 'pnpm' | 'yarn' | 'bun'>('npm');
  const [apiKeyRevealed, setApiKeyRevealed] = useState(false);
  const [integrationApiKey, setIntegrationApiKey] = useState('');
  const [integrationApiKeyLoading, setIntegrationApiKeyLoading] = useState(false);
  const shouldLoadIntegrationApiKey =
    activeTab === 'integrations' &&
    integrationChoicesHydratedFor === merchantId &&
    (integrationPlatform === 'website' || integrationPlatform === 'shopify' ||
      (trackingSource === 'carrier' && Boolean(selectedCarrier) && selectedCarrier !== 'other' && selectedCarrier !== 'ecotrack' && selectedCarrier !== 'zrexpress' && selectedCarrier !== 'zimou' && selectedCarrier !== 'elogistia' && selectedCarrier !== 'ecom_v2' && selectedCarrier !== 'yalidine'));

  useEffect(() => {
    let cancelled = false;
    if (!shouldLoadIntegrationApiKey) {
      setIntegrationApiKey('');
      setIntegrationApiKeyLoading(false);
      setApiKeyRevealed(false);
      return;
    }
    setIntegrationApiKeyLoading(true);
    getMerchantIntegrationApiKey()
      .then((result) => {
        if (cancelled) return;
        setIntegrationApiKey(result.apiKey || '');
        if (result.error) console.error('[Integrations] Credential lookup:', result.error);
      })
      .catch((error) => {
        if (cancelled) return;
        setIntegrationApiKey('');
        console.error('[Integrations] Credential lookup failed:', error);
      })
      .finally(() => {
        if (!cancelled) setIntegrationApiKeyLoading(false);
      });
    return () => { cancelled = true; };
  }, [shouldLoadIntegrationApiKey, merchantId]);
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [addOrderError, setAddOrderError] = useState<string | null>(null);
  const [newOrderSuccess, setNewOrderSuccess] = useState<{ trackingUuid: string; externalOrderId: string } | null>(null);

  // Full Brand Customization State
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
    const defaults = { ...DEFAULT_EDITABLE_BRAND_SETTINGS } as EditableBrandSettings;
    const current = brandConfigRef.current;
    const next = { ...current } as EditableBrandSettings;
    for (const key of BRAND_CATEGORY_DEFAULT_KEYS[brandingCategory]) {
      (next as unknown as Record<string, unknown>)[key] = (defaults as unknown as Record<string, unknown>)[key];
    }
    commitBrandConfig(next);
  }, [brandingCategory, commitBrandConfig]);

  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [editDisplayStatus, setEditDisplayStatus] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [selectedUpgradeTier, setSelectedUpgradeTier] = useState<'basic' | 'growth' | 'scale'>(() => subscription.tier === 'scale' ? 'scale' : subscription.tier === 'growth' ? 'growth' : 'basic');
  const [showAdvanceRenewal, setShowAdvanceRenewal] = useState(false);

  const [visibleOrders, setVisibleOrders] = useState(20);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const toggleOrderSelection = (orderId: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      if (checked) {
        return current.includes(orderId) ? current : [...current, orderId];
      }
      return current.filter((id) => id !== orderId);
    });
  };

  const toggleFilteredOrderSelection = (checked: boolean) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      for (const order of filteredOrders) {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      }
      return Array.from(next);
    });
  };

  const handleDeleteOrders = async (orderIds: string[]) => {
    const ids = Array.from(new Set(orderIds));
    if (ids.length === 0 || isDeletingOrders) return;

    const confirmationMessage =
      ids.length === 1
        ? 'سيتم حذف الطلب وسجل تحديثاته وروابط الإشعارات المرتبطة به نهائياً. لا يمكن التراجع عن هذا الإجراء.'
        : `سيتم حذف ${ids.length} طلباً وسجلات تحديثاتها وروابط إشعاراتها نهائياً. لا يمكن التراجع عن هذا الإجراء.`;

    const confirmed = await confirmDialog({
      title: ids.length === 1 ? 'حذف الطلب' : 'حذف الطلبات المحددة',
      message: confirmationMessage,
      confirmLabel: ids.length === 1 ? 'حذف الطلب' : `حذف ${ids.length} طلباً`,
      cancelLabel: 'الاحتفاظ بها',
      tone: 'danger',
    });

    if (!confirmed) return;

    setIsDeletingOrders(true);
    try {
      const result = await deleteMerchantOrders(ids);

      if ('error' in result) {
        await alertDialog({
          title: 'تعذر حذف الطلبات',
          message: result.error,
          confirmLabel: 'حسناً',
          tone: 'warning',
        });
        return;
      }

      setSelectedOrderIds((current) => current.filter((id) => !ids.includes(id)));
      setSelectedOrderId((current) => (current && ids.includes(current) ? null : current));
      showToast(`تم حذف ${result.deletedCount} طلب بنجاح.`);
    } catch (error) {
      console.error('[MerchantDashboard]: Order deletion failed:', error);
      await alertDialog({
        title: 'حدث خطأ أثناء الحذف',
        message: 'تعذر حذف الطلبات حالياً. يرجى المحاولة مجدداً.',
        confirmLabel: 'حسناً',
        tone: 'warning',
      });
    } finally {
      setIsDeletingOrders(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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
          trackingUuid: res.trackingUuid!,
          externalOrderId: res.externalOrderId!,
        });
        if (res.confirmationQueueError) {
          showToast('تم إنشاء الطلب، لكن تعذرت جدولة رسالة تأكيد تيليجرام. راجع سجلات الخادم.');
        } else if (res.confirmationQueued) {
          showToast('تم إنشاء الطلب وجدولة رابط التتبع ورسالة تأكيد الطلب عبر تيليجرام 🚀');
        } else {
          showToast('تم إنشاء الطلب بنجاح! تم جدولة التتبع في طابور تيليجرام 🚀');
        }
      }
    } catch (err: any) {
      setAddOrderError(err?.message || 'حدث خطأ غير متوقع أثناء إضافة الطلب');
    } finally {
      setIsCreatingOrder(false);
    }
  };

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

  const handleSaveInlineEdit = async (sourceStatus: string) => {
    if (!editDisplayStatus.trim()) return;
    setIsSavingEdit(true);

    const fd = new FormData();
    fd.append('merchant_id', merchantId);
    fd.append('source_status', sourceStatus);
    fd.append('display_status', editDisplayStatus);

    const { saveStatusMapping } = await import('./actions');
    await saveStatusMapping(fd);

    setEditingMappingId(null);
    setIsSavingEdit(false);
    showToast('تم حفظ المطابقة بنجاح');
  };

  const directWebhookUrl = `${siteUrl}/api/webhooks`;
  const shopifyUrl = `${siteUrl}/api/webhooks/shopify?key=${integrationApiKey}`;
  const ecotrackUrl = `${siteUrl}/api/webhooks/ecotrack?key=${integrationApiKey}`;
  const procolisUrl = `${siteUrl}/api/webhooks/procolis?key=${integrationApiKey}`;
  const odooUrl = `${siteUrl}/api/webhooks/odoo?key=${integrationApiKey}`;

  const carrierConnections = [
    {
      id: 'yalidine' as const,
      name: 'Yalidine Express',
      symbol: 'Y',
      url: '',
      method: 'Webhook موقّع + تحديثات تلقائية',
      hint: 'أنشئ Webhook من لوحة Yalidine / Guepex، ثم أضف رابط الاستقبال ومفتاح التوقيع هنا. يتحقق تاجر تراك من التوقيع ويعالج الأحداث في الخلفية.',
      caveat: 'اختر parcel_created وparcel_status_updated. يجب حفظ مفتاح التوقيع وتشغيل الاختبار ثم تفعيل Webhook من لوحة الشركة.',
      supportQuestion: 'أحتاج إلى تفعيل Webhooks الخارجية في حساب Yalidine مع صلاحية إنشاء Webhook ومشاهدة مفتاح التوقيع.'
    },
    {
      id: 'ecotrack' as const,
      name: 'EcoTrack Network',
      symbol: 'E',
      subname: 'DHD, Conexlog, Noest, World Express...',
      url: ecotrackUrl,
      method: 'POST (JSON)',
      hint: 'يدعم جميع شركات الشحن التي تعمل بنظام EcoTrack في الجزائر. ضع الرابط في خانة Webhook URL في لوحة حساب الشركة.',
      caveat: 'يدعم جميع أحداث شبكة إيكوتراك (cree, ramasse, transit, en_livraison, stopdesk, livre, retour).',
      supportQuestion: 'مرحباً، أود ربط حسابي لديكم مع تاجر تراك عبر Webhooks لتحديث مسار التوصيل للزبائن تلقائياً. هل يمكنكم تفعيل إرسال Webhook خارجي عند تغيير حالة الشحنات؟'
    },
    {
      id: 'zrexpress' as const,
      name: 'ZR Express',
      symbol: 'ZR',
      url: '',
      method: 'API + Svix Webhooks (تلقائي)',
      hint: 'اربط حساب ZR Express مباشرة عبر API Key وTenant ID. ينشئ تاجر تراك Webhook تلقائياً ويتحقق من توقيع Svix دون إعداد رابط يدوي.',
      caveat: 'هذا اتصال ZR Express API المباشر؛ لا تستخدم رابط Procolis القديم لهذا المسار.',
      supportQuestion: 'أستخدم واجهة ZR Express API المباشرة وأحتاج إلى تفعيل صلاحيات Webhooks (Svix) لحسابي.'
    },
    {
      id: 'procolis' as const,
      name: 'Procolis',
      symbol: 'P',
      url: procolisUrl,
      header: `Token ${integrationApiKey}`,
      method: 'POST (JSON)',
      hint: 'من لوحة Procolis، تحقّق من إعدادات Webhooks أو إشعارات تغيّر حالة الشحنة، ثم أضف رابط الاستقبال الخاص بمتجرك.',
      caveat: 'يجب تفعيل إرسال الأحداث من حساب Procolis نفسه ثم اختبار وصول حدث حقيقي.',
      supportQuestion: 'مرحباً، أستخدم Procolis وأريد ربط تحديثات الشحن مع تاجر تراك. هل يدعم حسابي Webhooks خارجية عند تغيّر حالة الشحنة، وأين أضيف رابط الاستقبال؟'
    },
    {
      id: 'maystro' as const,
      name: 'Maystro Delivery',
      symbol: 'M',
      url: '',
      method: 'Store API Token + Webhooks',
      hint: 'أدخل Store API Token من حساب Maystro، ثم انسخ رابط الاستقبال الذي ينشئه تاجر تراك وأضفه في إعدادات Webhooks لدى Maystro.',
      caveat: 'اختر OrderFieldUpdated وOrderDelivered. يقرأ تاجر تراك بيانات الطلب وسجل حالاته من API بعد وصول الإشعار.',
      supportQuestion: 'مرحباً، أحتاج إلى Store API Token لحساب Maystro Delivery لتفعيل قراءة الطلبات وسجل التوصيل عبر API.'
    },
    {
      id: 'zimou' as const,
      name: 'Zimou Express',
      symbol: 'Z',
      url: '',
      method: 'API Token + مزامنة دورية',
      hint: 'اربط حساب Zimou عبر API Token. تُقرأ حالات أرقام التتبع المسجلة في طلبات متجرك دورياً من API مباشرة.',
      caveat: 'لا نفترض وجود Webhooks أصلية غير موثقة. لا يستورد هذا المسار طروداً جديدة تلقائياً؛ يجب أن يكون رقم تتبع Zimou موجوداً في طلب تاجر تراك.',
      supportQuestion: 'أحتاج إلى API Token لحساب Zimou Express لاستخدام واجهة API للقراءة وتتبع الطرود.'
    },
    {
      id: 'elogistia' as const,
      name: 'Elogistia',
      symbol: 'EL',
      url: '',
      method: 'API Key + إنشاء شحنات + مزامنة دورية',
      hint: 'اربط حساب Elogistia عبر API Key. يمكنك إنشاء بوليصة من تفاصيل الطلب، ثم يقرأ تاجر تراك سجل التتبع ويحدّث الحالة تلقائياً.',
      caveat: 'لا يوجد إعداد Webhook في هذا المسار. تتم مزامنة الشحنات التي أنشأها تاجر تراك فقط؛ لا يتم استيراد طرود أُنشئت خارج المنصة تلقائياً.',
      supportQuestion: 'أحتاج إلى API Key لحساب Elogistia وتفعيل صلاحيات إنشاء الشحنات وقراءة سجل التتبع.'
    },
    {
      id: 'ecom_v2' as const,
      name: 'E-com Delivery v2',
      symbol: 'EC',
      url: '',
      method: 'KEY + Token + إنشاء شحنات + مزامنة دورية',
      hint: 'اربط حساب E-com Delivery v2 باستخدام KEY وToken من صفحة Développement. أنشئ الشحنة من تفاصيل الطلب، ثم تُزامن حالاتها تلقائياً.',
      caveat: 'هذا هو API v2 على ecom-dz.com/api_v2، وليس واجهة E-COM القديمة v1. الشحنات المنشأة تبقى «En Préparation» حتى تؤكدها من حساب E-com. المزامنة تخص الشحنات المرتبطة بطلبات تاجر تراك.',
      supportQuestion: 'أحتاج إلى KEY وToken لواجهة E-com Delivery API v2 من صفحة Développement مع صلاحيات إنشاء الشحنات وقراءة التتبع.'
    },
  ];

  const activeCarrierConnection = carrierConnections.find((carrier) => carrier.id === selectedCarrier) ?? null;

  const installCommands = {
    npm: 'npm install dz-tracking-sdk',
    pnpm: 'pnpm add dz-tracking-sdk',
    yarn: 'yarn add dz-tracking-sdk',
    bun: 'bun add dz-tracking-sdk',
  };

  const sdkInstallCommand = installCommands[packageManager];
  const sdkAgentPrompt = [
    `Read ${siteUrl}/skill.md completely before changing code.`,
    'Run npm view dz-tracking-sdk version, install with the project package manager, then inspect the installed package.json and .d.ts exports before writing SDK code.',
    'The repository source declares SDK 2.0.0. If the installed npm version does not expose dz-tracking-sdk/core and the signatures in the skill, do not invent them; use the documented POST /api/webhooks REST contract instead or a verified local build.',
    'Preserve the store order-creation flow. Register tracking only after the store has successfully saved its order.',
    'Keep the merchant key in a private server-only variable named DZ_TRACKER_API_KEY. Never include a key in this prompt, NEXT_PUBLIC_*, browser source, generated snippets, or logs.',
    'If the key is needed for local testing, ask me to configure it in .env.local; do not ask me to paste it into this AI chat.',
    'Use the real stable external order ID. Do not generate a new ID for every retry.',
    'Only return or redirect to a tracking URL when the API confirms success and a real tracking UUID.',
    'Inspect the chosen courier adapter and provider requirements instead of guessing the webhook payload.',
    `TajerTrack base URL: ${siteUrl}`,
  ].join('\\n');

  const htmlCodeSnippet = `<!-- Markup only: initialize the SDK from your own bundled browser entry first. -->
<!-- For a native checkout that navigates immediately, register tracking server-side after saving the order instead. -->
<form data-dz-checkout data-dz-redirect="none">
  <input type="text" name="order_id" value="YOUR_EXISTING_STORE_ORDER_ID" required />
  <input type="text" name="name" placeholder="الاسم الكامل" />
  <input type="tel" name="phone" placeholder="05 / 06 / 07..." />
  <input type="hidden" name="product_name" value="اسم المنتج" />
  <button type="submit">تأكيد الطلب</button>
</form>`;

  const reactCodeSnippet = `'use client';

import { useTracker } from 'dz-tracking-sdk';

// WARNING: a key passed to a browser hook is visible to every site visitor.
// Prefer server-side registration with DZ_TRACKER_API_KEY for production.
export function TrackExistingOrder({ orderId, name, phone }) {
  const { track, isLoading, error } = useTracker({
    apiKey: process.env.NEXT_PUBLIC_DZ_TRACKER_KEY,
    baseUrl: process.env.NEXT_PUBLIC_DZ_TRACKER_BASE_URL,
  });

  async function register() {
    const result = await track({
      orderId, // The real ID from the order already saved in your store.
      name,
      phone,
      status: 'order_placed',
    });
    if (result.success && result.trackingUrl) {
      window.location.assign(result.trackingUrl);
      return;
    }
    console.error(result.error || error?.message || 'Tracking registration failed.');
  }

  return <button type="button" disabled={isLoading} onClick={register}>فتح صفحة التتبع</button>;
}`;

  const nodeCodeSnippet = `'use server';

import { DZTrackerClient } from 'dz-tracking-sdk/core';

const tracker = new DZTrackerClient({
  apiKey: process.env.DZ_TRACKER_API_KEY!,
  baseUrl: process.env.DZ_TRACKER_BASE_URL || '${siteUrl}',
});

// Invoke after the store has persisted the order. Do not create the store order here.
export async function registerSavedOrder(savedOrder) {
  const result = await tracker.trackOrder({
    orderId: String(savedOrder.id),
    name: savedOrder.customerName || undefined,
    phone: savedOrder.customerPhone || undefined,
    productName: savedOrder.productName || undefined,
    status: 'order_placed',
  });
  if (!result.success || !result.trackingUrl) {
    return { trackingCreated: false, trackingUrl: null, error: result.error };
  }
  return { trackingCreated: true, trackingUrl: result.trackingUrl, whatsappUrl: result.whatsappUrl };
}`;

  const curlSnippet = `curl -X POST "${siteUrl}/api/webhooks" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $DZ_TRACKER_API_KEY" \\
  -d '{
    "order_id": "YOUR_EXISTING_STORE_ORDER_ID",
    "customer_name": "Customer Name",
    "customer_phone": "0555123456",
    "product_name": "Product title",
    "status": "order_placed"
  }'`;
  const deliveredCount = orders.filter((o) => o.current_status === 'delivered').length;
  const inTransitCount = orders.filter((o) =>
    ['in_transit', 'out_for_delivery', 'dispatched', 'shipped'].includes(o.current_status)
  ).length;
  const stopdeskCount = orders.filter((o) => o.current_status === 'ready_for_pickup').length;
  const returnedCount = orders.filter((o) =>
    ['returned', 'cancelled'].includes(o.current_status)
  ).length;

  const alertOrders = useMemo(() => {
    return orders.filter((o) => isAttentionStatus(o.current_status));
  }, [orders]);

  const alertCount = alertOrders.length;
  const successRate = orders.length > 0 ? Math.round((deliveredCount / orders.length) * 100) : 0;
  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [orders]
  );
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );
  useEffect(() => {
    if (!selectedOrderId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedOrderId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedOrderId]);
  const lastSevenDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);
      const count = orders.filter((order) => {
        const createdAt = new Date(order.created_at).getTime();
        return createdAt >= day.getTime() && createdAt < nextDay.getTime();
      }).length;
      return { label: day.toLocaleDateString('ar-DZ', { weekday: 'short' }), dateLabel: formatOrderDate(day.toISOString()), count };
    });
  }, [orders]);
  const ordersCreatedLastSevenDays = lastSevenDays.reduce((sum, day) => sum + day.count, 0);
  const maxDailyOrders = Math.max(1, ...lastSevenDays.map((day) => day.count));
  const classifiedStatusCount = inTransitCount + stopdeskCount + deliveredCount + alertCount + returnedCount;
  const statusBreakdown = [
    { key: 'moving', label: 'في الطريق', count: inTransitCount, color: '#638797' },
    { key: 'pickup', label: 'جاهزة للاستلام', count: stopdeskCount, color: '#ac8a4a' },
    { key: 'delivered', label: 'تم التسليم', count: deliveredCount, color: '#5d8968' },
    { key: 'attention', label: 'تحتاج إلى متابعة', count: alertCount, color: '#b95a4a' },
    { key: 'returned', label: 'مرتجعة أو ملغاة', count: returnedCount, color: '#877b85' },
    { key: 'other', label: 'حالات أخرى أو قيد المعالجة', count: Math.max(0, orders.length - classifiedStatusCount), color: '#9a9c91' },
  ];

  const uniqueCarriers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.carrier_name) set.add(o.carrier_name);
    });
    return Array.from(set);
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((order) => {
      const matchSearch =
        (order.external_order_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.customer_phone || '').includes(searchTerm) ||
        (order.carrier_tracking_number || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (carrierFilter !== 'all' && order.carrier_name !== carrierFilter) {
        return false;
      }

      if (activeTab === 'alerts' || statusFilter === 'alerts') {
        return isAttentionStatus(order.current_status);
      }
      if (statusFilter === 'delivered') return order.current_status === 'delivered';
      if (statusFilter === 'returned') return ['returned', 'cancelled'].includes(order.current_status);
      if (statusFilter === 'stopdesk') return order.current_status === 'ready_for_pickup';
      if (statusFilter === 'transit') {
        return ['in_transit', 'out_for_delivery', 'dispatched', 'shipped'].includes(order.current_status);
      }
      return true;
    });

    if (sortBy === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'risk') {
      list.sort((a, b) => {
        const aRisk = isAttentionStatus(a.current_status) ? 1 : 0;
        const bRisk = isAttentionStatus(b.current_status) ? 1 : 0;
        return bRisk - aRisk;
      });
    }

    return list;
  }, [orders, searchTerm, statusFilter, carrierFilter, sortBy, activeTab]);

  const allFilteredOrdersSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((order) => selectedOrderIds.includes(order.id));

  useEffect(() => {
    setVisibleOrders(20);
  }, [searchTerm, statusFilter, carrierFilter, sortBy, activeTab]);

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
      processing: 'قيد التجهيز',
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

  const openShipmentList = (filter: 'all' | 'transit' | 'stopdesk' | 'alerts' | 'delivered' | 'returned', query = '') => {
    setSearchTerm(query);
    setStatusFilter(filter);
    setActiveTab(filter === 'alerts' ? 'alerts' : 'orders');
    setVisibleOrders(20);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Cairo:wght@300;400;500;600;700;800&family=Tajawal:wght@300;400;500;700;800&family=Noto+Kufi+Arabic:wght@300;400;500;600;700;800&display=swap');

        .dz-admin-root {
          --bg-base: #F4F4F5;
          --surface: #FFFFFF;
          --surface-hover: #FAFAFA;
          --ink-main: #09090B;
          --ink-muted: #52525B;
          --ink-light: #A1A1AA;
          --border-soft: rgba(9, 9, 11, 0.06);
          --border-strong: rgba(9, 9, 11, 0.15);
          
          --shadow-sm: 0 2px 8px rgba(9, 9, 11, 0.04);
          --shadow-md: 0 12px 32px rgba(9, 9, 11, 0.06);
          
          --radius-sm: 8px;
          --radius-md: 16px;
          --radius-lg: 24px;
          
          --ease-spring: cubic-bezier(0.25, 1, 0.4, 1);
          --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background-color: var(--bg-base);
          color: var(--ink-main);
          font-family: 'Readex Pro', system-ui, -apple-system, sans-serif;
          direction: rtl;
        }

        .dz-admin-root input,
        .dz-admin-root button,
        .dz-admin-root select,
        .dz-admin-root textarea {
          font-family: inherit;
        }

        .dz-aurora {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          background: var(--bg-base);
        }

        .dz-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          will-change: transform;
          opacity: 0.6;
          mix-blend-mode: multiply;
        }

        .dz-blob1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background: radial-gradient(circle, #D4D4D8 0%, transparent 70%); animation: drift 20s infinite ease-in-out alternate; }
        .dz-blob2 { bottom: -20%; right: -10%; width: 60vw; height: 60vw; background: radial-gradient(circle, #E4E4E7 0%, transparent 70%); animation: drift 25s infinite ease-in-out alternate-reverse; }

        @keyframes drift {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(3%, 5%) scale(1.02); }
          100% { transform: translate(0, 0) scale(1); }
        }

        .dz-grain {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          opacity: 0.05;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        /* SCROLLBARS */
        .dz-scrollable {
          overflow-y: auto;
          scrollbar-gutter: stable;
        }
        .dz-scrollable::-webkit-scrollbar { width: 6px; height: 6px; }
        .dz-scrollable::-webkit-scrollbar-track { background: transparent; }
        .dz-scrollable::-webkit-scrollbar-thumb { background: var(--ink-light); border-radius: 10px; }
        .dz-scrollable::-webkit-scrollbar-thumb:hover { background: var(--ink-muted); }

        /* SIDEBAR */
        .dz-sidebar {
          width: 280px;
          height: 100vh;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-left: 1px solid var(--border-soft);
          display: flex;
          flex-direction: column;
          padding: 32px 24px;
          position: relative;
          z-index: 20;
          flex-shrink: 0;
        }

        .dz-brand {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 48px;
        }

        .dz-avatar-box {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-sm);
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          box-shadow: 0 8px 16px rgba(9, 9, 11, 0.1);
        }

        .dz-brand-text { display: flex; flex-direction: column; }
        .dz-brand-title { font-weight: 800; font-size: 16px; color: var(--ink-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .dz-brand-badge { font-size: 11px; font-weight: 600; color: var(--ink-muted); text-transform: uppercase; margin-top: 2px; }

        .dz-nav { display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .dz-nav-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; border-radius: var(--radius-md);
          color: var(--ink-muted); font-weight: 600; font-size: 14px;
          cursor: pointer; border: none; background: transparent;
          transition: all 0.2s var(--ease-out); text-align: right;
        }
        .dz-nav-item:hover { color: var(--ink-main); background: rgba(9, 9, 11, 0.03); }
        .dz-nav-item.active { background: var(--ink-main); color: #fff; box-shadow: 0 8px 20px rgba(9, 9, 11, 0.15); }
        
        .dz-nav-icon { display: flex; align-items: center; margin-left: 12px; }

        .dz-alert-badge {
          background: #ef4444; color: #fff; font-size: 11px; font-weight: 800;
          padding: 2px 8px; border-radius: 99px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
        }
        .dz-nav-item.active .dz-alert-badge { background: #fff; color: #ef4444; }

        .dz-sidebar-footer {
          margin-top: auto; padding-top: 24px; border-top: 1px solid var(--border-soft);
          display: flex; flex-direction: column; gap: 12px;
        }
        
        .dz-api-mini {
          font-size: 11px; color: var(--ink-muted); background: var(--bg-base);
          padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft);
          display: flex; justify-content: space-between; align-items: center;
        }

        /* MAIN CONTENT */
        .dz-main {
          flex: 1; position: relative; z-index: 10; height: 100vh; padding: 40px 48px;
        }

        .dz-header {
          display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0;
        }
        .dz-header-titles { flex: 1 1 auto; min-width: 0; }
        .dz-header h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 8px 0; color: var(--ink-main); }
        .dz-header p { color: var(--ink-muted); font-size: 14px; margin: 0; max-width: 600px; line-height: 1.6; }
        .dz-header-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

        .dz-search-box {
          display: flex; align-items: center; background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px); border: 1px solid var(--border-strong);
          padding: 10px 16px; border-radius: 99px; width: 320px;
          transition: all 0.3s var(--ease-out); box-shadow: var(--shadow-sm);
        }
        .dz-search-box:focus-within { background: var(--surface); border-color: var(--ink-main); box-shadow: 0 0 0 4px rgba(9, 9, 11, 0.05); }
        .dz-search-box input { border: none; background: transparent; outline: none; width: 100%; font-size: 13px; color: var(--ink-main); margin-right: 12px; }

        /* KPI BAR */
        .dz-stats-bar {
          display: flex; background: var(--surface); border: 1px solid var(--border-soft);
          border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 24px; box-shadow: var(--shadow-sm);
        }
        .dz-stat-item { flex: 1; padding: 24px; display: flex; flex-direction: column; position: relative; }
        .dz-stat-item:not(:last-child)::after { content: ''; position: absolute; left: 0; top: 24px; bottom: 24px; width: 1px; background: var(--border-soft); }
        .dz-stat-item.alert { background: #fef2f2; }
        
        .dz-stat-title { font-size: 13px; color: var(--ink-muted); font-weight: 600; margin-bottom: 8px; }
        .dz-stat-value { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: var(--ink-main); margin-bottom: 4px; }
        .dz-stat-sub { font-size: 12px; color: var(--ink-light); font-weight: 500; }

        /* URGENT ALERT BANNER */
        .dz-alert-banner {
          background: #fef2f2; border: 1px solid #fca5a5; border-radius: var(--radius-md);
          padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 24px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.1);
        }

        /* TABLES */
        .dz-table-wrap {
          background: var(--surface); border-radius: var(--radius-lg); border: 1px solid var(--border-soft);
          box-shadow: var(--shadow-md); overflow: hidden; display: flex; flex-direction: column;
        }
        .dz-table-header { padding: 20px 24px; border-bottom: 1px solid var(--border-soft); display: flex; justify-content: space-between; align-items: center; background: var(--surface); }
        .dz-table-scroll { max-height: 55vh; overflow-y: auto; position: relative; }
        
        table { width: 100%; border-collapse: collapse; text-align: right; }
        th { background: var(--surface-hover); color: var(--ink-muted); font-weight: 600; font-size: 13px; padding: 14px 24px; border-bottom: 1px solid var(--border-strong); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(10px); }
        td { padding: 16px 24px; font-size: 13px; color: var(--ink-main); border-bottom: 1px solid var(--border-soft); }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: var(--surface-hover); }
        tr.row-alert td { background: #fffcfc; }

        /* UI ELEMENTS */
        .dz-mono { font-family: ui-monospace, monospace; background: var(--bg-base); padding: 4px 8px; border-radius: 6px; font-size: 12px; color: var(--ink-muted); border: 1px solid var(--border-soft); }
        .dz-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
        .dz-pill-info { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .dz-pill-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .dz-pill-warning { background: #fefce8; color: #854d0e; border: 1px solid #fef08a; }
        .dz-pill-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .dz-pill-alert { background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; animation: pulseRed 2s infinite; }

        @keyframes pulseRed { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 50% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); } }

        .dz-btn {
          position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 20px; border-radius: 99px; background: var(--ink-main); color: #fff;
          font-weight: 600; font-size: 13px; border: none; cursor: pointer; overflow: hidden;
          box-shadow: 0 4px 12px rgba(9, 9, 11, 0.2); transition: all 0.2s var(--ease-spring);
        }
        .dz-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(9, 9, 11, 0.3); background: #000; }
        .dz-btn:active { transform: translateY(0); }
        .dz-btn-outline { background: transparent; color: var(--ink-main); border: 1px solid var(--border-strong); box-shadow: none; }
        .dz-btn-outline:hover { background: var(--bg-base); box-shadow: none; }
        
        .dz-btn-wa { background: #25D366; color: #fff; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); }
        .dz-btn-wa:hover { background: #128C7E; box-shadow: 0 8px 16px rgba(37, 211, 102, 0.4); }
        .dz-btn-wa-urgent { background: #ef4444; color: #fff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); animation: pulseRed 2s infinite; }
        .dz-btn-wa-urgent:hover { background: #dc2626; animation: none; }

        .dz-icon-btn { background: transparent; border: none; color: var(--ink-muted); cursor: pointer; padding: 4px; border-radius: 4px; transition: 0.2s; }
        .dz-icon-btn:hover { background: var(--border-soft); color: var(--ink-main); }

        /* Compact, consistent 2x2 order action grid */
        .dz-order-action-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-auto-rows: 40px;
          gap: 7px;
          width: 94px;
          margin-inline: auto;
          direction: rtl;
        }
        .dz-order-action-btn {
          width: 100%;
          min-width: 0;
          height: 40px;
          display: grid;
          place-items: center;
          padding: 0;
          border: 1px solid #dfe6df;
          border-radius: 11px;
          background: #fff;
          color: #405849;
          box-shadow: 0 2px 6px rgba(29, 47, 34, .055);
          text-decoration: none;
          cursor: pointer;
          transition: background .16s ease, border-color .16s ease, color .16s ease, transform .16s ease, box-shadow .16s ease;
        }
        .dz-order-action-btn svg { width: 17px; height: 17px; display: block; }
        .dz-order-action-btn:hover {
          background: #f3f7f2;
          border-color: #b8c8b8;
          color: #263f2d;
          box-shadow: 0 4px 10px rgba(29, 47, 34, .09);
          transform: translateY(-1px);
        }
        .dz-order-action-btn:active { transform: translateY(0); }
        .dz-order-action-btn:disabled {
          opacity: .55;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .dz-order-action-btn:focus-visible {
          outline: 3px solid rgba(67, 109, 75, .25);
          outline-offset: 2px;
        }
        .dz-order-action-btn.dz-order-action-whatsapp {
          color: #167b45;
          background: #f0faf3;
          border-color: #cce8d4;
        }
        .dz-order-action-btn.dz-order-action-whatsapp:hover {
          background: #e2f5e8;
          border-color: #a8d9b7;
        }
        .dz-order-action-btn.dz-order-action-whatsapp.is-urgent {
          color: #b42318;
          background: #fff3f2;
          border-color: #f4c5c1;
        }
        .dz-order-action-btn.dz-order-action-delete {
          color: #b42318;
          background: #fff7f6;
          border-color: #f1d2cf;
        }
        .dz-order-action-btn.dz-order-action-delete:hover {
          color: #fff;
          background: #b42318;
          border-color: #b42318;
        }
        .dz-order-action-btn.is-disabled {
          color: #a3aca5;
          background: #f7f8f6;
          border-color: #e8ece7;
          cursor: not-allowed;
          box-shadow: none;
        }


        /* FILTERS */
        .dz-filter-row { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
        .dz-filter-btn { padding: 8px 16px; border-radius: 99px; background: var(--surface); color: var(--ink-muted); font-size: 12px; font-weight: 600; border: 1px solid var(--border-soft); cursor: pointer; transition: 0.2s; box-shadow: var(--shadow-sm); }
        .dz-filter-btn:hover { background: var(--bg-base); color: var(--ink-main); }
        .dz-filter-btn.active { background: var(--ink-main); color: #fff; border-color: var(--ink-main); }

        /* BRANDING STUDIO — focused categories + persistent save */
        .dz-branding-workspace { padding-bottom: 120px; transform: none !important; animation: none !important; }
        .dz-branding-panel-head { margin: 0 0 18px; }
        .dz-branding-kicker { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: .12em; color: #6b7a6e; margin-bottom: 8px; }
        .dz-branding-panel-head h2 { margin: 0 0 7px; font-size: 20px; line-height: 1.45; font-weight: 750; letter-spacing: -.04em; color: var(--ink-main); }
        .dz-branding-panel-head p { margin: 0; max-width: 560px; color: var(--ink-muted); font-size: 11px; line-height: 1.8; }
        .dz-branding-categories { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 18px; }
        .dz-brand-category { min-width: 0; display: flex; align-items: center; gap: 10px; text-align: right; padding: 12px; background: #fffefa; border: 1px solid var(--border-soft); border-radius: 11px; color: var(--ink-main); cursor: pointer; transition: border-color .18s ease, background .18s ease; }
        .dz-brand-category:hover { background: #f8f8f4; border-color: var(--border-strong); }
        .dz-brand-category.active { background: #eef3ed; border-color: #8ca391; box-shadow: inset 0 0 0 1px #8ca391; }
        .dz-brand-category-number { width: 29px; height: 29px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 8px; background: #f0f1eb; color: #67746a; font-size: 9px; font-weight: 800; }
        .dz-brand-category.active .dz-brand-category-number { background: #294535; color: #fff; }
        .dz-brand-category-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .dz-brand-category-copy strong { font-size: 11px; font-weight: 750; line-height: 1.45; }
        .dz-brand-category-copy small { font-size: 9px; line-height: 1.55; color: var(--ink-muted); }
        .dz-brand-category-mark { margin-inline-start: auto; font-size: 15px; color: #819085; line-height: 1; }
        .dz-brand-savebar {
          position: fixed;
          z-index: 1000;
          bottom: 20px;
          right: calc(280px + 48px);
          left: calc(360px + 48px + 26px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 18px;
          border: 1px solid #dfe2d9;
          border-radius: 14px;
          background: rgba(255, 254, 250, 0.98);
          box-shadow: 0 10px 30px rgba(28, 40, 31, 0.12), 0 2px 8px rgba(28, 40, 31, 0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .dz-brand-savebar.is-dirty {
          border-color: #c18435;
          box-shadow: 0 12px 32px rgba(193, 132, 53, 0.16), 0 2px 8px rgba(28, 40, 31, 0.04);
        }
        .dz-brand-savebar-copy { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .dz-brand-savebar-copy > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .dz-brand-savebar-copy strong { font-size: 11px; font-weight: 800; line-height: 1.5; color: var(--ink-main); white-space: nowrap; }
        .dz-brand-savebar-copy span:not(.dz-brand-save-indicator) { font-size: 10px; color: var(--ink-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .dz-brand-save-indicator { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #7b927f; box-shadow: 0 0 0 4px rgba(123,146,127,.12); }
        .dz-brand-save-indicator.is-dirty { background: #c18435; box-shadow: 0 0 0 4px rgba(193, 132, 53, 0.13); }
        .dz-brand-save-button { flex: 0 0 auto; min-width: 145px; padding: 12px 18px; border-radius: 9px !important; box-shadow: none !important; font-size: 12px !important; }
        .dz-brand-save-button:disabled { opacity: .48; cursor: not-allowed; transform: none !important; }
        .dz-brand-save-button:hover:not(:disabled) { filter: brightness(.94); }
        .dz-customizer-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(330px, 360px);
          gap: 26px;
          align-items: start;
        }
        .dz-branding-preview-sticky { position: sticky; top: 12px; align-self: start; min-width: 0; z-index: 12; display: flex; justify-content: center; padding-top: 4px; }
        @media (max-width: 1100px) {
          .dz-customizer-grid { grid-template-columns: 1fr; }
          .dz-branding-preview-sticky { position: relative; top: auto; }
          .dz-phone-chassis { height: min(680px, calc(100svh - 120px)); min-height: 500px; }
          .dz-brand-savebar { left: 48px; right: calc(280px + 48px); bottom: 16px; }
        }
        @media (min-width: 1101px) and (max-height: 760px) {
          .dz-phone-chassis { height: min(680px, calc(100svh - 70px)); min-height: 480px; }
        }
        .dz-choice-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
          gap: 10px;
        }
        .dz-choice-card {
          padding: 12px 14px;
          border-radius: 12px;
          border: 1.5px solid var(--border-soft);
          background: var(--surface);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-start;
          transition: all 0.2s ease;
          text-align: right;
          position: relative;
        }
        .dz-choice-card:hover {
          border-color: var(--border-strong);
          background: var(--surface-hover);
        }
        .dz-choice-card.active {
          border-color: var(--ink-main);
          background: var(--surface-hover);
          box-shadow: 0 0 0 2px var(--ink-main);
        }
        .dz-choice-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--ink-main);
        }
        .dz-choice-desc {
          font-size: 10px;
          color: var(--ink-muted);
          line-height: 1.4;
        }
        .dz-choice-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--ink-light);
        }
        .dz-choice-card.active .dz-choice-indicator {
          background: var(--ink-main);
          box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.15);
        }

        .dz-phone-chassis {
          width: 342px;
          max-width: 100%;
          margin: 0 auto;
          border: 8px solid #18181B;
          border-radius: 34px;
          background: var(--bg-base);
          box-shadow: 0 19px 42px -24px rgba(0,0,0,.32), 0 0 0 1px rgba(255,255,255,.1);
          overflow: hidden;
          position: relative;
          height: min(78svh, 760px);
          min-height: 560px;
          display: flex;
          flex-direction: column;
          contain: layout paint;
        }
        .dz-phone-notch {
          height: 22px;
          background: #18181B;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 30;
        }
        .dz-phone-speaker {
          width: 50px;
          height: 4px;
          background: #3F3F46;
          border-radius: 99px;
        }
        .dz-phone-screen {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          position: relative;
          direction: rtl;
          padding: 10px 8px;
          scrollbar-width: thin;
          scrollbar-color: rgba(95,110,99,.25) transparent;
        }
        .dz-phone-scroll-viewport { position: absolute; z-index: 2; inset: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; scrollbar-width: thin; scrollbar-color: rgba(95,110,99,.25) transparent; }
        .dz-phone-scroll-viewport::-webkit-scrollbar { width: 3px; }
        .dz-phone-scroll-viewport::-webkit-scrollbar-track { background: transparent; }
        .dz-phone-scroll-viewport::-webkit-scrollbar-thumb { background: rgba(95,110,99,.22); border-radius: 99px; }
        /* Art and texture live on their own element so the blur is visible without blurring copy. */
        .dz-preview-background-blur { position: absolute; z-index: 0; inset: -8px; pointer-events: none; filter: none; opacity: 1; transition: filter .18s ease, opacity .18s ease; transform: translateZ(0); }
        .dz-phone-screen[data-background-blur="true"] .dz-preview-background-blur { filter: blur(3.4px); opacity: .98; }
        .dz-phone-screen[data-background-blur="false"] .dz-preview-background-blur { filter: none; opacity: 1; }
        .dz-phone-screen[data-background-style="blobs"][data-background-blur="true"]::before, .dz-phone-screen[data-background-style="blobs"][data-background-blur="true"]::after { filter: blur(36px); }

        .dz-background-swatch { width: 100%; height: 42px; border-radius: 8px; border: 1px solid rgba(30,42,34,.12); background-size: cover, 120px 120px, auto; background-position: center; overflow: hidden; }
        .dz-timeline-swatch { position: relative; height: 43px; width: 100%; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 8px; background: var(--bg-base); border: 1px solid var(--border-soft); overflow: hidden; }
        .dz-timeline-swatch > span { display: block; position: relative; z-index: 1; width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--timeline-swatch-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--timeline-swatch-brand) 12%, transparent); }
        .dz-timeline-swatch::before { content: ''; position: absolute; right: 19px; top: 0; bottom: 0; width: 1px; background: var(--border-strong); }
        .dz-timeline-swatch::after { content: ''; position: absolute; right: 30px; left: 10px; height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--timeline-swatch-brand) 16%, var(--border-soft)); }
        .dz-timeline-swatch--cards { flex-direction: column; align-items: stretch; justify-content: center; gap: 3px; padding: 6px; }
        .dz-timeline-swatch--cards::before, .dz-timeline-swatch--cards::after, .dz-timeline-swatch--dossier::before { display: none; }
        .dz-timeline-swatch--cards > span { width: 100%; height: 6px; border-radius: 3px; box-shadow: none; border: 1px solid var(--border-soft); background: var(--surface); }
        .dz-timeline-swatch--journey > span { border-radius: 2px; transform: rotate(45deg); }
        .dz-timeline-swatch--compact { gap: 5px; }
        .dz-timeline-swatch--compact::after { right: 52px; height: 1px; }
        .dz-timeline-swatch--rail::before { width: 3px; background: var(--timeline-swatch-brand); right: 18px; }
        .dz-timeline-swatch--rail > span { border-radius: 3px; width: 11px; height: 11px; }
        .dz-timeline-swatch--editorial { align-items: flex-start; flex-direction: column; justify-content: center; gap: 3px; padding-inline-start: 10px; }
        .dz-timeline-swatch--editorial::before { display: none; }
        .dz-timeline-swatch--editorial::after { right: 10px; top: 8px; left: 10px; height: 1px; }
        .dz-timeline-swatch--editorial > span { width: 75%; height: 3px; border-radius: 0; box-shadow: none; }
        .dz-timeline-swatch--milestones { flex-direction: column; align-items: stretch; justify-content: center; gap: 3px; padding: 6px 9px; }
        .dz-timeline-swatch--milestones::before, .dz-timeline-swatch--milestones::after { display: none; }
        .dz-timeline-swatch--milestones > span { width: 100%; height: 7px; border-radius: 2px; box-shadow: none; border-inline-start: 3px solid var(--timeline-swatch-brand); background: color-mix(in srgb, var(--timeline-swatch-brand) 11%, var(--surface)); }
        .dz-timeline-swatch--numbered > span { width: 12px; height: 12px; border-radius: 4px; color: white; box-shadow: none; }
        .dz-timeline-swatch--dossier { flex-direction: column; align-items: stretch; justify-content: center; gap: 5px; }
        .dz-timeline-swatch--dossier::after { height: 1px; right: 10px; }
        .dz-timeline-swatch--dossier > span { width: 70%; height: 2px; border-radius: 0; box-shadow: none; background: var(--border-strong); }
        .dz-connector-swatch { height: 43px; width: 100%; border: 1px solid var(--border-soft); border-radius: 8px; background: var(--bg-base); position: relative; display: flex; align-items: center; justify-content: space-around; overflow: hidden; }
        .dz-connector-swatch > span { position: relative; z-index: 2; width: 9px; height: 9px; border-radius: 50%; background: var(--timeline-swatch-brand, var(--ink-main)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--timeline-swatch-brand, var(--ink-main)) 12%, transparent); }
        .dz-connector-swatch > i { position: absolute; inset-block: 8px; right: 27%; width: 46%; }
        .dz-connector-swatch--straight > i { border-inline-start: 1.5px solid var(--timeline-swatch-brand, var(--ink-main)); right: 49%; width: 2%; }
        .dz-connector-swatch--dashed > i { border-inline-start: 2px dashed var(--timeline-swatch-brand, var(--ink-main)); right: 49%; width: 2%; }
        .dz-connector-swatch--dotted > i { right: calc(50% - 2px); width: 4px; background: radial-gradient(circle, var(--timeline-swatch-brand, var(--ink-main)) 1.3px, transparent 1.7px) center / 4px 6px repeat-y; }
        .dz-connector-swatch--curved > i { right: 28%; width: 44%; background: var(--timeline-swatch-brand, var(--ink-main)); -webkit-mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIzOCIgdmlld0JveD0iMCAwIDI0IDM4Ij48cGF0aCBkPSJNMTIgMCBDMiA5IDIgMjkgMTIgMzgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+"); mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIzOCIgdmlld0JveD0iMCAwIDI0IDM4Ij48cGF0aCBkPSJNMTIgMCBDMiA5IDIgMjkgMTIgMzgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+"); -webkit-mask-size: 100% 30px; mask-size: 100% 30px; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
        .dz-connector-swatch--wave > i { right: 28%; width: 44%; background: var(--timeline-swatch-brand, var(--ink-main)); -webkit-mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDQ4Ij48cGF0aCBkPSJNMTIgMCBDMyA2IDMgMTggMTIgMjQgUzIxIDQyIDEyIDQ4IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=="); mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDQ4Ij48cGF0aCBkPSJNMTIgMCBDMyA2IDMgMTggMTIgMjQgUzIxIDQyIDEyIDQ4IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=="); -webkit-mask-size: 100% 30px; mask-size: 100% 30px; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
        .dz-connector-swatch--none > i { display: none; }
        .dz-preview-event { display: flex; align-items: stretch; position: relative; gap: 9px; margin-bottom: 14px; min-width: 0; }
        .dz-preview-event-gutter { width: 22px; flex: 0 0 22px; display: flex; justify-content: center; position: relative; }
        .dz-preview-event-marker { width: 20px; height: 20px; flex: 0 0 20px; position: relative; z-index: 2; margin-top: 2px; display: grid; place-items: center; border: 1px solid var(--preview-border); border-radius: 50%; background: var(--preview-surface); color: var(--preview-brand); font-size: 9px; font-weight: 850; }
        .dz-preview-event-line { position: absolute; z-index: 0; right: 9px; top: 21px; bottom: -15px; width: 1px; background: var(--preview-border); }
        .dz-preview-event-content { min-width: 0; flex: 1; padding: 0 0 4px; border-radius: 11px; color: var(--preview-text); }
        .dz-preview-event-head { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }
        .dz-preview-event-head strong { display: block; color: var(--preview-text); font-size: 12.5px; font-weight: 850; line-height: 1.65; overflow-wrap: anywhere; }
        .dz-preview-event-head time { color: var(--preview-muted); font-size: 9px; line-height: 1.5; }
        .dz-preview-event-content p { margin: 5px 0 0; color: var(--preview-muted); font-size: 10.5px; line-height: 1.75; overflow-wrap: anywhere; }
        .dz-preview-event-kicker { color: var(--preview-brand); font-size: 8px; font-weight: 850; letter-spacing: .04em; margin-bottom: 3px; }
        .dz-preview-event--stepper .dz-preview-event-marker { border-radius: 50%; }
        .dz-preview-event--cards .dz-preview-event-gutter, .dz-preview-event--dossier .dz-preview-event-gutter, .dz-preview-event--compact .dz-preview-event-gutter, .dz-preview-event--milestones .dz-preview-event-gutter { display: none; }
        .dz-preview-event--cards .dz-preview-event-content { padding: 10px 11px 11px; border: 1px solid var(--preview-border); background: var(--preview-surface); box-shadow: 0 3px 10px rgba(15,25,18,.035); border-radius: 12px; }
        .dz-preview-event--cards .dz-preview-event-head { gap: 5px; }
        .dz-preview-event--journey .dz-preview-event-marker { width: 16px; height: 16px; flex-basis: 16px; border-radius: 4px; transform: rotate(45deg) scale(.9); background: var(--preview-tint); border: 1.5px solid var(--preview-brand); color: transparent; }
        .dz-preview-event--journey .dz-preview-event-line { width: 2px; right: 9px; background: repeating-linear-gradient(to bottom, color-mix(in srgb, var(--preview-brand) 50%, transparent) 0 4px, transparent 4px 7px); }
        .dz-preview-event--compact { gap: 0; margin-bottom: 0; }
        .dz-preview-event--compact .dz-preview-event-content { padding: 0 0 11px; margin-bottom: 10px; border-bottom: 1px dashed var(--preview-border); border-radius: 0; }
        .dz-preview-event--compact .dz-preview-event-head { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 8px; }
        .dz-preview-event--compact .dz-preview-event-head strong { font-size: 11.5px; }
        .dz-preview-event--compact .dz-preview-event-content p { margin-top: 3px; font-size: 9.5px; }
        .dz-preview-event--rail .dz-preview-event-gutter { width: 24px; flex-basis: 24px; }
        .dz-preview-event--rail .dz-preview-event-marker { width: 20px; height: 20px; flex-basis: 20px; color: #fff; border: 0; border-radius: 6px; background: var(--preview-brand); box-shadow: 0 0 0 4px color-mix(in srgb, var(--preview-brand) 12%, transparent); }
        .dz-preview-event--rail .dz-preview-event-line { width: 3px; right: 9px; background: color-mix(in srgb, var(--preview-brand) 54%, var(--preview-border)); border-radius: 99px; }
        .dz-preview-event--editorial { gap: 7px; margin-bottom: 16px; }
        .dz-preview-event--editorial .dz-preview-event-gutter { width: 9px; flex-basis: 9px; }
        .dz-preview-event--editorial .dz-preview-event-marker { width: 7px; height: 7px; flex-basis: 7px; margin-top: 6px; border: 0; border-radius: 1px; background: var(--preview-brand); color: transparent; }
        .dz-preview-event--editorial .dz-preview-event-line { right: 3px; top: 15px; }
        .dz-preview-event--editorial .dz-preview-event-content { border-top: 1px solid var(--preview-border); padding-top: 6px; border-radius: 0; }
        .dz-preview-event--editorial .dz-preview-event-head strong { font-size: 13.5px; }
        .dz-preview-event--milestones .dz-preview-event-content { border-inline-start: 4px solid var(--preview-brand); border-radius: 4px 12px 12px 4px; padding: 10px 11px; background: color-mix(in srgb, var(--preview-brand) 8%, var(--preview-surface)); }
        .dz-preview-event--numbered .dz-preview-event-marker { width: 23px; height: 23px; flex-basis: 23px; border: 0; border-radius: 7px; color: #fff; background: var(--preview-brand); font-size: 10px; }
        .dz-preview-event--numbered .dz-preview-event-line { right: 10px; width: 2px; background: color-mix(in srgb, var(--preview-brand) 34%, var(--preview-border)); }
        .dz-preview-event--dossier { gap: 0; margin-bottom: 0; }
        .dz-preview-event--dossier .dz-preview-event-content { display: grid; grid-template-columns: 1fr; border-bottom: 1px solid var(--preview-border); padding: 8px 0 11px; border-radius: 0; }
        .dz-preview-event--dossier .dz-preview-event-kicker { font-size: 8px; }
        .dz-preview-event--dossier .dz-preview-event-head { flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 8px; }
        .dz-preview-event--dossier .dz-preview-event-head strong { font-size: 12px; }
        .dz-preview-event--dossier .dz-preview-event-content p { margin-top: 4px; }
        .dz-preview-event.is-last { margin-bottom: 0; }
        .dz-preview-event.is-last .dz-preview-event-content { border-bottom: 0; }

        .dz-phone-screen[data-background-style="blobs"] { position: relative; isolation: isolate; }
        .dz-phone-screen[data-background-style="blobs"]::before, .dz-phone-screen[data-background-style="blobs"]::after { content: ''; position: absolute; pointer-events: none; z-index: 0; width: 220px; height: 240px; border-radius: 58% 42% 65% 35% / 47% 59% 41% 53%; filter: blur(26px); opacity: .40; }
        .dz-phone-screen[data-background-style="blobs"]::before { top: 8px; right: -92px; background: radial-gradient(ellipse at 38% 38%, rgba(104,157,126,.42), rgba(104,157,126,.04) 67%, transparent 73%); }
        .dz-phone-screen[data-background-style="blobs"]::after { bottom: 12%; left: -112px; background: radial-gradient(ellipse at 58% 45%, rgba(207,145,115,.38), rgba(207,145,115,.04) 66%, transparent 73%); }
        .dz-phone-screen[data-background-style="blobs"][data-animate-blobs="true"]::before { animation: dz-preview-blob-a 19s ease-in-out infinite alternate; }
        .dz-phone-screen[data-background-style="blobs"][data-animate-blobs="true"]::after { animation: dz-preview-blob-b 24s ease-in-out infinite alternate; }
        @keyframes dz-preview-blob-a { from { transform: translate3d(0,0,0) rotate(0deg) scale(.94); } to { transform: translate3d(-38px,26px,0) rotate(28deg) scale(1.12); } }
        @keyframes dz-preview-blob-b { from { transform: translate3d(0,0,0) rotate(0deg) scale(1.08); } to { transform: translate3d(44px,-22px,0) rotate(-24deg) scale(.92); } }
        .dz-preview-event-line--straight { background: var(--preview-border) !important; }
        .dz-preview-event-line--dashed { width: 1px !important; background: repeating-linear-gradient(to bottom, var(--preview-brand) 0 5px, transparent 5px 10px) !important; }
        .dz-preview-event-line--dotted { width: 3px !important; background: radial-gradient(circle, var(--preview-brand) 1px, transparent 1.35px) center top / 3px 7px repeat-y !important; }
        .dz-preview-event-line--curved { right: 0 !important; width: 22px !important; background: var(--preview-brand) !important; -webkit-mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIzOCIgdmlld0JveD0iMCAwIDI0IDM4Ij48cGF0aCBkPSJNMTIgMCBDMiA5IDIgMjkgMTIgMzgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+"); mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIzOCIgdmlld0JveD0iMCAwIDI0IDM4Ij48cGF0aCBkPSJNMTIgMCBDMiA5IDIgMjkgMTIgMzgiIGZpbGw9Im5vbmUiIHN0cm9rZT0iYmxhY2siIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+"); -webkit-mask-size: 22px 38px; mask-size: 22px 38px; -webkit-mask-repeat: repeat-y; mask-repeat: repeat-y; }
        .dz-preview-event-line--wave { right: 0 !important; width: 23px !important; background: var(--preview-brand) !important; -webkit-mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDQ4Ij48cGF0aCBkPSJNMTIgMCBDMyA2IDMgMTggMTIgMjQgUzIxIDQyIDEyIDQ4IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=="); mask-image: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDQ4Ij48cGF0aCBkPSJNMTIgMCBDMyA2IDMgMTggMTIgMjQgUzIxIDQyIDEyIDQ4IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjwvc3ZnPg=="); -webkit-mask-size: 23px 48px; mask-size: 23px 48px; -webkit-mask-repeat: repeat-y; mask-repeat: repeat-y; }
        .dz-preview-event-line--none { display: none !important; }
        @media (prefers-reduced-motion: reduce) { .dz-phone-screen[data-animate-blobs="true"]::before, .dz-phone-screen[data-animate-blobs="true"]::after { animation: none !important; } }
        /* Connector reset: every line is anchored to the marker instead of a masked repeated image. */
        .dz-preview-event-line { right: 10px; top: 12px; bottom: -26px; width: 2px; z-index: 0; display: block; overflow: visible; background: var(--preview-border); }
        .dz-preview-event-line--straight { right: 10px !important; width: 2px !important; background: var(--preview-border) !important; }
        .dz-preview-event-line--dashed { right: 10px !important; width: 2px !important; background: repeating-linear-gradient(to bottom, var(--preview-brand) 0 5px, transparent 5px 10px) !important; }
        .dz-preview-event-line--dotted { right: 9px !important; width: 3px !important; background: radial-gradient(circle, var(--preview-brand) 1.1px, transparent 1.45px) center top / 3px 7px repeat-y !important; }
        .dz-preview-event-line--curved, .dz-preview-event-line--wave { right: -1px !important; top: 12px; bottom: -26px; width: 24px !important; background: none !important; mask-image: none !important; -webkit-mask-image: none !important; }
        .dz-preview-event-line--curved svg, .dz-preview-event-line--wave svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .dz-preview-event-line--curved svg path, .dz-preview-event-line--wave svg path { fill: none; stroke: var(--preview-brand); stroke-width: 1.8; stroke-linecap: round; vector-effect: non-scaling-stroke; }
        .dz-preview-event--journey .dz-preview-event-line--straight, .dz-preview-event--journey .dz-preview-event-line--dashed, .dz-preview-event--journey .dz-preview-event-line--dotted { right: 9px !important; }
        .dz-preview-event--rail .dz-preview-event-line--straight { right: 9px !important; width: 3px !important; }
        .dz-preview-event--numbered .dz-preview-event-line--straight, .dz-preview-event--numbered .dz-preview-event-line--dashed, .dz-preview-event--numbered .dz-preview-event-line--dotted { right: 9px !important; }
        .dz-preview-event--editorial .dz-preview-event-gutter { width: 22px; flex-basis: 22px; }
        .dz-preview-event--editorial .dz-preview-event-line { right: 10px !important; top: 9.5px; }
        /* Exact per-layout anchors: all connector paths meet the visual center of both markers. */
        .dz-preview-event--stepper .dz-preview-event-line--straight, .dz-preview-event--stepper .dz-preview-event-line--dashed { right: 10px !important; top: 12px !important; }
        .dz-preview-event--stepper .dz-preview-event-line--dotted { right: 9.5px !important; top: 12px !important; }
        .dz-preview-event--stepper .dz-preview-event-line--curved, .dz-preview-event--stepper .dz-preview-event-line--wave { right: -1px !important; top: 12px !important; }
        .dz-preview-event--journey .dz-preview-event-line--straight, .dz-preview-event--journey .dz-preview-event-line--dashed { right: 10px !important; top: 10px !important; }
        .dz-preview-event--journey .dz-preview-event-line--dotted { right: 9.5px !important; top: 10px !important; }
        .dz-preview-event--journey .dz-preview-event-line--curved, .dz-preview-event--journey .dz-preview-event-line--wave { right: -1px !important; top: 10px !important; }
        .dz-preview-event--rail .dz-preview-event-line--straight { right: 10.5px !important; top: 12px !important; width: 3px !important; }
        .dz-preview-event--rail .dz-preview-event-line--dashed { right: 11px !important; top: 12px !important; }
        .dz-preview-event--rail .dz-preview-event-line--dotted { right: 10.5px !important; top: 12px !important; }
        .dz-preview-event--rail .dz-preview-event-line--curved, .dz-preview-event--rail .dz-preview-event-line--wave { right: 0 !important; top: 12px !important; }
        .dz-preview-event--editorial .dz-preview-event-line--straight, .dz-preview-event--editorial .dz-preview-event-line--dashed { right: 10px !important; top: 9.5px !important; }
        .dz-preview-event--editorial .dz-preview-event-line--dotted { right: 9.5px !important; top: 9.5px !important; }
        .dz-preview-event--editorial .dz-preview-event-line--curved, .dz-preview-event--editorial .dz-preview-event-line--wave { right: -1px !important; top: 9.5px !important; }
        .dz-preview-event--numbered .dz-preview-event-line--straight, .dz-preview-event--numbered .dz-preview-event-line--dashed { right: 10px !important; top: 13.5px !important; }
        .dz-preview-event--numbered .dz-preview-event-line--dotted { right: 9.5px !important; top: 13.5px !important; }
        .dz-preview-event--numbered .dz-preview-event-line--curved, .dz-preview-event--numbered .dz-preview-event-line--wave { right: -1px !important; top: 13.5px !important; }
        .dz-preview-event--cards .dz-preview-event-line, .dz-preview-event--compact .dz-preview-event-line, .dz-preview-event--milestones .dz-preview-event-line, .dz-preview-event--dossier .dz-preview-event-line { display: none !important; }

        .dz-preview-event--stepper .dz-preview-event-line { bottom: -26px !important; }
        .dz-preview-event--journey .dz-preview-event-line { bottom: -24px !important; }
        .dz-preview-event--rail .dz-preview-event-line { bottom: -26px !important; }
        .dz-preview-event--editorial .dz-preview-event-line { bottom: -25.5px !important; }
        .dz-preview-event--numbered .dz-preview-event-line { bottom: -27.5px !important; }
        /* Connector option swatches use the same vertical geometry as the live timeline. */
        .dz-connector-swatch { height: 55px; min-height: 55px; flex-direction: column; align-items: center; justify-content: space-between; padding: 5px 0; }
        .dz-connector-swatch > span { width: 9px; height: 9px; flex: 0 0 9px; }
        .dz-connector-swatch > i { position: absolute; inset-block: 12px; right: calc(50% - 1px); width: 2px; height: auto; background: var(--timeline-swatch-brand, var(--ink-main)); border: 0; }
        .dz-connector-swatch--straight > i { right: calc(50% - 1px); width: 2px; background: var(--timeline-swatch-brand, var(--ink-main)); }
        .dz-connector-swatch--dashed > i { right: calc(50% - 1px); width: 2px; background: repeating-linear-gradient(to bottom, var(--timeline-swatch-brand, var(--ink-main)) 0 5px, transparent 5px 9px); }
        .dz-connector-swatch--dotted > i { right: calc(50% - 1.5px); width: 3px; background: radial-gradient(circle, var(--timeline-swatch-brand, var(--ink-main)) 1.1px, transparent 1.45px) center top / 3px 7px repeat-y; }
        .dz-connector-swatch--curved > i, .dz-connector-swatch--wave > i { inset-block: 10px; right: calc(50% - 12px); width: 24px; background: none; mask-image: none !important; -webkit-mask-image: none !important; }
        .dz-connector-swatch--curved > i svg, .dz-connector-swatch--wave > i svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .dz-connector-swatch--curved > i svg path, .dz-connector-swatch--wave > i svg path { fill: none; stroke: var(--timeline-swatch-brand, var(--ink-main)); stroke-width: 1.8; stroke-linecap: round; vector-effect: non-scaling-stroke; }
        .dz-connector-swatch--none > i { display: none; }

        /* CARDS GRID */
        .dz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; margin-bottom: 32px; }
        .dz-card-box { background: var(--surface); border-radius: var(--radius-lg); padding: 24px; border: 1px solid var(--border-soft); box-shadow: var(--shadow-sm); }
        
        .dz-toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(24px); background: #09090B; color: #ffffff; padding: 14px 28px; border-radius: 99px; font-weight: 600; font-size: 14px; letter-spacing: 0.01em; box-shadow: 0 16px 40px rgba(9,9,11,0.28); z-index: 99999; opacity: 0; pointer-events: none; transition: opacity 0.35s cubic-bezier(0.25,1,0.4,1), transform 0.35s cubic-bezier(0.25,1,0.4,1); white-space: nowrap; max-width: 90vw; }
        .dz-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 1024px) {
          .dz-admin-root { flex-direction: column; }
          .dz-sidebar { width: 100%; height: auto; border-left: none; border-bottom: 1px solid var(--border-soft); padding: 16px 24px; }
          .dz-nav { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
          .dz-nav::-webkit-scrollbar { display: none; }
          .dz-nav-item { white-space: nowrap; }
          .dz-sidebar-footer { display: none; }
          .dz-main { padding: 24px; max-width: 100%; }
          .dz-stats-bar { flex-direction: column; }
          .dz-stat-item:not(:last-child)::after { left: 32px; right: 32px; bottom: 0; top: auto; height: 1px; width: auto; }
          .dz-header { flex-direction: column; align-items: flex-start; gap: 16px; }
        }

        /* Refined operational system: warm paper, crisp hierarchy, no ambient blob effects. */
        .dz-admin-root {
          --bg-base: #f2f1ed;
          --surface: #fffefa;
          --surface-hover: #f8f8f4;
          --ink-main: #202824;
          --ink-muted: #69736e;
          --ink-light: #8b948f;
          --border-soft: #e5e6df;
          --border-strong: #d5d9d1;
          --shadow-sm: 0 1px 3px rgba(27,39,32,.025);
          --shadow-md: 0 8px 24px rgba(27,39,32,.045);
          --shadow-hover: 0 16px 30px -22px rgba(27,39,32,.24);
          --radius-sm: 8px;
          --radius-md: 12px;
          --radius-lg: 17px;
          background: var(--bg-base);
          color: var(--ink-main);
          letter-spacing: -.01em;
        }
        .dz-admin-root .dz-aurora { display: none !important; }
        .dz-admin-root .dz-grain { display: none !important; }
        .dz-admin-root .dz-sidebar {
          background: #f8f8f4;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          border-left: 1px solid var(--border-soft);
          padding: 28px 20px 22px;
        }
        .dz-admin-root .dz-brand { gap: 12px; margin-bottom: 38px; }
        .dz-admin-root .dz-avatar-box { border-radius: 13px; box-shadow: none; }
        .dz-admin-root .dz-brand-title { font-size: 15px; letter-spacing: -.035em; }
        .dz-admin-root .dz-brand-badge { margin-top: 4px; font-size: 10px; letter-spacing: .04em; }
        .dz-admin-root .dz-nav { gap: 4px; }
        .dz-admin-root .dz-nav-item {
          padding: 11px 13px; border: 1px solid transparent; border-radius: 10px;
          font-size: 12px; font-weight: 600; transition: background .18s ease, color .18s ease, border-color .18s ease;
        }
        .dz-admin-root .dz-nav-item:hover { transform: none; background: #eeefe9; }
        .dz-admin-root .dz-nav-item.active {
          background: #263b30; border-color: #263b30; color: #fff; box-shadow: none;
        }
        .dz-admin-root .dz-nav-item.active:hover { background: #1d3027; }
        .dz-admin-root .dz-nav-icon { margin-left: 10px; opacity: .86; }
        .dz-admin-root .dz-sidebar-footer { padding-top: 17px; }
        .dz-admin-root .dz-api-mini { border-radius: 9px; background: #f0f1eb; }
        .dz-admin-root .dz-main { padding: 34px clamp(22px, 3vw, 48px) 52px; }
        .dz-admin-root .dz-header { align-items: flex-end; gap: 24px; margin-bottom: 0; }
        .dz-admin-root .dz-header h1 { font-size: clamp(23px, 2.4vw, 31px); line-height: 1.35; font-weight: 700; letter-spacing: -.055em; }
        .dz-admin-root .dz-header p { margin-top: 7px; font-size: 12px; line-height: 1.8; color: var(--ink-muted); }
        .dz-admin-root .dz-search-box { border-radius: 10px; border-color: var(--border-soft); box-shadow: none; background: #fffefa; }
        .dz-admin-root .dz-search-box:focus-within { border-color: #93a095; box-shadow: 0 0 0 3px rgba(53,88,70,.08); }
        .dz-admin-root .dz-stats-bar { border: 1px solid var(--border-soft); border-radius: 15px; background: #fffefa; box-shadow: none; margin-bottom: 24px; }
        .dz-admin-root .dz-stat-item { padding: 19px 22px; }
        .dz-admin-root .dz-stat-item:not(:last-child)::after { background: var(--border-soft); }
        .dz-admin-root .dz-stat-title { font-size: 10px; font-weight: 600; }
        .dz-admin-root .dz-stat-value { font-size: 26px; font-weight: 700; letter-spacing: -.05em; }
        .dz-admin-root .dz-stat-sub { font-size: 10px; }
        .dz-admin-root .dz-table-wrap { border-radius: 15px; border-color: var(--border-soft); box-shadow: none; background: #fffefa; }
        .dz-admin-root .dz-table-header { padding: 17px 21px; border-bottom: 1px solid var(--border-soft); }
        .dz-admin-root .dz-table-header h3 { font-size: 14px; letter-spacing: -.025em; }
        .dz-admin-root .dz-table-scroll th { background: #f6f6f1; font-size: 10px; letter-spacing: .015em; padding: 12px 17px; border-bottom-color: var(--border-soft); backdrop-filter: none; }
        .dz-admin-root .dz-table-scroll td { padding: 14px 17px; font-size: 11px; border-bottom-color: #edeee8; }
        .dz-admin-root .dz-table-scroll tr:hover td { background: #f9f9f6; }
        .dz-admin-root .dz-mono { border-radius: 6px; font-size: 10px; background: #f1f2ec; border-color: var(--border-soft); }
        .dz-admin-root .dz-pill { border-radius: 6px; padding: 4px 8px; font-size: 10px; }
        .dz-admin-root .dz-btn { border-radius: 10px; box-shadow: none; font-size: 11px; font-weight: 700; transition: background .18s ease, transform .18s ease; }
        .dz-admin-root .dz-btn::before { display: none !important; animation: none !important; }
        .dz-admin-root .dz-btn:hover { transform: translateY(-1px); box-shadow: none; background: #1d3027; }
        .dz-admin-root .dz-btn-outline { background: transparent; color: var(--ink-main); border-color: var(--border-strong); }
        .dz-admin-root .dz-btn-outline:hover { background: #eeefe9; color: var(--ink-main); }
        .dz-admin-root .dz-btn-wa { background: #246a4d; color: #fff; }
        .dz-admin-root .dz-btn-wa:hover { background: #1c583f; }
        .dz-admin-root .dz-filter-btn { border-radius: 8px; box-shadow: none; }
        .dz-admin-root .dz-filter-btn.active { background: #263b30; border-color: #263b30; box-shadow: none; }
        .dz-admin-root .dz-card-box, .dz-admin-root .formContainer {
          padding: 22px; border-radius: 16px; border-color: var(--border-soft); box-shadow: none; background: #fffefa;
        }
        .dz-admin-root .input { border-radius: 9px; background: #f7f7f2; border: 1px solid var(--border-soft); padding: 12px 14px; font-size: 12px; }
        .dz-admin-root .input:focus { background: #fffefa; border-color: #839687; box-shadow: 0 0 0 3px rgba(53,88,70,.08); }
        .dz-admin-root .formLabel { font-size: 11px; margin-bottom: 7px; }
        .dz-admin-root .dz-choice-grid { gap: 9px; }
        .dz-admin-root .dz-choice-card {
          min-height: 104px; padding: 13px; border: 1px solid var(--border-soft); border-radius: 11px;
          background: #fffefa; box-shadow: none; gap: 7px; transition: border-color .18s ease, background .18s ease, transform .18s ease;
        }
        .dz-admin-root .dz-choice-card:hover { border-color: #aeb9ae; background: #f9f9f5; transform: translateY(-1px); }
        .dz-admin-root .dz-choice-card.active { border-color: #355846; background: #f0f4ef; box-shadow: inset 0 0 0 1px #355846; }
        .dz-admin-root .dz-choice-title { font-size: 11px; line-height: 1.5; }
        .dz-admin-root .dz-choice-desc { font-size: 10px; line-height: 1.65; }
        .dz-admin-root .dz-choice-indicator { width: 7px; height: 7px; background: #d0d5cd; }
        .dz-admin-root .dz-choice-card.active .dz-choice-indicator { background: #355846; box-shadow: 0 0 0 3px rgba(53,88,70,.10); }
        .dz-admin-root .dz-phone-chassis { border: 8px solid #2b332e; border-radius: 32px; box-shadow: 0 20px 42px -28px rgba(22,33,25,.45); background: #2b332e; }
        .dz-admin-root .dz-phone-notch { height: 19px; }
        .dz-admin-root .dz-phone-screen { padding: 11px 8px; }
        .dz-admin-root .dz-toast { border: 1px solid rgba(255,255,255,.12); }
        .dz-admin-root button:focus-visible, .dz-admin-root a:focus-visible, .dz-admin-root input:focus-visible, .dz-admin-root select:focus-visible, .dz-admin-root textarea:focus-visible { outline: 3px solid rgba(53,88,70,.25); outline-offset: 2px; }
        @media (max-width: 1024px) {
          .dz-admin-root .dz-sidebar { padding: 15px 18px; background: #f8f8f4; }
          .dz-admin-root .dz-brand { margin-bottom: 14px; }
          .dz-admin-root .dz-main { padding: 24px 18px 36px; }
        }
        @media (max-width: 1024px) {
          .dz-brand-savebar { left: 18px; right: 18px; bottom: 14px; }
          .dz-branding-workspace { padding-bottom: 110px; }
          .dz-branding-categories { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 560px) {
          .dz-phone-chassis { width: min(342px, 100%); height: min(700px, calc(100svh - 125px)); min-height: 500px; border-width: 7px; border-radius: 29px; }
          .dz-branding-preview-sticky { margin-top: 8px; }
          .dz-brand-savebar { gap: 10px; padding: 10px; border-radius: 11px; left: 12px; right: 12px; bottom: 10px; }
          .dz-brand-savebar-copy strong { font-size: 10px; }
          .dz-brand-savebar-copy span:not(.dz-brand-save-indicator) { font-size: 9px; }
          .dz-brand-save-button { min-width: 112px; padding: 11px 12px; font-size: 11px !important; }
          .dz-branding-categories { gap: 7px; }
          .dz-brand-category { padding: 10px 8px; gap: 7px; }
          .dz-brand-category-number { width: 25px; height: 25px; }
          .dz-brand-category-copy strong { font-size: 10px; }
          .dz-brand-category-copy small { font-size: 8px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dz-admin-root *, .dz-admin-root *::before, .dz-admin-root *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
        }

        .dz-brand-presets { margin: 0 0 18px; padding: 15px; border: 1px solid var(--border-soft); border-radius: 15px; background: color-mix(in srgb, var(--surface) 84%, transparent); }
        .dz-brand-presets-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 12px; }
        .dz-brand-presets-heading h3 { margin: 0 0 5px; font-size: 15px; font-weight: 800; letter-spacing: -.025em; color: var(--ink-main); }
        .dz-brand-presets-heading p { margin: 0; color: var(--ink-muted); font-size: 11px; line-height: 1.7; }
        .dz-brand-presets-note { flex: 0 0 auto; border: 1px solid var(--border-soft); border-radius: 999px; padding: 5px 8px; color: var(--ink-muted); font-size: 9px; white-space: nowrap; }
        .dz-brand-presets-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
        .dz-brand-preset { position: relative; min-width: 0; padding: 7px; border: 1px solid var(--border-soft); border-radius: 11px; background: transparent; text-align: start; cursor: pointer; display: flex; flex-direction: column; gap: 7px; transition: border-color .18s ease, transform .18s ease, background .18s ease; color: var(--ink-main); }
        .dz-brand-preset:hover { transform: translateY(-1px); border-color: var(--ink-muted); }
        .dz-brand-preset.active { border-color: var(--ink-main); background: var(--bg-base); box-shadow: 0 0 0 1px var(--ink-main) inset; }
        .dz-brand-preset:focus-visible, .dz-brand-tool-button:focus-visible { outline: 3px solid color-mix(in srgb, var(--ink-main) 35%, transparent); outline-offset: 2px; }
        .dz-brand-preset-art { position: relative; display: block; height: 38px; overflow: hidden; border-radius: 7px; }
        .dz-brand-preset-swatch { position: absolute; top: 6px; inset-inline-start: 7px; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.8); border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
        .dz-brand-preset-line { position: absolute; inset-inline-end: 7px; bottom: 8px; width: 42%; height: 4px; border-radius: 10px; opacity: .82; }
        .dz-brand-preset-dot { position: absolute; inset-inline-end: 8px; top: 7px; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 0 3px rgba(255,255,255,.38); }
        .dz-brand-preset-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
        .dz-brand-preset-copy strong { font-size: 11px; font-weight: 850; line-height: 1.3; }
        .dz-brand-preset-copy small { font-size: 9px; line-height: 1.5; color: var(--ink-muted); min-height: 27px; }
        .dz-brand-preset-check { position: absolute; top: 6px; inset-inline-end: 6px; width: 17px; height: 17px; border-radius: 50%; display: grid; place-items: center; color: var(--ink-main); background: rgba(255,255,255,.86); font-size: 10px; font-weight: 900; opacity: .86; }
        .dz-brand-preset.active .dz-brand-preset-check { background: var(--ink-main); color: var(--surface); }
        .dz-brand-edit-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: -4px 0 18px; padding: 10px 0 12px; border-bottom: 1px solid var(--border-soft); }
        .dz-brand-edit-state { display: flex; align-items: center; gap: 7px; color: var(--ink-muted); font-size: 10px; line-height: 1.5; }
        .dz-brand-edit-dot, .dz-preview-live-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: #6d9275; box-shadow: 0 0 0 3px rgba(109,146,117,.12); }
        .dz-brand-edit-dot.is-dirty { background: #c18435; box-shadow: 0 0 0 3px rgba(193,132,53,.13); }
        .dz-brand-edit-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .dz-brand-tool-button { min-height: 32px; padding: 6px 9px; border: 1px solid var(--border-soft); border-radius: 8px; color: var(--ink-main); background: var(--surface); font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
        .dz-brand-tool-button:disabled { opacity: .42; cursor: not-allowed; }
        .dz-brand-tool-reset { color: var(--ink-muted); }
        .dz-brand-contrast-note { display: flex; align-items: flex-start; gap: 8px; padding: 9px 11px; margin: -8px 0 18px; border-radius: 9px; background: color-mix(in srgb, #4e815c 8%, var(--surface)); border: 1px solid color-mix(in srgb, #4e815c 20%, var(--border-soft)); color: var(--ink-muted); font-size: 10px; line-height: 1.65; }
        .dz-brand-contrast-note.is-low { background: color-mix(in srgb, #bd7b2c 9%, var(--surface)); border-color: color-mix(in srgb, #bd7b2c 28%, var(--border-soft)); }
        .dz-branding-preview-sticky { flex-direction: column; align-items: center; gap: 9px; }
        .dz-branding-preview-status { width: 100%; max-width: 342px; display: flex; align-items: center; gap: 7px; padding: 0 4px; color: var(--ink-muted); font-size: 10px; }
        .dz-branding-preview-status strong { color: var(--ink-main); font-weight: 850; }
        .dz-branding-preview-status > span:last-child { margin-inline-start: auto; }
        @media (max-width: 1100px) { .dz-brand-presets-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 620px) {
          .dz-brand-presets { padding: 11px; }
          .dz-brand-presets-heading { align-items: flex-start; flex-direction: column; gap: 6px; }
          .dz-brand-presets-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dz-brand-preset-art { height: 32px; }
          .dz-brand-preset-copy small { min-height: 0; }
          .dz-brand-edit-actions { align-items: flex-start; }
          .dz-brand-edit-buttons { width: 100%; }
          .dz-brand-tool-button { flex: 1 1 auto; }
          .dz-branding-preview-status { max-width: 100%; }
        }


        /* Brand Studio layout refinement: full workspace, clearer hierarchy and balanced live preview. */
        .dz-admin-root .dz-main-branding {
          min-width: 0;
          padding-inline: clamp(14px, 1.35vw, 28px) !important;
          padding-bottom: 34px !important;
        }
        .dz-branding-workspace { width: 100%; max-width: none; padding-bottom: 116px; }
        .dz-branding-panel-head { margin-bottom: 22px; }
        .dz-branding-panel-head h2 { font-size: clamp(24px, 2vw, 29px); line-height: 1.35; letter-spacing: -.045em; }
        .dz-branding-panel-head p { max-width: 760px; font-size: 13px; line-height: 1.8; }
        .dz-branding-kicker { font-size: 10px; margin-bottom: 9px; }
        .dz-customizer-grid {
          width: 100%;
          grid-template-columns: minmax(0, 1.08fr) minmax(390px, .92fr);
          gap: clamp(24px, 2.15vw, 40px);
          align-items: start;
        }
        #merchant-branding-form { min-width: 0; width: 100%; }
        .dz-brand-presets {
          margin-bottom: 20px;
          padding: 18px;
          border-radius: 17px;
          background: rgba(255,254,250,.76);
        }
        .dz-brand-presets-heading { align-items: center; margin-bottom: 15px; }
        .dz-brand-presets-heading h3 { font-size: 17px; }
        .dz-brand-presets-heading p { font-size: 12px; }
        .dz-brand-presets-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .dz-brand-preset { padding: 9px; border-radius: 12px; gap: 8px; min-height: 100px; }
        .dz-brand-preset-art { height: 44px; border-radius: 9px; }
        .dz-brand-preset-copy strong { font-size: 12px; }
        .dz-brand-preset-copy small { font-size: 10px; line-height: 1.55; min-height: 0; }
        .dz-branding-categories {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 20px;
        }
        .dz-brand-category { min-height: 76px; padding: 13px 14px; gap: 11px; border-radius: 13px; }
        .dz-brand-category-number { width: 34px; height: 34px; border-radius: 10px; font-size: 11px; }
        .dz-brand-category-copy { gap: 4px; }
        .dz-brand-category-copy strong { font-size: 13px; line-height: 1.45; }
        .dz-brand-category-copy small { font-size: 10px; line-height: 1.5; }
        .dz-brand-category-mark { font-size: 16px; }
        .dz-brand-edit-actions { gap: 12px; margin: 0 0 20px; padding: 12px 0 15px; }
        .dz-brand-edit-state { font-size: 12px; }
        .dz-brand-tool-button { min-height: 36px; padding: 7px 12px; border-radius: 9px; font-size: 11px; }
        .dz-branding-workspace .dz-card-box {
          margin-bottom: 18px !important;
          padding: clamp(20px, 1.7vw, 28px) !important;
          border-radius: 16px !important;
        }
        .dz-branding-workspace .dz-card-box h3 { font-size: 17px !important; line-height: 1.5; margin-bottom: 16px !important; }
        .dz-branding-workspace .formLabel { font-size: 13px !important; line-height: 1.6; margin-bottom: 8px; }
        .dz-branding-workspace .input { min-height: 46px; padding: 12px 15px; font-size: 14px; }
        .dz-branding-workspace .dz-choice-grid { gap: 11px; }
        .dz-branding-workspace .dz-choice-card { min-height: 112px; padding: 15px; border-radius: 13px; gap: 8px; }
        .dz-branding-workspace .dz-choice-title { font-size: 13px; line-height: 1.55; }
        .dz-branding-workspace .dz-choice-desc { font-size: 11px; line-height: 1.65; }
        .dz-brand-contrast-note { padding: 12px 14px; font-size: 12px; line-height: 1.7; }
        .dz-branding-preview-sticky {
          position: sticky;
          top: 14px;
          min-width: 0;
          min-height: calc(100svh - 150px);
          align-self: start;
          justify-content: flex-start;
          padding: 16px 18px 20px;
          border: 1px solid rgba(53,88,70,.11);
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(255,254,250,.86), rgba(245,247,241,.72));
          box-shadow: 0 18px 48px -40px rgba(26,48,33,.28);
        }
        .dz-branding-preview-status { max-width: 420px; padding: 2px 3px 10px; font-size: 12px; }
        .dz-phone-chassis {
          width: min(100%, 420px);
          height: min(78svh, 820px);
          min-height: 560px;
          border-radius: 37px;
        }
        .dz-brand-savebar {
          left: 24px;
          right: calc(280px + 24px);
          bottom: 16px;
          padding: 13px 18px;
          border-radius: 15px;
        }
        .dz-brand-savebar-copy strong { font-size: 13px; }
        .dz-brand-savebar-copy span:not(.dz-brand-save-indicator) { font-size: 11px; }
        .dz-brand-save-button { min-height: 44px; min-width: 160px; font-size: 13px !important; }
        @media (max-width: 1100px) {
          .dz-admin-root .dz-main-branding { padding-inline: 18px !important; }
          /* Keep the fixed save bar inside the content column while the desktop sidebar remains visible. */
          .dz-brand-savebar { left: 18px; right: calc(280px + 18px); }
          .dz-phone-chassis { width: min(100%, 420px); height: min(72svh, 720px); min-height: 520px; }
        }
        @media (max-width: 1024px) {
          .dz-brand-savebar { left: 18px; right: 18px; }
        }
        @media (max-width: 1140px) {
          .dz-customizer-grid { grid-template-columns: minmax(0,1fr); gap: 22px; }
          .dz-branding-preview-sticky { position: relative; top: auto; min-height: 0; order: 2; }
          #merchant-branding-form { order: 1; }
          .dz-phone-chassis { width: min(100%, 420px); height: min(700px, calc(100svh - 145px)); min-height: 500px; }
        }
        @media (max-width: 620px) {
          .dz-branding-workspace { padding-bottom: 106px; }
          .dz-branding-panel-head h2 { font-size: 22px; }
          .dz-branding-panel-head p { font-size: 12px; }
          .dz-brand-presets { padding: 13px; }
          .dz-brand-presets-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .dz-brand-preset { min-height: 0; }
          .dz-branding-categories { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
          .dz-brand-category { min-height: 68px; padding: 10px; }
          .dz-brand-category-copy strong { font-size: 12px; }
          .dz-brand-category-copy small { font-size: 9px; }
          .dz-branding-workspace .dz-card-box { padding: 17px !important; }
          .dz-branding-workspace .dz-choice-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .dz-brand-savebar { left: 10px; right: 10px; bottom: 9px; }
        }

        /* Operational dashboard: open layout, strong hierarchy, responsive shipment records. */
        .dz-overview-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: 1px solid var(--border-soft); margin: 2px 0 30px; background: rgba(255,254,250,.52); }
        .dz-overview-kpi { min-width: 0; text-align: right; padding: 22px 24px; border: 0; border-inline-start: 1px solid var(--border-soft); background: transparent; color: var(--ink-main); cursor: pointer; transition: background .16s ease; }
        .dz-overview-kpi:last-child { border-inline-start: 0; }
        .dz-overview-kpi:hover { background: rgba(73,101,79,.055); }
        .dz-overview-kpi:focus-visible, .dz-overview-action:focus-visible, .dz-overview-item-action:focus-visible { outline: 3px solid rgba(53,88,70,.25); outline-offset: 2px; }
        .dz-overview-kpi-label { display: block; color: var(--ink-muted); font-size: 13px; font-weight: 650; line-height: 1.6; margin-bottom: 8px; }
        .dz-overview-kpi-value { display: block; font-size: clamp(26px, 2.6vw, 36px); line-height: 1.2; font-weight: 800; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
        .dz-overview-kpi-note { display: block; margin-top: 7px; font-size: 12px; line-height: 1.55; color: var(--ink-light); }
        .dz-overview-kpi.is-alert .dz-overview-kpi-value { color: #b44e3e; }
        .dz-overview-grid { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(245px, .72fr); gap: clamp(24px, 3.5vw, 52px); align-items: start; }
        .dz-overview-main { min-width: 0; }
        .dz-overview-section { padding: 22px 0 18px; border-top: 1px solid var(--border-soft); min-width: 0; }
        .dz-overview-section:first-child { padding-top: 0; border-top: 0; }
        .dz-overview-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
        .dz-overview-section-title { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 750; letter-spacing: -.03em; color: var(--ink-main); }
        .dz-overview-section-subtitle { display: block; margin-top: 3px; font-size: 12.5px; color: var(--ink-muted); line-height: 1.65; }
        .dz-overview-text-link { border: 0; padding: 5px 0; background: transparent; color: #416B52; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
        .dz-overview-text-link:hover { text-decoration: underline; text-underline-offset: 3px; }
        .dz-overview-item { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--border-soft); }
        .dz-overview-item:last-child { border-bottom: 0; }
        .dz-overview-item-main { display: flex; align-items: flex-start; gap: 11px; min-width: 0; }
        .dz-overview-item-mark { width: 8px; height: 8px; margin-top: 7px; flex: 0 0 auto; border-radius: 50%; background: #b77a39; box-shadow: 0 0 0 4px rgba(183,122,57,.10); }
        .dz-overview-item-mark.is-delivered { background: #5a8767; box-shadow: 0 0 0 4px rgba(90,135,103,.10); }
        .dz-overview-item-mark.is-moving { background: #5e8290; box-shadow: 0 0 0 4px rgba(94,130,144,.10); }
        .dz-overview-item-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
        .dz-overview-item-copy strong { min-width: 0; color: var(--ink-main); font-size: 13px; font-weight: 750; line-height: 1.6; overflow-wrap: anywhere; }
        .dz-overview-item-copy span { min-width: 0; color: var(--ink-muted); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
        .dz-overview-item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; white-space: nowrap; }
        .dz-overview-item-meta time { color: var(--ink-light); font-size: 11px; }
        .dz-overview-item-action { border: 0; background: transparent; color: #416B52; padding: 4px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
        .dz-overview-empty { padding: 25px 0; color: var(--ink-muted); font-size: 12.5px; line-height: 1.8; }
        .dz-overview-aside { min-width: 0; }
        .dz-overview-actions { display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--border-soft); }
        .dz-overview-action { display: flex; align-items: center; gap: 11px; width: 100%; text-align: right; padding: 14px 0; border: 0; border-bottom: 1px solid var(--border-soft); background: transparent; color: var(--ink-main); cursor: pointer; font: inherit; }
        .dz-overview-action:hover .dz-overview-action-copy strong { color: #416B52; }
        .dz-overview-action-icon { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 9px; color: #416B52; background: #edf1eb; }
        .dz-overview-action-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .dz-overview-action-copy strong { font-size: 13px; line-height: 1.5; font-weight: 750; }
        .dz-overview-action-copy small { color: var(--ink-muted); font-size: 11.5px; line-height: 1.6; }
        .dz-orders-mobile { display: none; }
        .dz-orders-count { color: var(--ink-muted); font-size: 12px; white-space: nowrap; }
        .dz-orders-load-more { display: flex; justify-content: center; padding: 16px; }
        .dz-orders-load-more button { border: 1px solid var(--border-soft); background: #fffefa; border-radius: 8px; padding: 10px 16px; color: var(--ink-main); font: inherit; font-size: 12.5px; font-weight: 750; cursor: pointer; }
        .dz-orders-load-more button:hover { border-color: #8ca391; }

        /* Dedicated Analytics Tab Styles */
        .dz-analytics { display: flex; flex-direction: column; gap: 0; animation: dz-tab-fade-up .3s ease both; }
        .dz-analytics-kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          border: 1px solid var(--border-soft);
          border-radius: 14px;
          margin: 4px 0 28px;
          background: #ffffff;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
          overflow: hidden;
        }
        .dz-analytics-kpis .dz-overview-kpi {
          padding: 24px 26px;
          border: 0;
          border-inline-start: 1px solid var(--border-soft);
          cursor: default;
        }
        .dz-analytics-kpis .dz-overview-kpi:last-child { border-inline-start: 0; }
        .dz-analytics-kpis .dz-overview-kpi-label {
          font-size: 13.5px;
          font-weight: 650;
          color: var(--ink-muted);
          margin-bottom: 8px;
        }
        .dz-analytics-kpis .dz-overview-kpi-value {
          font-size: clamp(30px, 3.2vw, 40px);
          font-weight: 800;
          color: var(--ink-main);
          letter-spacing: -0.04em;
        }
        .dz-analytics-kpis .dz-overview-kpi-note {
          font-size: 12.5px;
          color: var(--ink-light);
          margin-top: 8px;
          line-height: 1.55;
        }
        .dz-analytics-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
          gap: clamp(20px, 3vw, 36px);
        }
        .dz-analytics-section {
          background: #ffffff;
          border: 1px solid var(--border-soft);
          border-radius: 16px;
          padding: 24px 28px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
          border-top: 1px solid var(--border-soft);
        }
        /* Override the first-child padding reset — analytics cards always need top padding */
        .dz-analytics-section.dz-overview-section:first-child { padding-top: 24px; border-top: 1px solid var(--border-soft); }
        .dz-analytics-section .dz-overview-section-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        }
        .dz-analytics-section .dz-overview-section-title {
          font-size: 18px;
          font-weight: 800;
          color: var(--ink-main);
          letter-spacing: -0.02em;
          line-height: 1.4;
        }
        .dz-analytics-section .dz-overview-section-subtitle {
          font-size: 13px;
          color: var(--ink-muted);
          line-height: 1.6;
          margin-top: 4px;
        }
        .dz-analytics-total {
          flex: 0 0 auto;
          border: 1px solid rgba(65, 107, 82, 0.2);
          background: #edf5ef;
          border-radius: 10px;
          padding: 7px 14px;
          color: #245838;
          font-size: 13px;
          font-weight: 750;
          white-space: nowrap;
        }
        .dz-analytics-bars, .dz-analytics-status-list {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding-top: 6px;
        }
        .dz-analytics-bar-row {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr) 40px;
          align-items: center;
          gap: 16px;
        }
        .dz-analytics-day {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 13.5px;
          font-weight: 750;
          color: var(--ink-main);
          line-height: 1.35;
        }
        .dz-analytics-day small {
          font-size: 12px;
          color: var(--ink-light);
          font-weight: 500;
        }
        .dz-analytics-bar-track {
          height: 10px;
          border-radius: 999px;
          overflow: hidden;
          background: #eef2ed;
        }
        .dz-analytics-bar-fill {
          height: 100%;
          border-radius: inherit;
          min-width: 0;
          background: #416B52;
          transition: width .25s ease;
        }
        .dz-analytics-bar-count {
          text-align: left;
          font-size: 14px;
          font-weight: 750;
          font-variant-numeric: tabular-nums;
          color: var(--ink-main);
        }
        .dz-analytics-status-item {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }
        .dz-analytics-status-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          font-size: 13.5px;
          color: var(--ink-main);
        }
        .dz-analytics-status-heading > span {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 650;
          font-size: 13.5px;
        }
        .dz-analytics-status-heading i {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          flex: 0 0 auto;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.04);
        }
        .dz-analytics-status-heading strong {
          color: var(--ink-main);
          font-size: 14px;
          font-weight: 750;
          white-space: nowrap;
        }
        .dz-analytics-status-heading small {
          color: var(--ink-muted);
          font-size: 12.5px;
          font-weight: 600;
          margin-inline-start: 4px;
        }
        .dz-analytics-footnote {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-top: 26px;
          padding: 16px 20px;
          border-inline-start: 3px solid #5a8767;
          border-radius: 12px;
          background: rgba(90, 135, 103, 0.08);
          color: var(--ink-muted);
          font-size: 13px;
          line-height: 1.8;
          font-weight: 500;
        }
        .dz-analytics-action-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 22px;
        }
        .dz-analytics-action-row .dz-btn {
          font-size: 13.5px;
          font-weight: 700;
          padding: 10px 22px;
          min-height: 42px;
          border-radius: 10px;
        }
        .dz-order-detail-backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          justify-content: flex-start;
          background: rgba(16, 24, 19, 0.45);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          font-family: 'Readex Pro', 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
          direction: rtl;
          --bg-base: #F4F4F5;
          --surface: #FFFFFF;
          --surface-hover: #FAFAFA;
          --ink-main: #09090B;
          --ink-muted: #52525B;
          --ink-light: #A1A1AA;
          --border-soft: rgba(9, 9, 11, 0.08);
          --border-strong: rgba(9, 9, 11, 0.18);
        }
        .dz-order-detail-backdrop input,
        .dz-order-detail-backdrop select,
        .dz-order-detail-backdrop button,
        .dz-order-detail-backdrop textarea {
          font-family: inherit;
        }
        .dz-order-detail-panel {
          width: min(520px, 100%);
          height: 100%;
          max-height: 100dvh;
          overflow-y: auto;
          padding: 32px 28px;
          background: #fffefa;
          color: var(--ink-main);
          border-inline-start: 1px solid var(--border-soft);
          box-shadow: 0 20px 70px rgba(20, 30, 23, 0.25);
          animation: dz-detail-in 0.22s ease-out;
          font-family: 'Readex Pro', 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
          box-sizing: border-box;
        }
        @keyframes dz-detail-in { from { opacity: 0.6; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        .dz-order-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-bottom: 22px; border-bottom: 1px solid var(--border-soft); }
        .dz-order-detail-kicker { display: block; margin-bottom: 6px; color: var(--ink-muted); font-size: 12px; font-weight: 750; letter-spacing: 0.04em; }
        .dz-order-detail-head h2 { margin: 0; font-size: 24px; font-weight: 850; line-height: 1.35; letter-spacing: -0.03em; color: var(--ink-main); overflow-wrap: anywhere; }
        .dz-order-detail-head p { margin: 6px 0 0; color: var(--ink-muted); font-size: 14px; line-height: 1.6; }
        .dz-order-detail-close { width: 38px; height: 38px; flex: 0 0 38px; border: 1px solid var(--border-soft); border-radius: 10px; display: grid; place-items: center; background: #f4f4f5; color: var(--ink-main); cursor: pointer; transition: all 0.2s ease; }
        .dz-order-detail-close:hover { background: #e4e4e7; color: #000; }
        .dz-order-detail-status { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 20px 0; border-bottom: 1px solid var(--border-soft); }
        .dz-order-detail-status small { display: block; margin-bottom: 5px; font-size: 12.5px; font-weight: 600; color: var(--ink-muted); }
        .dz-order-detail-status strong { display: block; font-size: 17px; font-weight: 800; line-height: 1.5; color: var(--ink-main); }
        .dz-order-detail-status .dz-pill { font-size: 13px; font-weight: 750; padding: 6px 14px; border-radius: 99px; }
        .dz-order-detail-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 20px; }
        .dz-order-detail-field { min-width: 0; padding: 16px 0; border-bottom: 1px solid var(--border-soft); }
        .dz-order-detail-field span { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--ink-muted); }
        .dz-order-detail-field strong { display: block; font-size: 15px; font-weight: 700; line-height: 1.6; color: var(--ink-main); overflow-wrap: anywhere; }
        .dz-order-detail-note { margin-top: 20px; color: var(--ink-muted); font-size: 13px; line-height: 1.75; }
        .dz-order-detail-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px; }
        .dz-order-detail-actions .dz-btn { flex: 1 1 auto; font-size: 14px; font-weight: 700; padding: 12px 18px; min-height: 44px; }
        .dz-admin-root .dz-orders-desktop { box-shadow: none; border-radius: 12px; border-color: var(--border-soft); }
        .dz-admin-root .dz-orders-desktop .dz-table-scroll { max-height: none; overflow-x: auto; overflow-y: visible; }
        .dz-admin-root .dz-orders-desktop th { white-space: nowrap; }
        .dz-admin-root .dz-orders-desktop td { vertical-align: middle; }
        .dz-admin-root .dz-orders-desktop .dz-table-header { background: transparent; }
        .dz-admin-root .dz-orders-desktop .dz-table-scroll tr:hover td { background: #f7f8f3; }
        .dz-add-order-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 16px;
          border-radius: 9px;
          background: #263b30;
          color: #fffefa;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid #263b30;
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          box-shadow: 0 2px 6px rgba(27, 39, 32, 0.12);
          white-space: nowrap;
        }
        .dz-add-order-btn:hover {
          background: #17231c;
          border-color: #17231c;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(27, 39, 32, 0.22);
        }
        .dz-add-order-btn:active {
          transform: translateY(0);
        }
        .dz-input-field {
          width: 100%;
          padding: 11px 14px;
          border-radius: 9px;
          border: 1px solid var(--border-soft);
          background: #fff;
          color: var(--ink-main);
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
          min-height: 44px;
        }
        .dz-input-field:focus {
          border-color: #263b30;
          box-shadow: 0 0 0 3px rgba(38, 59, 48, 0.12);
        }
        @media (max-width: 1100px) {
          .dz-overview-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .dz-overview-aside { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 26px; }
          .dz-analytics-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; }
        }
        @media (max-width: 760px) {
          .dz-overview-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 22px; }
          .dz-overview-kpi { padding: 16px 13px; border-bottom: 1px solid var(--border-soft); }
          .dz-overview-kpi:nth-child(2n) { border-inline-start: 0; }
          .dz-overview-kpi:nth-last-child(-n+2) { border-bottom: 0; }
          .dz-overview-kpi-value { font-size: 25px; }
          .dz-overview-grid { gap: 10px; }
          .dz-overview-aside { display: block; }
          .dz-overview-item { gap: 6px; }
          .dz-overview-item-meta { align-items: flex-end; }
          .dz-overview-item-action { min-height: 32px; }
          .dz-analytics-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dz-analytics-kpis .dz-overview-kpi:nth-child(2) { border-inline-start: 0; }
          .dz-analytics-kpis .dz-overview-kpi:last-child { grid-column: span 2; border-inline-start: 0; border-top: 1px solid var(--border-soft); }
          .dz-admin-root .dz-orders-desktop { display: none; }
          .dz-orders-mobile { display: grid; gap: 10px; }
          .dz-order-mobile-card { min-width: 0; padding: 14px; border-block: 1px solid var(--border-soft); background: rgba(255,254,250,.72); }
          .dz-order-mobile-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
          .dz-order-mobile-number { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
          .dz-order-mobile-number strong { font-size: 12px; line-height: 1.5; color: var(--ink-main); overflow-wrap: anywhere; }
          .dz-order-mobile-number small { font-size: 9px; color: var(--ink-muted); }
          .dz-order-mobile-customer { margin-top: 12px; font-size: 13px; font-weight: 750; color: var(--ink-main); line-height: 1.65; overflow-wrap: anywhere; }
          .dz-order-mobile-phone { display: flex; align-items: center; gap: 6px; margin-top: 2px; color: var(--ink-muted); font-size: 11px; overflow-wrap: anywhere; }
          .dz-order-mobile-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-soft); font-size: 10px; color: var(--ink-muted); }
          .dz-order-mobile-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
          .dz-order-mobile-actions .dz-btn { flex: 1 1 auto; min-height: 38px; }
          .dz-admin-root .dz-main { padding-bottom: 32px; }
          .dz-admin-root .dz-filter-row { gap: 8px; }
          .dz-admin-root .dz-filter-row > div { min-width: 0; }
          .dz-admin-root .dz-shipment-filters { flex-direction: column; align-items: stretch; }
          .dz-admin-root .dz-shipment-filters > div { width: 100%; }
          .dz-admin-root .dz-shipment-filters select { flex: 1 1 auto; min-width: 0; }
          .dz-admin-root .dz-filter-btn { min-height: 36px; }
        }
        @media (max-width: 520px) {
          .dz-analytics-kpis { grid-template-columns: minmax(0, 1fr); }
          .dz-analytics-kpis .dz-overview-kpi { border-inline-start: 0; border-bottom: 1px solid var(--border-soft); padding: 18px 20px; }
          .dz-analytics-kpis .dz-overview-kpi:last-child { grid-column: span 1; border-top: 0; border-bottom: 0; }
          .dz-analytics-section { padding: 18px 18px; }
          .dz-analytics-section.dz-overview-section:first-child { padding-top: 18px; }
          .dz-analytics-bar-row { grid-template-columns: 92px minmax(0, 1fr) 30px; gap: 10px; }
          .dz-analytics-day { font-size: 12.5px; }
          .dz-analytics-day small { font-size: 11px; }
          .dz-analytics-bar-count { font-size: 13px; }
        }
        @media (max-width: 460px) {
          .dz-order-mobile-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dz-order-detail-panel { padding: 20px; }
          .dz-order-detail-fields { grid-template-columns: minmax(0, 1fr); }
          .dz-analytics-bar-row { grid-template-columns: 82px minmax(0, 1fr) 26px; gap: 8px; }
          .dz-overview-section-head { align-items: flex-start; }
          .dz-orders-count { white-space: normal; text-align: left; }
        }
        /* SUBSCRIPTION WARNING BANNER */
        .dz-sub-alert-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; margin: 0 0 24px; border-radius: 14px; border: 1px solid rgba(220, 38, 38, 0.22); background: #fef2f2; color: #991b1b; animation: dz-tab-fade-up .4s ease both; }
        .dz-sub-alert-banner.is-warning { border-color: rgba(217, 119, 6, 0.25); background: #fffbeb; color: #92400e; }
        .dz-sub-alert-content { display: flex; align-items: flex-start; gap: 14px; }
        .dz-sub-alert-icon { font-size: 20px; line-height: 1; flex-shrink: 0; margin-top: 2px; }
        .dz-sub-alert-content strong { display: block; font-size: 13px; font-weight: 800; margin-bottom: 2px; }
        .dz-sub-alert-content p { margin: 0; font-size: 12px; opacity: 0.9; line-height: 1.55; }
        .dz-sub-alert-btn { white-space: nowrap; padding: 8px 16px; border-radius: 10px; border: none; background: #27342d; color: #fff; font-size: 12px; font-weight: 750; cursor: pointer; transition: opacity .2s ease; flex-shrink: 0; }
        .dz-sub-alert-btn:hover { opacity: 0.9; }

        /* INTEGRATION HUB STYLES */
        .dz-int-hub { display: flex; flex-direction: column; gap: 24px; max-width: 1100px; padding-bottom: 60px; }
        .dz-int-top-card { background: #fff; border: 1px solid rgba(9, 9, 11, .09); border-radius: 16px; padding: 22px 26px; box-shadow: 0 8px 24px rgba(9, 9, 11, .03); }
        .dz-int-top-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .dz-int-top-title h3 { margin: 0; font-size: 16px; font-weight: 850; color: #202824; }
        .dz-int-top-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; background: #f0fdf4; color: #166534; font-size: 11px; font-weight: 700; border: 1px solid #bbf7d0; }
        .dz-int-creds-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
        .dz-int-cred-item { background: #f8faf8; border: 1px solid rgba(9, 9, 11, .07); border-radius: 12px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
        .dz-int-cred-label { font-size: 11px; font-weight: 750; color: #526056; display: flex; justify-content: space-between; align-items: center; }
        .dz-int-cred-val { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .dz-int-cred-val code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #27342d; direction: ltr; font-weight: 600; overflow-wrap: anywhere; }
        .dz-int-cred-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .dz-int-action-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(9,9,11,.1); background: #fff; color: #374151; cursor: pointer; transition: all .2s; }
        .dz-int-action-btn:hover { background: #f3f4f6; color: #111827; }

        /* INTEGRATION SUB NAV PILLS */
        .dz-int-nav { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(9, 9, 11, .09); padding-bottom: 12px; flex-wrap: wrap; }
        .dz-int-nav-btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 11px; border: 1px solid transparent; background: transparent; color: #526056; font-size: 13px; font-weight: 750; cursor: pointer; transition: all .2s ease; }
        .dz-int-nav-btn:hover { background: rgba(39, 52, 45, 0.05); color: #202824; }
        .dz-int-nav-btn.active { background: #27342d; color: #fff; box-shadow: 0 4px 12px rgba(39, 52, 45, .18); }

        /* SDK SECTION */
        .dz-sdk-install-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; background: #fff; border: 1px solid rgba(9, 9, 11, .09); border-radius: 14px; padding: 16px 20px; }
        .dz-sdk-pm-tabs { display: flex; align-items: center; gap: 6px; }
        .dz-sdk-pm-tab { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(9, 9, 11, .1); background: #f8faf8; color: #526056; font-size: 11px; font-weight: 750; cursor: pointer; font-family: monospace; }
        .dz-sdk-pm-tab.active { background: #27342d; color: #fff; border-color: #27342d; }
        .dz-sdk-cmd-row { display: flex; align-items: center; gap: 10px; background: #18201a; border-radius: 10px; padding: 8px 14px; color: #e5e7eb; font-family: monospace; font-size: 12px; min-width: 280px; }
        .dz-sdk-cmd-row code { flex: 1; direction: ltr; text-align: left; color: #a7f3d0; }

        /* FEATURE HIGHLIGHTS */
        .dz-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 4px; }
        .dz-feature-card { background: #fff; border: 1px solid rgba(9, 9, 11, .08); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 4px 16px rgba(9, 9, 11, .02); }
        .dz-feature-card-icon { width: 34px; height: 34px; border-radius: 10px; background: #ecf3ee; color: #2e563a; display: grid; place-items: center; margin-bottom: 4px; }
        .dz-feature-card h4 { margin: 0; font-size: 13px; font-weight: 800; color: #202824; }
        .dz-feature-card p { margin: 0; font-size: 11px; color: #69736e; line-height: 1.6; }

        /* CODE SHOWCASE BOX */
        .dz-code-box { background: #161c18; border: 1px solid #28332a; border-radius: 16px; overflow: hidden; box-shadow: 0 16px 40px rgba(0, 0, 0, .14); }
        .dz-code-topbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #28332a; padding: 10px 16px; background: #1b231e; flex-wrap: wrap; gap: 10px; }
        .dz-code-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .dz-code-tab-btn { padding: 7px 13px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #9ca3af; font-size: 11px; font-weight: 750; cursor: pointer; transition: all .15s ease; }
        .dz-code-tab-btn:hover { color: #f3f4f6; background: rgba(255, 255, 255, .05); }
        .dz-code-tab-btn.active { background: #2f3e34; color: #fff; border-color: #425547; }
        .dz-code-copy-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid #3c4c3f; background: #242e27; color: #d1d5db; font-size: 11px; font-weight: 750; cursor: pointer; transition: background .15s; }
        .dz-code-copy-btn:hover { background: #2f3e34; color: #fff; }
        .dz-code-pre { margin: 0; padding: 20px 24px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.85; color: #e5e7eb; white-space: pre; overflow-x: auto; direction: ltr; text-align: left; }

        /* CARRIER CARDS GRID */
        .dz-carrier-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
        .dz-carrier-item-card { background: #fff; border: 1px solid rgba(9, 9, 11, .09); border-radius: 16px; padding: 22px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 6px 20px rgba(9, 9, 11, .025); }
        .dz-carrier-card-top { display: flex; align-items: center; justify-content: space-between; }
        .dz-carrier-card-title { display: flex; align-items: center; gap: 10px; }
        .dz-carrier-badge-icon { width: 36px; height: 36px; border-radius: 10px; background: #f3f6f3; color: #3d5b46; display: grid; place-items: center; font-weight: 850; font-size: 13px; }
        .dz-carrier-item-card h4 { margin: 0; font-size: 14px; font-weight: 850; color: #202824; }
        .dz-carrier-item-card small { color: #6d7771; font-size: 11px; }
        .dz-carrier-item-card p { margin: 0; font-size: 11px; color: #64748b; line-height: 1.6; }

        /* ATTRIBUTES TABLE */
        .dz-attr-table-wrap { background: #fff; border: 1px solid rgba(9, 9, 11, .09); border-radius: 16px; overflow: hidden; padding: 20px; box-shadow: 0 4px 16px rgba(9, 9, 11, .02); }
        .dz-attr-table-wrap h4 { margin: 0 0 8px; font-size: 14px; font-weight: 850; color: #202824; }
        .dz-attr-table-wrap > p { margin: 0 0 16px; font-size: 11px; color: #64748b; line-height: 1.6; }
        .dz-attr-table { width: 100%; border-collapse: collapse; text-align: right; }
        .dz-attr-table th { background: #f8faf8; padding: 10px 14px; font-size: 11px; font-weight: 750; color: #526056; border-bottom: 1px solid rgba(9, 9, 11, .08); }
        .dz-attr-table td { padding: 12px 14px; font-size: 11px; border-bottom: 1px solid rgba(9, 9, 11, .06); color: #374151; }
        .dz-attr-table tr:last-child td { border-bottom: none; }
        .dz-attr-table code { font-family: monospace; font-size: 11px; background: #f1f5f2; color: #27342d; padding: 2px 6px; border-radius: 6px; direction: ltr; display: inline-block; }

        /* DZ MERCHANT INTEGRATION + ONBOARDING GLOBAL STYLES */
        .dz-always-guide {
          position: sticky;
          top: 0;
          z-index: 24;
          display: flex;
          align-items: center;
          gap: 13px;
          margin: -40px -48px 28px;
          padding: 12px 48px;
          border-bottom: 1px solid rgba(9, 9, 11, .08);
          background: rgba(248, 248, 246, .94);
          -webkit-backdrop-filter: blur(18px);
          backdrop-filter: blur(18px);
        }
        .dz-always-guide-mark {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          flex: 0 0 34px;
          color: #fff;
          border-radius: 11px;
          background: #27342d;
        }
        .dz-always-guide-mark svg { width: 17px; height: 17px; }
        .dz-always-guide-copy { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
        .dz-always-guide-copy strong { font-size: 12px; color: var(--ink-main); font-weight: 800; }
        .dz-always-guide-copy span { color: var(--ink-muted); font-size: 11px; line-height: 1.55; }
        .dz-always-guide > button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          flex-shrink: 0;
          min-height: 35px;
          padding: 8px 13px;
          border: 1px solid #27342d;
          border-radius: 9px;
          background: #27342d;
          color: #fff;
          font: inherit;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
          transition: transform .2s ease, background .2s ease;
        }
        .dz-always-guide > button:hover { transform: translateY(-1px); background: #1f2a23; }

        .dz-setup-empty {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr);
          align-items: stretch;
          gap: clamp(22px, 4vw, 54px);
          margin: 0 0 28px;
          padding: clamp(22px, 3vw, 35px);
          overflow: hidden;
          border: 1px solid rgba(39, 52, 45, .12);
          border-radius: 22px;
          background: linear-gradient(125deg, #fff 0%, #f8f8f3 78%, #eef1e8 100%);
        }
        .dz-setup-empty::after {
          content: '';
          position: absolute;
          width: 180px;
          height: 180px;
          left: -90px;
          bottom: -115px;
          border: 1px solid rgba(39, 52, 45, .11);
          border-radius: 50%;
          box-shadow: 0 0 0 22px rgba(39, 52, 45, .025), 0 0 0 44px rgba(39, 52, 45, .02);
          pointer-events: none;
        }
        .dz-setup-empty-intro { align-self: center; position: relative; z-index: 1; }
        .dz-setup-eyebrow { display: inline-flex; align-items: center; gap: 7px; color: #4f705a; font-size: 10px; font-weight: 800; letter-spacing: .02em; }
        .dz-setup-eyebrow i { font-style: normal; color: #a5b2a6; }
        .dz-setup-empty-intro h2, .dz-integration-intro h2 { margin: 12px 0 10px; max-width: 460px; color: #202824; font-size: clamp(22px, 2.3vw, 31px); line-height: 1.42; letter-spacing: -.045em; font-weight: 850; }
        .dz-setup-empty-intro p, .dz-integration-intro > p { margin: 0; max-width: 520px; color: #69736e; font-size: 12px; line-height: 2; }
        .dz-setup-primary { display: inline-flex; align-items: center; gap: 12px; margin-top: 19px; padding: 11px 15px; border: 0; border-radius: 10px; background: #27342d; color: #fff; font: inherit; font-size: 12px; font-weight: 750; cursor: pointer; }
        .dz-setup-primary:hover { background: #1f2a23; }
        .dz-setup-steps { align-self: center; position: relative; z-index: 1; display: flex; flex-direction: column; }
        .dz-setup-step { display: grid; grid-template-columns: 37px minmax(0,1fr) 20px; align-items: center; gap: 12px; width: 100%; padding: 16px 0; border: 0; border-bottom: 1px solid rgba(39, 52, 45, .13); background: transparent; text-align: right; color: #202824; cursor: pointer; }
        .dz-setup-step:last-child { border-bottom: 0; }
        .dz-setup-step-no { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid rgba(39,52,45,.16); border-radius: 12px; color: #47634f; font-size: 11px; font-weight: 850; background: rgba(255,255,255,.7); }
        .dz-setup-step > span:nth-child(2) { display: flex; flex-direction: column; gap: 4px; }
        .dz-setup-step strong { font-size: 12px; font-weight: 800; }
        .dz-setup-step small { font-size: 11px; color: #69736e; line-height: 1.6; }
        .dz-setup-step-arrow { color: #6a806c; font-size: 19px; transition: transform .2s ease; }
        .dz-setup-step:hover .dz-setup-step-arrow { transform: translate(-2px, 2px); }

        .dz-integration-wizard { max-width: 1050px; padding-bottom: 56px; scroll-margin-top: 18px; }
        .dz-integration-intro { margin-bottom: 30px; padding: 3px 0 10px; }
        .dz-integration-intro h2 { max-width: 720px; }
        .dz-integration-question { margin: 0 0 26px; padding: 23px clamp(16px, 2.8vw, 30px) 27px; border: 1px solid rgba(9, 9, 11, .08); border-radius: 17px; background: rgba(255,255,255,.72); box-shadow: 0 8px 28px rgba(9, 9, 11, .025); }
        .dz-integration-question-head { display: flex; align-items: flex-start; gap: 13px; margin-bottom: 20px; }
        .dz-integration-step { display: grid; flex: 0 0 35px; width: 35px; height: 35px; place-items: center; border-radius: 11px; background: #e9eee8; color: #3d5b46; font-size: 11px; font-weight: 850; }
        .dz-integration-question-head h3 { margin: 1px 0 5px; color: #202824; font-size: 15px; line-height: 1.5; font-weight: 850; }
        .dz-integration-question-head p { margin: 0; color: #69736e; font-size: 11px; line-height: 1.75; }
        .dz-integration-choice-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
        .dz-integration-source-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .dz-integration-choice { display: grid; grid-template-columns: 39px minmax(0,1fr) 23px; align-items: center; gap: 11px; min-width: 0; padding: 14px; border: 1px solid rgba(9,9,11,.1); border-radius: 13px; background: #fff; color: #202824; text-align: right; cursor: pointer; transition: border-color .2s ease, background .2s ease, transform .2s ease; }
        .dz-integration-choice:hover { border-color: rgba(39,52,45,.38); transform: translateY(-1px); }
        .dz-integration-choice.is-selected { border-color: #486b50; background: #f1f5ee; box-shadow: inset 0 0 0 1px #486b50; }
        .dz-integration-choice-symbol { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #3d5d47; background: #edf1eb; font-size: 16px; font-weight: 850; }
        .dz-integration-choice-symbol svg { width: 19px; height: 19px; }
        .dz-integration-choice > span:nth-child(2) { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
        .dz-integration-choice strong { font-size: 12px; font-weight: 800; }
        .dz-integration-choice small { color: #6d7771; font-size: 10px; line-height: 1.6; }
        .dz-choice-check { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid rgba(9,9,11,.13); border-radius: 50%; color: #728077; font-size: 14px; line-height: 1; }
        .dz-integration-choice.is-selected .dz-choice-check { border-color: #486b50; background: #486b50; color: #fff; }
        .dz-carrier-picker { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; margin-top: 20px; padding-top: 17px; border-top: 1px solid rgba(9,9,11,.07); }
        .dz-carrier-picker label { font-size: 11px; font-weight: 800; color: #3a443e; }
        .dz-carrier-picker select { width: min(100%, 300px); min-height: 40px; padding: 9px 12px; border: 1px solid rgba(9,9,11,.13); border-radius: 9px; color: #202824; background: #fff; font: inherit; font-size: 11px; }
        .dz-carrier-picker p { flex-basis: 100%; margin: 0; color: #747e77; font-size: 10px; }
        .dz-integration-waiting { display: flex; align-items: flex-start; gap: 13px; margin: 5px 0 28px; padding: 18px 20px; border-inline-start: 3px solid #c4d1c1; background: rgba(236,241,233,.65); }
        .dz-waiting-mark { color: #54715b; font-size: 21px; }
        .dz-integration-waiting strong { display: block; margin: 1px 0 5px; color: #344a39; font-size: 12px; }
        .dz-integration-waiting p { margin: 0; max-width: 650px; color: #69736e; font-size: 11px; line-height: 1.8; }
        .dz-integration-results { margin-top: 5px; animation: dzGuideIn .35s ease both; }
        @keyframes dzGuideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .dz-integration-results-title { display: flex; gap: 13px; align-items: flex-start; margin: 4px 0 18px; }
        .dz-result-ready-dot { width: 9px; height: 9px; margin-top: 8px; flex: 0 0 9px; border-radius: 50%; background: #52775b; box-shadow: 0 0 0 5px rgba(82,119,91,.12); }
        .dz-integration-results-title h3 { margin: 4px 0 5px; color: #202824; font-size: 18px; font-weight: 850; letter-spacing: -.02em; }
        .dz-integration-results-title p { margin: 0; max-width: 720px; color: #69736e; font-size: 11px; line-height: 1.85; }
        .dz-guide-step-panel { margin-bottom: 16px; padding: clamp(18px, 2.8vw, 29px); border: 1px solid rgba(9,9,11,.09); border-radius: 17px; background: #fff; box-shadow: 0 12px 38px rgba(9,9,11,.035); }
        .dz-guide-panel-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 17px; }
        .dz-guide-step-no { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 10px; background: #edf1eb; color: #48654e; font-size: 11px; font-weight: 850; }
        .dz-guide-type { color: #8a958c; font-size: 9px; font-weight: 850; letter-spacing: .11em; direction: ltr; }
        .dz-guide-step-panel h4 { margin: 0 0 7px; color: #202824; font-size: 14px; font-weight: 850; }
        .dz-guide-step-panel > p { margin: 0 0 16px; color: #69736e; font-size: 11px; line-height: 1.95; max-width: 840px; }
        .dz-copy-field { display: flex; align-items: center; gap: 10px; padding: 9px; min-width: 0; border: 1px solid rgba(9,9,11,.1); border-radius: 11px; background: #f7f8f5; }
        .dz-copy-field code { flex: 1; min-width: 0; overflow-wrap: anywhere; color: #394b3e; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.7; text-align: left; }
        .dz-copy-field button, .dz-agent-prompt-head button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 7px; min-height: 34px; padding: 7px 10px; border: 1px solid rgba(39,52,45,.15); border-radius: 8px; background: #fff; color: #344a39; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
        .dz-copy-field button svg, .dz-agent-prompt-head button svg { width: 14px; height: 14px; }
        .dz-guide-steps-list { display: flex; flex-direction: column; gap: 10px; padding-right: 21px; margin: 18px 0; color: #4e5952; font-size: 11px; line-height: 1.85; }
        .dz-guide-note { margin: 13px 0 0 !important; padding: 11px 13px; border-inline-start: 2px solid #b7c9b5; background: #f4f7f1; color: #566b58 !important; font-size: 10px !important; }
        .dz-copy-field-command { margin-bottom: 17px; }
        .dz-copy-field-command code { font-size: 12px; }
        .dz-agent-prompt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; color: #303a33; font-size: 11px; font-weight: 850; }
        .dz-agent-prompt { max-width: 100%; max-height: 225px; overflow: auto; margin: 0; padding: 14px; border-radius: 11px; background: #202824; color: #e9f0e8; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; text-align: left; unicode-bidi: plaintext; }
        .dz-integration-next-note { display: flex; flex-direction: column; gap: 7px; padding: 18px 20px; margin: 17px 0; border-inline-start: 3px solid #8fa58b; background: #f2f5ef; }
        .dz-integration-next-note strong { color: #344a39; font-size: 12px; }
        .dz-integration-next-note span { max-width: 800px; color: #5f6b62; font-size: 11px; line-height: 1.9; }
        .dz-integration-next-note button { align-self: flex-start; display: inline-flex; gap: 8px; align-items: center; margin-top: 4px; padding: 8px 0; border: 0; background: transparent; color: #344a39; font: inherit; font-size: 11px; font-weight: 850; cursor: pointer; }
        .dz-integration-reset-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 13px; color: #7b857e; font-size: 10px; }
        .dz-integration-reset-row button { padding: 7px 9px; border: 1px solid rgba(9,9,11,.12); border-radius: 8px; color: #56635a; background: transparent; font: inherit; font-weight: 750; cursor: pointer; }
        .dz-other-integrations { margin: 28px 0 0; border-top: 1px solid rgba(9,9,11,.1); border-bottom: 1px solid rgba(9,9,11,.1); }
        .dz-other-integrations summary { padding: 16px 0; color: #4e5e51; font-size: 12px; font-weight: 800; cursor: pointer; }
        .dz-other-integrations > p { margin: 0 0 14px; color: #747e77; font-size: 10px; line-height: 1.8; }
        .dz-other-integration-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid rgba(9,9,11,.06); }
        .dz-other-integration-row > div { display: flex; flex-direction: column; gap: 3px; min-width: 120px; }
        .dz-other-integration-row strong { font-size: 11px; }
        .dz-other-integration-row small { color: #727d74; font-size: 10px; }
        .dz-other-integration-row code { flex: 1; min-width: 0; text-align: left; overflow-wrap: anywhere; color: #536456; font-size: 10px; }
        .dz-other-integration-row button { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; border: 1px solid rgba(9,9,11,.1); border-radius: 8px; background: #fff; color: #344a39; cursor: pointer; }

        @media (max-width: 1024px) {
          .dz-always-guide { margin: -24px -24px 24px; padding: 11px 24px; }
          .dz-setup-empty { grid-template-columns: minmax(0,1fr); gap: 15px; }
          .dz-setup-empty-intro h2, .dz-integration-intro h2 { max-width: 100%; }
          .dz-integration-source-grid { grid-template-columns: minmax(0,1fr); }
        }
        @media (max-width: 640px) {
          .dz-always-guide { align-items: flex-start; gap: 9px; margin: -24px -16px 22px; padding: 10px 16px; }
          .dz-always-guide-mark { width: 30px; height: 30px; flex-basis: 30px; border-radius: 9px; }
          .dz-always-guide-copy strong { font-size: 11px; }
          .dz-always-guide-copy span { font-size: 10px; }
          .dz-always-guide > button { padding: 8px 9px; min-height: 32px; font-size: 10px; }
          .dz-setup-empty { border-radius: 16px; padding: 20px 17px; }
          .dz-setup-empty-intro h2, .dz-integration-intro h2 { font-size: 23px; }
          .dz-setup-step { grid-template-columns: 32px minmax(0,1fr) 16px; gap: 9px; padding: 13px 0; }
          .dz-setup-step-no { width: 30px; height: 30px; }
          .dz-integration-question { padding: 18px 14px 20px; border-radius: 14px; }
          .dz-integration-choice-grid { grid-template-columns: minmax(0,1fr); }
          .dz-integration-choice { padding: 12px; }
          .dz-guide-step-panel { padding: 17px 13px; border-radius: 14px; }
          .dz-copy-field { align-items: stretch; flex-direction: column; }
          .dz-copy-field button { align-self: flex-start; }
          .dz-agent-prompt-head { align-items: flex-start; flex-direction: column; }
          .dz-integration-reset-row { align-items: flex-start; flex-direction: column; }
          .dz-other-integration-row { align-items: flex-start; flex-wrap: wrap; }
          .dz-other-integration-row code { flex-basis: calc(100% - 50px); order: 3; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dz-integration-results { animation: none; }
          .dz-always-guide > button, .dz-setup-step-arrow, .dz-integration-choice { transition: none; }
        }

        /* Guided integration: only two questions first, then the detailed guide reveals upward. */
        .dz-integration-questions {
          max-height: 1800px;
          opacity: 1;
          transform: translateY(0);
          overflow: hidden;
          transition: max-height .68s cubic-bezier(.2,.65,.25,1), opacity .48s ease, transform .68s cubic-bezier(.2,.65,.25,1), margin .68s ease;
        }
        .dz-integration-questions.is-complete {
          max-height: 0;
          opacity: 0;
          transform: translateY(-18px);
          margin-block: 0;
          pointer-events: none;
        }
        .dz-integration-results-enter { animation: dz-guide-fade-up .68s cubic-bezier(.2,.65,.25,1) both; }
        @keyframes dz-guide-fade-up { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .dz-integration-question { padding: 25px 28px; margin: 0 0 18px; border: 1px solid rgba(39,52,45,.12); border-radius: 20px; background: rgba(255,255,252,.78); }
        .dz-integration-question-head { display: flex; align-items: flex-start; gap: 17px; margin-bottom: 20px; }
        .dz-integration-question-head h3 { margin: 0 0 6px; font-size: clamp(19px,2vw,25px); font-weight: 850; letter-spacing: -.035em; }
        .dz-integration-question-head p { margin: 0; color: var(--ink-muted); font-size: 12px; line-height: 1.8; }
        .dz-integration-step { display: grid; place-items: center; width: 43px; height: 43px; flex: 0 0 43px; border-radius: 14px; background: #e9eee5; color: #344a39; font-size: 12px; font-weight: 900; }
        .dz-integration-choice-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
        .dz-integration-source-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
        .dz-integration-choice { display: flex; align-items: center; gap: 13px; min-width: 0; min-height: 84px; padding: 17px; border: 1px solid rgba(39,52,45,.13); border-radius: 14px; background: #fffefa; color: var(--ink-main); text-align: right; cursor: pointer; transition: border-color .22s ease, background .22s ease, transform .22s ease; }
        .dz-integration-choice:hover { transform: translateY(-2px); border-color: #8fa58b; }
        .dz-integration-choice.is-selected { border-color: #607a61; background: #f0f4ed; box-shadow: inset 0 0 0 1px rgba(96,122,97,.18); }
        .dz-integration-choice > span:nth-child(2) { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; }
        .dz-integration-choice strong { font-size: 13px; font-weight: 850; }
        .dz-integration-choice small { color: var(--ink-muted); font-size: 10px; line-height: 1.6; }
        .dz-integration-choice-symbol { display: grid; place-items: center; width: 39px; height: 39px; flex: 0 0 39px; border-radius: 12px; background: #f0f2ed; color: #3c5441; font-size: 18px; font-weight: 900; }
        .dz-integration-choice-symbol svg { width: 19px; height: 19px; }
        .dz-choice-check { display: grid; place-items: center; width: 23px; height: 23px; flex: 0 0 23px; border: 1px solid rgba(39,52,45,.18); border-radius: 50%; color: #536c55; font-weight: 900; }
        .dz-carrier-picker { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 8px 14px; margin-top: 17px; padding-top: 16px; border-top: 1px solid rgba(39,52,45,.1); }
        .dz-carrier-picker label { font-size: 11px; font-weight: 800; }
        .dz-carrier-picker select { width: 100%; min-height: 40px; padding: 8px 11px; border: 1px solid rgba(39,52,45,.18); border-radius: 10px; background: #fffefa; color: var(--ink-main); font: inherit; font-size: 11px; }
        .dz-carrier-picker p { grid-column: 2; margin: 0; color: var(--ink-muted); font-size: 10px; line-height: 1.7; }
        .dz-billing-pricing { margin: 0 0 28px; }
        .dz-billing-pricing-head { margin-bottom: 16px; }
        .dz-billing-pricing-head h3 { margin: 5px 0; font-size: 19px; font-weight: 850; }
        .dz-billing-pricing-head p { margin: 0; color: var(--ink-muted); font-size: 11px; }
        .dz-billing-plan-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 24px; border-top: 1px solid var(--border-soft); }
        .dz-billing-plan { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 9px 14px; padding: 17px 0; border-bottom: 1px solid var(--border-soft); }
        .dz-billing-plan > div { display: flex; flex-direction: column; gap: 4px; }
        .dz-billing-plan strong { font-size: 13px; font-weight: 850; }
        .dz-billing-plan small { color: var(--ink-muted); font-size: 10px; font-weight: 500; }
        .dz-billing-plan b { text-align: left; font-size: 17px; font-weight: 900; white-space: nowrap; }
        .dz-billing-plan > span { color: #536b55; font-size: 10px; font-weight: 800; }
        .dz-billing-plan button { justify-self: start; padding: 7px 10px; border: 1px solid rgba(39,52,45,.17); border-radius: 8px; background: transparent; color: #344a39; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
        .dz-billing-plan.is-current { background: rgba(226,235,220,.32); }
        @media (max-width: 760px) {
          .dz-integration-question { padding: 19px 15px; border-radius: 15px; }
          .dz-integration-choice-grid, .dz-integration-source-grid { grid-template-columns: minmax(0,1fr); }
          .dz-integration-choice { min-height: 72px; padding: 13px; }
          .dz-carrier-picker { grid-template-columns: minmax(0,1fr); }
          .dz-carrier-picker p { grid-column: 1; }
          .dz-billing-plan-list { grid-template-columns: minmax(0,1fr); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dz-integration-questions, .dz-integration-results-enter { animation: none !important; transition: none !important; }
        }
        .dz-support-copy {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 13px;
          padding: 8px 0;
          border: 0;
          background: transparent;
          color: #48654e;
          font: inherit;
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
        }
        .dz-support-copy svg { width: 14px; height: 14px; }
        @keyframes dz-tab-fade-up { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        .dz-main > div:not(.dz-toast) { animation: dz-tab-fade-up .52s cubic-bezier(.2,.65,.25,1) both; }
        .dz-main > header { animation: dz-tab-fade-up .45s cubic-bezier(.2,.65,.25,1) both; }
        .dz-mobile-menu-toggle { display:none; align-items:center; justify-content:center; gap:5px; width:42px; height:42px; flex:0 0 42px; padding:0; border:1px solid var(--border-soft); border-radius:12px; background:rgba(255,254,250,.88); color:var(--ink-main); cursor:pointer; }
        .dz-mobile-menu-toggle span { display:block; width:17px; height:1.7px; border-radius:2px; background:currentColor; transition:transform .32s cubic-bezier(.2,.65,.25,1),opacity .25s ease; }
        .dz-mobile-menu-toggle { flex-direction:column; }
        .dz-mobile-menu-toggle.is-open span:first-child { transform:translateY(6.7px) rotate(45deg); }
        .dz-mobile-menu-toggle.is-open span:nth-child(2) { opacity:0; }
        .dz-mobile-menu-toggle.is-open span:last-child { transform:translateY(-6.7px) rotate(-45deg); }
        .dz-billing-plan-list { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
        .dz-billing-plan { display:flex; flex-direction:column; align-items:stretch; min-width:0; min-height:190px; padding:18px 15px; border:1px solid var(--border-soft); border-radius:16px; background:rgba(255,254,250,.76); gap:11px; transition:opacity .3s ease,transform .35s cubic-bezier(.2,.65,.25,1),border-color .3s ease,background .3s ease; }
        .dz-billing-plan > div { min-height:48px; }
        .dz-billing-plan b { text-align:right; font-size:23px; }
        .dz-billing-plan b small { display:block; margin-top:3px; font-size:10px; font-weight:600; color:var(--ink-muted); }
        .dz-billing-plan > span { margin-top:auto; }
        .dz-billing-plan button { width:100%; min-height:37px; justify-self:stretch; }
        .dz-billing-plan.is-current { border-color:#82987d; background:#f0f4ed; }
        .dz-billing-plan.is-selected { border-color:#294b37; background:#eaf0e6; transform:translateY(-3px); box-shadow:inset 0 0 0 1px rgba(41,75,55,.12); }
        .dz-billing-plan-benefit { color:var(--ink-muted); font-size:10px; line-height:1.7; }
        .dz-billing-selected-summary { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:17px; padding:15px 17px; border-inline-start:3px solid #d57955; background:rgba(238,241,233,.7); border-radius:0 12px 12px 0; }
        .dz-billing-selected-summary strong { display:block; margin-bottom:4px; font-size:12px; }
        .dz-billing-selected-summary p { margin:0; color:var(--ink-muted); font-size:10px; line-height:1.8; }
        .dz-billing-selected-price { flex:0 0 auto; font-size:18px; font-weight:900; white-space:nowrap; }
        .dz-billing-selected-price small { display:block; color:var(--ink-muted); font-size:9px; font-weight:600; text-align:right; }
        .dz-billing-usage-note { margin-top:12px; color:var(--ink-muted); font-size:11px; line-height:1.9; }

        /* Subscription Warning Banner */
        .dz-sub-alert-banner { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; padding:16px 20px; border-radius:14px; font-size:13px; animation:dz-tab-fade-up .4s ease; }
        .dz-sub-alert-banner.is-expired { background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }
        .dz-sub-alert-banner.is-limit { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
        .dz-sub-alert-banner.is-suspended { background:#450a0a; border:1px solid #7f1d1d; color:#fef2f2; }
        .dz-sub-alert-btn { padding:8px 16px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; border:none; white-space:nowrap; transition:all .2s; }
        .dz-sub-alert-banner.is-expired .dz-sub-alert-btn { background:#dc2626; color:#fff; }
        .dz-sub-alert-banner.is-limit .dz-sub-alert-btn { background:#d97706; color:#fff; }
        .dz-sub-alert-banner.is-suspended .dz-sub-alert-btn { background:#ef4444; color:#fff; }

        /* Unlimited Plan Status Card (TajerTrack Identity) */
        .dz-unlimited-card { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; padding:18px 22px; border-radius:14px; background:#fffefa; border:1px solid var(--border-soft); border-inline-start:4px solid #263b30; }
        .dz-unlimited-card-content { flex:1; }
        .dz-unlimited-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
        .dz-unlimited-badge { display:inline-flex; align-items:center; gap:5px; background:#263b30; color:#fff; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; }
        .dz-unlimited-badge svg { width:12px; height:12px; }
        .dz-unlimited-pill { display:inline-flex; align-items:center; gap:4px; background:#f0f4ef; color:#263b30; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; border:1px solid rgba(38, 59, 48, 0.12); }
        .dz-unlimited-pill svg { width:11px; height:11px; }
        .dz-unlimited-title { margin:0 0 4px; font-size:14px; font-weight:750; color:#202824; }
        .dz-unlimited-desc { margin:0; font-size:12px; line-height:1.6; color:var(--ink-muted); }
        .dz-unlimited-aside { flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px 18px; background:#f7f8f5; border:1px solid var(--border-soft); border-radius:10px; min-width:110px; text-align:center; }
        .dz-unlimited-symbol { font-size:26px; font-weight:800; color:#263b30; line-height:1; }
        .dz-unlimited-symbol-label { font-size:10px; font-weight:600; color:var(--ink-muted); margin-top:4px; }
        .dz-unlimited-stat-tag { font-size:10px; font-weight:700; padding:3px 8px; background:#f0f4ef; color:#263b30; border-radius:6px; border:1px solid rgba(38, 59, 48, 0.15); display:inline-flex; align-items:center; gap:4px; }
        .dz-unlimited-progress-track { width:100%; height:8px; background:#f0f4ef; border-radius:999px; overflow:hidden; }
        .dz-unlimited-progress-fill { width:100%; height:100%; background:#263b30; border-radius:999px; }
        .dz-billing-next-cycle-banner { display:flex; flex-direction:column; gap:6px; padding:16px 18px; border-radius:12px; background:#f7f9f6; border:1px solid #dce4dc; border-inline-start:4px solid #263b30; margin-bottom:20px; }
        .dz-billing-next-cycle-banner strong { font-size:13px; color:#202824; }
        .dz-billing-next-cycle-banner p { margin:0; font-size:12px; line-height:1.6; color:var(--ink-muted); }
        .dz-active-plan-card { padding:20px 22px; border-radius:14px; background:#fffefa; border:1px solid var(--border-soft); margin-top:24px; }

        /* Guided Integrations */
        .dz-int-guided { display:flex; flex-direction:column; gap:18px; max-width:980px; margin:0 auto; }
        .dz-int-guided-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
        .dz-int-guided-heading h2 { margin:4px 0 6px; color:var(--ink-main); font-size:22px; font-weight:850; letter-spacing:-.03em; }
        .dz-int-guided-heading p { margin:0; color:var(--ink-muted); font-size:12px; line-height:1.8; }
        .dz-int-guided-reset { display:inline-flex; align-items:center; gap:7px; flex:0 0 auto; padding:9px 12px; border:1px solid var(--border-strong); border-radius:10px; background:var(--surface); color:var(--ink-muted); font:inherit; font-size:11px; font-weight:750; cursor:pointer; }
        .dz-int-guided-reset svg { width:15px; height:15px; }
        .dz-int-guided-card, .dz-int-guided-panel { background:var(--surface); border:1px solid var(--border-soft); border-radius:17px; padding:22px; box-shadow:var(--shadow-sm); }
        .dz-int-guided-loading { padding:24px; border:1px solid var(--border-soft); border-radius:14px; background:var(--surface); color:var(--ink-muted); font-size:12px; text-align:center; }
        .dz-int-guided-progress { display:flex; gap:6px; margin-bottom:17px; }
        .dz-int-guided-progress span { height:4px; flex:1; border-radius:99px; background:#e8ebe6; }
        .dz-int-guided-progress span.is-active, .dz-int-guided-progress span.is-done { background:#3c6548; }
        .dz-int-guided-step-label { margin-bottom:5px; color:#59725c; font-size:10px; font-weight:850; }
        .dz-int-guided-card h3 { margin:0; color:var(--ink-main); font-size:19px; font-weight:850; letter-spacing:-.025em; }
        .dz-int-guided-help { margin:6px 0 17px; color:var(--ink-muted); font-size:12px; line-height:1.8; }
        .dz-int-guided-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .dz-int-guided-option { position:relative; display:flex; align-items:center; gap:11px; min-width:0; min-height:82px; padding:13px; border:1px solid var(--border-strong); border-radius:13px; background:var(--surface); color:var(--ink-main); text-align:right; cursor:pointer; transition:border-color .18s ease, background .18s ease, transform .18s ease; }
        .dz-int-guided-option:hover { border-color:#819783; transform:translateY(-1px); }
        .dz-int-guided-option.is-selected { border-color:#59775e; background:#f1f5ef; box-shadow:inset 0 0 0 1px rgba(75,109,80,.12); }
        .dz-int-guided-option-icon { display:grid; place-items:center; width:37px; height:37px; flex:0 0 37px; border-radius:10px; background:#eef2ec; color:#3f6248; }
        .dz-int-guided-option-icon svg { width:19px; height:19px; }
        .dz-int-guided-option > span:nth-child(2) { display:flex; flex:1; min-width:0; flex-direction:column; gap:4px; }
        .dz-int-guided-option strong { font-size:12px; font-weight:850; }
        .dz-int-guided-option small { color:var(--ink-muted); font-size:10px; line-height:1.55; }
        .dz-int-guided-radio { width:17px; height:17px; flex:0 0 17px; border:1.5px solid #aeb8ad; border-radius:50%; }
        .dz-int-guided-option.is-selected .dz-int-guided-radio { border:5px solid #49694e; background:#fff; }
        .dz-int-guided-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:18px; padding-top:14px; border-top:1px solid var(--border-soft); }
        .dz-int-guided-actions > span { color:var(--ink-muted); font-size:10px; }
        .dz-int-guided-actions .dz-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:8px 15px; }
        .dz-int-guided-actions svg { width:15px; height:15px; }
        .dz-int-guided-completed { display:flex; align-items:center; gap:9px; margin-bottom:18px; padding:10px 12px; border:1px solid var(--border-soft); border-radius:10px; background:#f7f9f5; font-size:11px; }
        .dz-int-guided-completed > span { display:inline-flex; align-items:center; gap:5px; color:var(--ink-muted); }
        .dz-int-guided-completed svg { width:14px; height:14px; color:#42714d; }
        .dz-int-guided-completed strong { color:var(--ink-main); }
        .dz-int-guided-completed button, .dz-int-guided-summary button { margin-inline-start:auto; border:0; background:transparent; color:#42664a; font:inherit; font-size:10px; font-weight:800; cursor:pointer; }
        .dz-int-guided-carrier-select { display:grid; grid-template-columns:150px minmax(0,1fr); align-items:center; gap:12px; margin-top:13px; padding:13px; border:1px solid var(--border-soft); border-radius:11px; background:#f8faf7; }
        .dz-int-guided-carrier-select label { font-size:11px; font-weight:800; }
        .dz-int-guided-carrier-select select { min-height:39px; padding:8px 10px; border:1px solid var(--border-strong); border-radius:9px; background:#fff; color:var(--ink-main); font:inherit; font-size:11px; }
        .dz-int-guided-result { display:flex; flex-direction:column; gap:12px; animation:dz-tab-fade-up .3s ease both; }
        .dz-int-guided-result-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; padding:0 2px 3px; }
        .dz-int-guided-result-head h3 { margin:4px 0; color:var(--ink-main); font-size:20px; font-weight:850; }
        .dz-int-guided-result-head p { margin:0; color:var(--ink-muted); font-size:11px; line-height:1.7; }
        .dz-int-guided-ready { display:inline-flex; align-items:center; gap:5px; padding:6px 9px; white-space:nowrap; border-radius:7px; background:#edf4ed; color:#42664a; font-size:10px; font-weight:800; }
        .dz-int-guided-ready svg { width:13px; height:13px; }
        .dz-int-guided-summary { display:flex; align-items:center; gap:22px; padding:12px 14px; border:1px solid var(--border-soft); border-radius:11px; background:rgba(255,255,255,.65); }
        .dz-int-guided-summary span { display:flex; flex-direction:column; gap:3px; }
        .dz-int-guided-summary small { color:var(--ink-muted); font-size:9px; }
        .dz-int-guided-summary strong { color:var(--ink-main); font-size:11px; }
        .dz-int-guided-panel { display:flex; flex-direction:column; gap:13px; }
        .dz-int-guided-panel-title { display:flex; align-items:flex-start; gap:11px; }
        .dz-int-guided-number { display:grid; place-items:center; width:31px; height:31px; flex:0 0 31px; border-radius:9px; background:#edf2eb; color:#3f6248; font-size:10px; font-weight:900; }
        .dz-int-guided-panel-title h4 { margin:0 0 4px; color:var(--ink-main); font-size:14px; font-weight:850; }
        .dz-int-guided-panel-title p { margin:0; color:var(--ink-muted); font-size:11px; line-height:1.8; }
        .dz-int-guided-copy { display:flex; align-items:center; gap:10px; min-width:0; padding:10px; border:1px solid var(--border-soft); border-radius:10px; background:#f7f9f6; }
        .dz-int-guided-copy > div { display:flex; flex:1; flex-direction:column; min-width:0; gap:5px; }
        .dz-int-guided-copy small { color:var(--ink-muted); font-size:9px; }
        .dz-int-guided-copy code, .dz-int-guided-credential code, .dz-int-guided-meta code { display:block; overflow:auto; color:#35463a; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:10px; line-height:1.7; direction:ltr; text-align:left; white-space:nowrap; }
        .dz-int-guided-copy button, .dz-int-guided-copy-link, .dz-int-guided-agent-row button { display:inline-flex; align-items:center; justify-content:center; gap:6px; flex:0 0 auto; padding:8px 10px; border:1px solid rgba(57,91,64,.18); border-radius:8px; background:#fff; color:#42664a; font:inherit; font-size:10px; font-weight:800; cursor:pointer; }
        .dz-int-guided-copy button svg, .dz-int-guided-copy-link svg, .dz-int-guided-agent-row button svg { width:13px; height:13px; }
        .dz-int-guided-steps { display:grid; gap:8px; margin:0; padding-inline-start:22px; color:var(--ink-main); font-size:11px; line-height:1.8; }
        .dz-int-guided-steps li { padding-inline-start:4px; }
        .dz-int-guided-note { margin:0; padding:10px 12px; border-inline-start:3px solid #91a58f; border-radius:7px; background:#f3f6f1; color:#56675a; font-size:10px; line-height:1.8; }
        .dz-int-guided-credentials { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
        .dz-int-guided-credential { display:flex; flex-direction:column; gap:8px; min-width:0; padding:12px; border:1px solid var(--border-soft); border-radius:10px; background:#f8faf7; }
        .dz-int-guided-credential:last-child { grid-column:1 / -1; }
        .dz-int-guided-credential-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .dz-int-guided-credential-head small { color:var(--ink-muted); font-size:10px; font-weight:800; }
        .dz-int-guided-credential-head button { display:inline-flex; align-items:center; gap:5px; border:0; background:transparent; color:#42664a; font:inherit; font-size:10px; cursor:pointer; }
        .dz-int-guided-credential-head button svg { width:13px; height:13px; }
        .dz-int-guided-recommended { display:flex; flex-direction:column; gap:11px; padding:15px; border:1px solid #dce6da; border-radius:12px; background:#f5f8f3; }
        .dz-int-guided-recommended h4 { margin:3px 0; color:var(--ink-main); font-size:13px; font-weight:850; }
        .dz-int-guided-recommended p { margin:0; color:var(--ink-muted); font-size:10px; line-height:1.7; }
        .dz-int-guided-package-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:9px; }
        .dz-int-guided-package-select { display:flex; gap:3px; }
        .dz-int-guided-package-select button { padding:6px 8px; border:1px solid var(--border-strong); border-radius:6px; background:#fff; color:var(--ink-muted); font:inherit; font-size:9px; cursor:pointer; }
        .dz-int-guided-package-select button.is-active { background:#273b30; border-color:#273b30; color:#fff; }
        .dz-int-guided-package-row > code, .dz-int-guided-agent-row > code { overflow:auto; padding:9px 10px; border:1px solid var(--border-soft); border-radius:7px; background:#fff; color:#34483a; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:10px; direction:ltr; text-align:left; white-space:nowrap; }
        .dz-int-guided-package-row > button { display:inline-flex; align-items:center; gap:5px; padding:8px 10px; border:0; border-radius:7px; background:#273b30; color:#fff; font:inherit; font-size:10px; font-weight:800; cursor:pointer; }
        .dz-int-guided-package-row > button svg { width:13px; height:13px; }
        .dz-int-guided-agent-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; }
        .dz-int-guided-details { border:1px solid var(--border-soft); border-radius:11px; background:var(--surface); padding:0 13px; }
        .dz-int-guided-details summary { padding:13px 0; color:var(--ink-main); font-size:11px; font-weight:850; cursor:pointer; }
        .dz-int-guided-details > p { margin:0 0 12px; color:var(--ink-muted); font-size:10px; line-height:1.8; }
        .dz-int-guided-details .dz-code-container { margin:0 0 12px; }
        .dz-int-guided-doc-link { margin:0 0 12px; font-size:10px; }
        .dz-int-guided-doc-link a { color:#42664a; font-weight:800; text-decoration:underline; }
        .dz-int-guided-meta { display:grid; grid-template-columns:110px minmax(0,1fr); gap:7px 12px; padding:10px 12px; border-radius:9px; background:#f7f9f6; font-size:10px; }
        .dz-int-guided-meta span { color:var(--ink-muted); }
        .dz-int-guided-meta strong { color:var(--ink-main); }
        .dz-int-guided-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:10px 2px; color:var(--ink-muted); font-size:10px; }
        .dz-int-guided-footer button { border:0; background:transparent; color:#42664a; font:inherit; font-size:10px; font-weight:850; cursor:pointer; }
        .dz-int-guided-manual .dz-btn { align-self:flex-start; display:inline-flex; align-items:center; gap:7px; }
        .dz-int-guided-manual .dz-btn svg { width:15px; height:15px; }
        @media (max-width: 760px) {
          .dz-int-guided-heading, .dz-int-guided-result-head { flex-direction:column; }
          .dz-int-guided-options { grid-template-columns:minmax(0,1fr); }
          .dz-int-guided-option { min-height:68px; }
          .dz-int-guided-actions { flex-wrap:wrap; }
          .dz-int-guided-actions .dz-btn { margin-inline-start:auto; }
          .dz-int-guided-carrier-select { grid-template-columns:minmax(0,1fr); }
          .dz-int-guided-summary { align-items:flex-start; flex-direction:column; gap:8px; }
          .dz-int-guided-summary button { margin-inline-start:0; }
          .dz-int-guided-credentials { grid-template-columns:minmax(0,1fr); }
          .dz-int-guided-credential:last-child { grid-column:auto; }
          .dz-int-guided-package-row { grid-template-columns:minmax(0,1fr); }
          .dz-int-guided-agent-row { grid-template-columns:minmax(0,1fr); }
          .dz-int-guided-copy { align-items:stretch; flex-direction:column; }
          .dz-int-guided-copy button { align-self:flex-start; }
        }
        /* Integrations: readable type scale */
        .dz-int-guided-heading h2 { font-size: clamp(25px, 2.3vw, 29px); line-height: 1.35; }
        .dz-int-guided-heading p { font-size: 15px; line-height: 1.85; }
        .dz-int-guided-reset { font-size: 13px; min-height: 42px; padding: 10px 14px; }
        .dz-int-guided-loading { font-size: 15px; padding: 28px; }
        .dz-int-guided-step-label { font-size: 12px; }
        .dz-int-guided-card h3 { font-size: 23px; line-height: 1.45; }
        .dz-int-guided-help { font-size: 15px; line-height: 1.85; margin-bottom: 20px; }
        .dz-int-guided-option { min-height: 92px; padding: 16px; gap: 13px; }
        .dz-int-guided-option-icon { width: 42px; height: 42px; flex-basis: 42px; }
        .dz-int-guided-option-icon svg { width: 21px; height: 21px; }
        .dz-int-guided-option strong { font-size: 15px; line-height: 1.5; }
        .dz-int-guided-option small { font-size: 13px; line-height: 1.7; }
        .dz-int-guided-actions > span { font-size: 13px; line-height: 1.6; }
        .dz-int-guided-actions .dz-btn { min-height: 44px; padding: 10px 17px; font-size: 14px; }
        .dz-int-guided-completed { font-size: 13px; gap: 11px; padding: 12px 14px; }
        .dz-int-guided-completed strong { font-size: 14px; }
        .dz-int-guided-completed button, .dz-int-guided-summary button { font-size: 13px; }
        .dz-int-guided-carrier-select { grid-template-columns: 170px minmax(0,1fr); padding: 15px; }
        .dz-int-guided-carrier-select label { font-size: 14px; }
        .dz-int-guided-carrier-select select { min-height: 44px; font-size: 14px; padding: 10px 12px; }
        .dz-int-guided-result-head h3 { font-size: 25px; line-height: 1.4; }
        .dz-int-guided-result-head p { font-size: 14px; line-height: 1.85; }
        .dz-int-guided-ready { font-size: 12px; padding: 7px 10px; }
        .dz-int-guided-summary { gap: 26px; padding: 15px 17px; }
        .dz-int-guided-summary small { font-size: 12px; }
        .dz-int-guided-summary strong { font-size: 14px; }
        .dz-int-guided-panel-title h4 { font-size: 17px; line-height: 1.5; }
        .dz-int-guided-panel-title p { font-size: 14px; line-height: 1.85; }
        .dz-int-guided-number { font-size: 12px; width: 34px; height: 34px; flex-basis: 34px; }
        .dz-int-guided-copy small { font-size: 12px; }
        .dz-int-guided-copy code, .dz-int-guided-credential code, .dz-int-guided-meta code { font-size: 12px; line-height: 1.8; }
        .dz-int-guided-copy button, .dz-int-guided-copy-link, .dz-int-guided-agent-row button { min-height: 38px; padding: 9px 12px; font-size: 13px; }
        .dz-int-guided-steps { font-size: 14px; line-height: 1.95; gap: 10px; }
        .dz-int-guided-note { font-size: 13px; line-height: 1.9; padding: 12px 14px; }
        .dz-int-guided-credential { padding: 14px; gap: 10px; }
        .dz-int-guided-credential-head small { font-size: 13px; }
        .dz-int-guided-credential-head button { font-size: 13px; }
        .dz-int-guided-recommended { padding: 17px; gap: 13px; }
        .dz-int-guided-recommended h4 { font-size: 17px; }
        .dz-int-guided-recommended p { font-size: 13px; line-height: 1.85; }
        .dz-int-guided-package-select button { font-size: 12px; padding: 7px 9px; }
        .dz-int-guided-package-row > code, .dz-int-guided-agent-row > code { font-size: 12px; padding: 10px 11px; }
        .dz-int-guided-package-row > button { min-height: 39px; font-size: 12px; padding: 9px 12px; }
        .dz-int-guided-details summary { font-size: 14px; padding: 15px 0; }
        .dz-int-guided-details > p { font-size: 13px; line-height: 1.9; }
        .dz-int-guided-doc-link { font-size: 13px; }
        .dz-int-guided-meta { font-size: 13px; grid-template-columns: 125px minmax(0,1fr); padding: 12px 14px; }
        .dz-int-guided-footer { font-size: 12px; line-height: 1.7; }
        .dz-int-guided-footer button { font-size: 13px; }
        @media (max-width: 760px) {
          .dz-int-guided-heading h2 { font-size: 25px; }
          .dz-int-guided-heading p { font-size: 14px; }
          .dz-int-guided-card h3 { font-size: 21px; }
          .dz-int-guided-help { font-size: 14px; }
          .dz-int-guided-option { min-height: 78px; padding: 14px; }
          .dz-int-guided-option strong { font-size: 15px; }
          .dz-int-guided-option small { font-size: 13px; }
          .dz-int-guided-actions > span { font-size: 12px; }
          .dz-int-guided-carrier-select { grid-template-columns: minmax(0,1fr); }
          .dz-int-guided-carrier-select label, .dz-int-guided-carrier-select select { font-size: 14px; }
          .dz-int-guided-result-head h3 { font-size: 23px; }
          .dz-int-guided-result-head p { font-size: 13px; }
          .dz-int-guided-summary { gap: 10px; }
          .dz-int-guided-panel-title h4 { font-size: 16px; }
          .dz-int-guided-panel-title p { font-size: 13px; }
          .dz-int-guided-copy code, .dz-int-guided-credential code, .dz-int-guided-meta code { font-size: 11.5px; }
          .dz-int-guided-steps { font-size: 13px; }
          .dz-int-guided-meta { grid-template-columns: 105px minmax(0,1fr); font-size: 12px; }
        }

        /* Integration Hub */
        .dz-int-hub { display:flex; flex-direction:column; gap:24px; }
        .dz-int-creds-card { background:rgba(255,254,250,.95); border:1px solid var(--border-soft); border-radius:18px; padding:22px 24px; box-shadow:0 4px 20px rgba(0,0,0,.03); }
        .dz-int-creds-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; gap:12px; flex-wrap:wrap; }
        .dz-int-creds-title { display:flex; align-items:center; gap:10px; }
        .dz-int-creds-title h2 { margin:0; font-size:16px; font-weight:800; }
        .dz-int-creds-badge { font-size:11px; padding:3px 8px; border-radius:6px; background:rgba(39,52,45,.08); color:#27342d; font-weight:600; }
        .dz-int-creds-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }
        .dz-int-field-box { background:#f7f8f5; border:1px solid rgba(0,0,0,.06); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:6px; }
        .dz-int-field-label { font-size:11px; color:var(--ink-muted); font-weight:700; display:flex; align-items:center; justify-content:space-between; }
        .dz-int-field-row { display:flex; align-items:center; gap:8px; }
        .dz-int-field-code { flex:1; font-family:monospace; font-size:12px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid rgba(0,0,0,.08); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; direction:ltr; text-align:left; }
        .dz-int-nav { display:flex; gap:8px; border-bottom:2px solid rgba(0,0,0,.06); padding-bottom:8px; flex-wrap:wrap; }
        .dz-int-nav-btn { display:inline-flex; align-items:center; gap:8px; padding:9px 16px; border-radius:10px; border:1px solid transparent; background:transparent; font:inherit; font-size:13px; font-weight:700; color:var(--ink-muted); cursor:pointer; transition:all .2s ease; }
        .dz-int-nav-btn:hover { background:rgba(0,0,0,.03); color:var(--ink-main); }
        .dz-int-nav-btn.active { background:#27342d; color:#fff; }
        .dz-int-panel { display:flex; flex-direction:column; gap:20px; animation:dz-tab-fade-up .35s ease; }
        .dz-features-badges { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
        .dz-feature-pill { display:flex; align-items:flex-start; gap:10px; background:rgba(255,255,250,.85); border:1px solid var(--border-soft); border-radius:12px; padding:12px 14px; }
        .dz-feature-pill-icon { width:32px; height:32px; border-radius:8px; background:#eef2eb; color:#27342d; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .dz-code-container { background:#181f1b; border-radius:14px; overflow:hidden; border:1px solid #28342c; box-shadow:0 10px 30px rgba(0,0,0,.2); }
        .dz-code-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#111613; border-bottom:1px solid #243027; flex-wrap:wrap; gap:8px; }
        .dz-code-tabs { display:flex; gap:4px; flex-wrap:wrap; }
        .dz-code-tab-btn { background:transparent; border:0; color:#8b9990; font-family:inherit; font-size:12px; font-weight:700; padding:6px 12px; border-radius:6px; cursor:pointer; transition:all .15s; }
        .dz-code-tab-btn.active { background:#27342d; color:#fff; }
        .dz-code-pre { margin:0; padding:18px 20px; font-family:'Fira Code','JetBrains Mono',Consolas,monospace; font-size:13px; line-height:1.7; color:#d1dcd4; overflow-x:auto; direction:ltr; text-align:left; }
        .dz-carriers-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }
        .dz-carrier-card { background:rgba(255,254,250,.95); border:1px solid var(--border-soft); border-radius:16px; padding:18px 20px; display:flex; flex-direction:column; gap:12px; transition:transform .2s,box-shadow .2s; }
        .dz-carrier-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.06); }
        .dz-carrier-card-head { display:flex; align-items:center; justify-content:space-between; }
        .dz-carrier-name { font-size:15px; font-weight:800; color:var(--ink-main); }
        .dz-carrier-status-tag { font-size:11px; font-weight:700; padding:3px 8px; border-radius:6px; background:#e6f4ea; color:#137333; }
        .dz-carrier-hint { font-size:12px; color:var(--ink-muted); line-height:1.6; }
        .dz-table-container { overflow-x:auto; border-radius:14px; border:1px solid var(--border-soft); background:#fff; }
        .dz-data-table { width:100%; border-collapse:collapse; font-size:12px; text-align:right; }
        .dz-data-table th, .dz-data-table td { padding:12px 14px; border-bottom:1px solid var(--border-soft); }
        .dz-data-table th { background:#f7f9f6; font-weight:800; color:#27342d; }
        .dz-data-table code { font-family:monospace; background:#eef2ed; color:#27342d; padding:2px 6px; border-radius:4px; font-size:11px; direction:ltr; display:inline-block; }

        .dz-mobile-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1290;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          animation: dzFadeIn 0.2s ease-out;
        }
        @keyframes dzFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (max-width: 1024px) {
          .dz-sidebar {
            position: fixed;
            top: 76px;
            right: 16px;
            width: min(320px, calc(100vw - 32px));
            height: auto;
            max-height: calc(100dvh - 90px);
            overflow-y: auto;
            border: 1px solid var(--border-soft);
            border-radius: 18px;
            padding: 18px;
            box-shadow: 0 22px 70px rgba(32, 40, 36, 0.16);
            display: flex;
            flex-direction: column;
            visibility: hidden;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-9px);
            transition: opacity 0.3s ease, transform 0.38s cubic-bezier(0.2, 0.65, 0.25, 1), visibility 0.3s ease;
            z-index: 1300 !important;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .dz-sidebar::-webkit-scrollbar { display: none; width: 0; height: 0; }
          .dz-sidebar.dz-mobile-nav-open { visibility: visible; opacity: 1; pointer-events: auto; transform: translateY(0); }
          .dz-sidebar .dz-brand { margin-bottom: 20px; }
          .dz-sidebar .dz-nav { flex-direction: column; overflow: visible; }
          .dz-sidebar .dz-nav-item { width: 100%; white-space: normal; }
          .dz-sidebar .dz-sidebar-footer { display: flex; }
          .dz-mobile-menu-toggle { display: flex; }

          .dz-header-titles {
            grid-column: 2 !important;
            grid-row: 1 !important;
            min-width: 0 !important;
            align-self: center !important;
          }
          .dz-header-titles h1 {
            margin: 0 !important;
            font-size: clamp(17px, 4vw, 22px) !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            line-height: 1.25 !important;
          }
          .dz-header-titles p {
            display: none !important;
          }

          .dz-header-actions {
            grid-column: 1 / -1 !important;
            grid-row: 2 !important;
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-top: 2px !important;
          }
          .dz-header-actions .dz-search-box {
            flex: 1 1 auto !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 42px !important;
            margin: 0 !important;
            padding: 8px 14px !important;
          }
          .dz-header-actions .dz-add-order-btn {
            flex: 0 0 auto !important;
            height: 42px !important;
            padding: 0 14px !important;
            font-size: 13px !important;
            white-space: nowrap !important;
          }

          .dz-billing-plan-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 560px) {
          .dz-sidebar {
            top: 70px !important;
            right: 10px !important;
            width: calc(100vw - 20px) !important;
            max-height: calc(100dvh - 82px) !important;
          }
          .dz-header-titles h1 {
            font-size: 17px !important;
          }
          .dz-header-actions .dz-search-box {
            height: 40px !important;
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
          .dz-header-actions .dz-add-order-btn {
            height: 40px !important;
            padding: 0 12px !important;
            font-size: 12px !important;
          }
          .dz-header-actions .dz-add-order-btn span {
            font-size: 12px !important;
          }
          .dz-billing-plan-list { grid-template-columns: minmax(0, 1fr); }
          .dz-billing-plan { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; }
          .dz-billing-plan > div { min-height: 0; }
          .dz-billing-plan b { grid-column: 2; grid-row: 1; font-size: 19px; }
          .dz-billing-plan > span, .dz-billing-plan button { grid-column: 1 / -1; }
          .dz-billing-selected-summary { align-items: flex-start; }
          .dz-billing-selected-price { font-size: 15px; }
        }
        @media (prefers-reduced-motion: reduce) { .dz-mobile-menu-toggle span,.dz-sidebar,.dz-billing-plan,.dz-billing-plan-list,.dz-billing-selected-summary,.dz-main > div:not(.dz-toast),.dz-main > header { transition-duration:.01ms!important; animation-duration:.01ms!important; } }
        /* Compact dashboard top edge and a clean, scrollbar-free mobile navigation drawer. */
        .dz-admin-root .dz-main { padding-top: 0 !important; }

        /* UPSELL FEATURE STYLES */
        .dz-upsell-container { display:flex; flex-direction:column; gap:24px; max-width:1100px; padding-bottom:60px; animation:dz-tab-fade-up .35s ease; }
        .dz-upsell-hero-banner { background:linear-gradient(135deg, #18201a 0%, #27342d 100%); border-radius:18px; padding:24px 28px; color:#fff; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; box-shadow:0 10px 30px rgba(0,0,0,0.08); }
        .dz-upsell-hero-text h3 { margin:0 0 6px; font-size:18px; font-weight:850; display:flex; align-items:center; gap:8px; }
        .dz-upsell-hero-text p { margin:0; font-size:13px; color:#d1d5db; line-height:1.6; max-width:620px; }
        .dz-upsell-hero-badge { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; background:rgba(255,255,255,0.12); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.18); border-radius:12px; font-size:12px; font-weight:750; color:#a7f3d0; white-space:nowrap; }
        
        .dz-upsell-form-card { background:#fff; border:1px solid rgba(9,9,11,0.09); border-radius:18px; padding:26px; box-shadow:0 8px 24px rgba(9,9,11,0.03); }
        .dz-upsell-form-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; padding-bottom:14px; border-bottom:1px solid rgba(9,9,11,0.07); flex-wrap:wrap; gap:10px; }
        .dz-upsell-form-head h3 { margin:0; font-size:16px; font-weight:800; color:#111827; display:flex; align-items:center; gap:8px; }
        
        .dz-smart-fetch-box { background:#f8faf8; border:1.5px dashed #27342d40; border-radius:14px; padding:16px 20px; margin-bottom:22px; }
        .dz-smart-fetch-label { display:block; font-size:12px; font-weight:800; color:#27342d; margin-bottom:8px; }
        .dz-smart-fetch-row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .dz-smart-fetch-input { flex:1; min-width:260px; background:#fff; border:1px solid rgba(9,9,11,0.14); border-radius:10px; padding:10px 14px; font-size:13px; font-family:inherit; outline:none; direction:ltr; transition:border-color .15s; }
        .dz-smart-fetch-input:focus { border-color:#27342d; box-shadow:0 0 0 3px rgba(39,52,45,0.12); }
        .dz-smart-fetch-btn { display:inline-flex; align-items:center; gap:6px; background:#27342d; color:#fff; border:none; border-radius:10px; padding:10px 18px; font-size:13px; font-weight:750; cursor:pointer; white-space:nowrap; transition:all 0.2s ease; }
        .dz-smart-fetch-btn:hover:not(:disabled) { opacity:0.92; transform:translateY(-1px); }
        .dz-smart-fetch-btn:disabled { opacity:0.6; cursor:not-allowed; }
        
        .dz-upsell-inputs-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-bottom:18px; }
        .dz-upsell-field { display:flex; flex-direction:column; gap:6px; }
        .dz-upsell-field label { font-size:12px; font-weight:750; color:#374151; }
        .dz-upsell-field small { font-size:11px; color:#6b7280; }
        .dz-upsell-field input { background:#fff; border:1px solid rgba(9,9,11,0.14); border-radius:10px; padding:10px 13px; font-size:13px; font-family:inherit; outline:none; transition:border-color .15s; }
        .dz-upsell-field input:focus { border-color:#27342d; box-shadow:0 0 0 3px rgba(39,52,45,0.1); }
        
        .dz-upsell-preview-thumbnail { width:64px; height:64px; border-radius:10px; object-fit:cover; border:1px solid rgba(9,9,11,0.1); background:#f3f4f6; flex-shrink:0; }
        
        .dz-upsell-list-card { background:#fff; border:1px solid rgba(9,9,11,0.09); border-radius:18px; padding:26px; box-shadow:0 8px 24px rgba(9,9,11,0.03); }
        .dz-upsell-list-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid rgba(9,9,11,0.07); flex-wrap:wrap; gap:10px; }
        .dz-upsell-list-head h3 { margin:0; font-size:16px; font-weight:800; color:#111827; }
        
        .dz-upsell-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
        .dz-upsell-item-card { background:#fcfdfc; border:1px solid rgba(9,9,11,0.09); border-radius:14px; padding:16px; display:flex; flex-direction:column; gap:12px; transition:all 0.2s ease; position:relative; }
        .dz-upsell-item-card:hover { border-color:rgba(39,52,45,0.3); box-shadow:0 6px 20px rgba(0,0,0,0.04); }
        .dz-upsell-item-card.is-inactive { opacity:0.65; background:#f9fafb; }
        .dz-upsell-item-card-top { display:flex; gap:14px; align-items:flex-start; }
        .dz-upsell-item-card-img { width:74px; height:74px; border-radius:10px; object-fit:cover; background:#f3f4f6; border:1px solid rgba(9,9,11,0.08); flex-shrink:0; }
        .dz-upsell-item-card-meta { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
        .dz-upsell-item-card-title { font-size:13.5px; font-weight:800; color:#111827; line-height:1.45; margin:0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .dz-upsell-item-card-price { font-size:12.5px; font-weight:800; color:#059669; }
        .dz-upsell-item-card-noprice { font-size:11px; color:#9ca3af; font-style:italic; }
        .dz-upsell-stats-pills { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .dz-upsell-stat-pill { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:#f4f5f1; border-radius:999px; font-size:12px; color:#4b5563; border:1px solid rgba(9,9,11,0.08); font-weight:700; }
        .dz-upsell-stat-pill b { color:#111827; font-weight:850; }
        .dz-upsell-stat-pill.active { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .dz-upsell-stat-pill.active b { color:#047857; }
        .dz-upsell-order-badge { font-size:11px; font-weight:800; background:#f3f4f6; color:#4b5563; padding:2px 8px; border-radius:6px; border:1px solid rgba(0,0,0,0.06); }
        .dz-upsell-clicks-badge { display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:800; color:#047857; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 9px; border-radius:999px; }
        .dz-upsell-item-card-bottom { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:12px; border-top:1px solid rgba(9,9,11,0.06); flex-wrap:wrap; }
        .dz-upsell-order-controls { display:flex; align-items:center; gap:4px; }
        .dz-upsell-action-btn.reorder-btn { width:28px; height:28px; color:#374151; }
        .dz-upsell-action-btn.reorder-btn:hover:not(:disabled) { background:#f3f4f6; color:#111827; border-color:rgba(9,9,11,0.2); }
        .dz-upsell-action-btn.reorder-btn:disabled { opacity:0.3; cursor:not-allowed; background:#f9fafb; color:#9ca3af; }
        .dz-upsell-toggle-btn { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; padding:6px 11px; border-radius:8px; border:1px solid transparent; cursor:pointer; transition:all 0.15s; }
        .dz-upsell-toggle-btn.active { background:#ecfdf5; color:#047857; border-color:#a7f3d0; }
        .dz-upsell-toggle-btn.inactive { background:#f3f4f6; color:#6b7280; border-color:#e5e7eb; }
        .dz-upsell-action-btns { display:flex; align-items:center; gap:6px; }
        .dz-upsell-action-btn { width:30px; height:30px; border-radius:8px; border:1px solid rgba(9,9,11,0.12); background:#fff; color:#4b5563; display:grid; place-items:center; cursor:pointer; transition:all 0.15s; }
        .dz-upsell-action-btn:hover { background:#f9fafb; color:#111827; }
        .dz-upsell-action-btn.danger:hover { background:#fee2e2; color:#dc2626; border-color:#fca5a5; }

        @media (max-width: 640px) {
          .dz-settings-profile-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}} />

      <div className="dz-admin-root">
        {/* AURORA BG */}
        <div className="dz-aurora">
          <div className="dz-blob dz-blob1" />
          <div className="dz-blob dz-blob2" />
          <div className="dz-blob dz-blob3" />
          <div className="dz-grain" />
        </div>

        {/* SIDEBAR */}
        <aside id="dz-merchant-sidebar" className={`dz-sidebar ${mobileMenuOpen ? 'dz-mobile-nav-open' : ''}`}>
          <div className="dz-brand">
            <div className="dz-avatar-box" style={{ background: brandConfig.brandColor, color: getReadableOnBrand(brandConfig.brandColor), overflow: 'hidden', padding: brandConfig.logoUrl ? '0' : undefined }}>
              {brandConfig.logoUrl ? (
                <img
                  src={toCachedImageUrl(brandConfig.logoUrl)}
                  alt={displayStoreName}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    (e.currentTarget.parentElement as HTMLElement).textContent = displayStoreName.charAt(0);
                  }}
                />
              ) : (
                displayStoreName.charAt(0)
              )}
            </div>
            <div className="dz-brand-text">
              <span className="dz-brand-title">{displayStoreName}</span>
              <span className="dz-brand-badge">Merchant Portal</span>
            </div>
          </div>

          <nav className="dz-nav">
            <button className={`dz-nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Dashboard /></span> نظرة عامة</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setStatusFilter('all'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Box /></span> الطلبات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => { setActiveTab('analytics'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Chart /></span> التحليلات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => { setActiveTab('alerts'); setStatusFilter('alerts'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.AlertTriangle /></span> تنبيهات COD</span>
              {alertCount > 0 && <span className="dz-alert-badge">{alertCount}</span>}
            </button>
            <button className={`dz-nav-item ${activeTab === 'branding' ? 'active' : ''}`} onClick={() => { setActiveTab('branding'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Palette /></span> تصميم صفحة التتبع</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'upsells' ? 'active' : ''}`} onClick={() => { setActiveTab('upsells'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.ShoppingBag /></span> زيادة المبيعات (Upsells)</span>
              {upsellsList.filter((u) => u.is_active).length > 0 && (
                <span className="dz-alert-badge" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                  {upsellsList.filter((u) => u.is_active).length}
                </span>
              )}
            </button>
            <button className={`dz-nav-item ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => { setActiveTab('integrations'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Plug /></span> بوابات الربط</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => { setActiveTab('mappings'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Tag /></span> مسميات الحالات</span>
            </button>
            <button className={`dz-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMobileMenuOpen(false); }}>
              <span style={{ display: 'flex', alignItems: 'center' }}><span className="dz-nav-icon"><Icons.Settings /></span> الإعدادات</span>
            </button>
          </nav>

          <div className="dz-sidebar-footer">
            <form action={logout}>
              <button type="submit" className="dz-nav-item" style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-base)' }}>
                <Icons.LogOut /> <span style={{ marginRight: '8px' }}>تسجيل الخروج</span>
              </button>
            </form>
          </div>
        </aside>

        {/* MOBILE MENU BACKDROP */}
        {mobileMenuOpen && (
          <div
            className="dz-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* MAIN */}
        <main className={`dz-main dz-scrollable ${activeTab === 'branding' ? 'dz-main-branding' : ''}`}>
          

          <SiteHeader
            variant="dashboard"
            className="dz-header"
            menuOpen={mobileMenuOpen}
            onMenuToggle={() => setMobileMenuOpen((open) => !open)}
            menuId="dz-merchant-sidebar"
          >
            <div className="dz-header-titles">
              <h1>
                {activeTab === 'overview' && 'نظرة عامة'}
                {activeTab === 'orders' && 'الشحنات'}
                {activeTab === 'alerts' && 'رادار تنبيهات الـ COD'}
                {activeTab === 'analytics' && 'تحليلات الشحنات'}
                {activeTab === 'branding' && 'تخصيص صفحة الزبون'}
                {activeTab === 'upsells' && 'زيادة المبيعات (قد يعجبك أيضاً)'}
                {activeTab === 'integrations' && 'بوابات الربط (Webhooks)'}
                {activeTab === 'mappings' && 'مطابقة الحالات والترجمة'}
                {activeTab === 'settings' && 'الإعدادات'}
              </h1>
              <p>
                {activeTab === 'overview' && `مرحباً ${displayStoreName}، إليك ملخص الشحنات وما يحتاج إلى متابعة.`}
                {activeTab === 'orders' && 'ابحث عن شحنة، حدّد الحالة، واتخذ الإجراء من مكان واحد.'}
                {activeTab === 'alerts' && 'طلبات مهددة بالإرجاع (عدم الرد/مؤجل). تواصل معهم فوراً.'}
                {activeTab === 'analytics' && 'مؤشرات مبنية على الشحنات المسجلة والحالات الحالية، دون تقديرات غير متاحة.'}
                {activeTab === 'branding' && 'عزز ولاء زبائنك بصفحة تتبع تحمل هويتك البصرية.'}
                {activeTab === 'upsells' && 'اعرض منتجات إضافية للزبون في أسفل صفحة التتبع لزيادة متوسط قيمة الطلب بدون إعلانات مدفوعة.'}
                {activeTab === 'integrations' && 'أجب عن سؤالين فقط لعرض خطوات الربط المناسبة لمتجرك. تُحفظ اختياراتك على هذا المتصفح ويمكنك إعادة الاختبار في أي وقت.'}
                {activeTab === 'mappings' && 'حدد ما يراه الزبون لكل حالة برمجية معقدة.'}
                {activeTab === 'settings' && 'إدارة معلومات المتجر وخدمات تيليجرام والاشتراك من مكان واحد.'}
              </p>
            </div>

            {(activeTab === 'overview' || activeTab === 'orders' || activeTab === 'alerts') && (
              <div className="dz-header-actions">
                <div className="dz-search-box" role="search">
                  <Icons.Search />
                  <input
                    type="text"
                    aria-label="البحث في الشحنات برقم الطلب أو الهاتف أو اسم العميل"
                    placeholder="رقم الطلب، الهاتف، العميل..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && activeTab === 'overview') {
                        event.preventDefault();
                        setActiveTab('orders');
                        setStatusFilter('all');
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="dz-add-order-btn"
                  onClick={() => {
                    setIsAddOrderModalOpen(true);
                    setAddOrderError(null);
                    setNewOrderSuccess(null);
                  }}
                  title="إضافة طلب يدوي لاختبار التتبع وتيليجرام"
                >
                  <Icons.Plus />
                  <span>طلب جديد</span>
                </button>
              </div>
            )}
          </SiteHeader>

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

          {alertCount > 0 && activeTab === 'orders' && (
            <div className="dz-alert-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#ef4444' }}><Icons.AlertTriangle /></span>
                <div>
                  <strong style={{ color: '#991b1b', display: 'block', fontSize: '14px' }}>تنبيهات خطر الإرجاع</strong>
                  <span style={{ fontSize: '13px', color: '#b91c1c' }}>يوجد {alertCount} طلب مهدد. يتطلب إنقاذ عبر الواتساب.</span>
                </div>
              </div>
              <button className="dz-btn" style={{ background: '#ef4444' }} onClick={() => { setActiveTab('alerts'); setStatusFilter('alerts'); setMobileMenuOpen(false); }}>
                عرض الطلبات
              </button>
            </div>
          )}

          {/* TAB: OPERATIONAL OVERVIEW */}
          {activeTab === 'overview' && (
            <section className="dz-overview" aria-label="نظرة عامة على الشحنات">
              <div className="dz-overview-kpis" aria-label="ملخص الشحنات">
                <button type="button" className="dz-overview-kpi" onClick={() => openShipmentList('all')}>
                  <span className="dz-overview-kpi-label">إجمالي الشحنات</span>
                  <strong className="dz-overview-kpi-value">{orders.length}</strong>
                  <span className="dz-overview-kpi-note">كل الشحنات المسجلة</span>
                </button>
                <button type="button" className="dz-overview-kpi" onClick={() => openShipmentList('transit')}>
                  <span className="dz-overview-kpi-label">قيد التوصيل</span>
                  <strong className="dz-overview-kpi-value">{inTransitCount}</strong>
                  <span className="dz-overview-kpi-note">شحنات في الطريق</span>
                </button>
                <button type="button" className={`dz-overview-kpi ${alertCount ? 'is-alert' : ''}`} onClick={() => openShipmentList('alerts')}>
                  <span className="dz-overview-kpi-label">تحتاج إلى متابعة</span>
                  <strong className="dz-overview-kpi-value">{alertCount}</strong>
                  <span className="dz-overview-kpi-note">حالات قد تتطلب تدخلاً</span>
                </button>
                <button type="button" className="dz-overview-kpi" onClick={() => openShipmentList('delivered')}>
                  <span className="dz-overview-kpi-label">تم التسليم</span>
                  <strong className="dz-overview-kpi-value">{deliveredCount}</strong>
                  <span className="dz-overview-kpi-note">{successRate}% من إجمالي الشحنات</span>
                </button>
              </div>

              {orders.length === 0 && (
                <section className="dz-setup-empty" aria-labelledby="dz-setup-empty-title">
                  <div className="dz-setup-empty-intro">
                    <span className="dz-setup-eyebrow">ابدأ من هنا <i>·</i> 3 خطوات واضحة</span>
                    <h2 id="dz-setup-empty-title">خلّي أول طلب يوصل إلى تاجر تراك</h2>
                    <p>ما تسجّل حتى طلب لحد الآن. اختَر طريقة الربط المناسبة، وبعدها قرّر إذا تحب حالات الشحن تتحدّث من شركة التوصيل تلقائياً أو تحدّثها بنفسك.</p>
                    <button type="button" className="dz-setup-primary" onClick={() => { setActiveTab('integrations'); setMobileMenuOpen(false); }}>افتح دليل الربط <span aria-hidden="true">←</span></button>
                  </div>
                  <div className="dz-setup-steps">
                    <button type="button" className="dz-setup-step" onClick={() => { setActiveTab('integrations'); setMobileMenuOpen(false); }}>
                      <span className="dz-setup-step-no">01</span><span><strong>اربط مصدر الطلبات</strong><small>Shopify أو موقع مبرمج خصيصاً</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                    <button type="button" className="dz-setup-step" onClick={() => { setTrackingSource('carrier'); setActiveTab('integrations'); }}>
                      <span className="dz-setup-step-no">02</span><span><strong>اختَر مصدر حالة الشحنة</strong><small>شركة توصيل مدعومة أو تحديث يدوي</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                    <button type="button" className="dz-setup-step" onClick={() => { setActiveTab('branding'); setMobileMenuOpen(false); }}>
                      <span className="dz-setup-step-no">03</span><span><strong>جهّز صفحة التتبع</strong><small>عدّل الهوية قبل مشاركة الرابط مع الزبائن</small></span><span className="dz-setup-step-arrow">↙</span>
                    </button>
                  </div>
                </section>
              )}

              <div className="dz-overview-grid">
                <div className="dz-overview-main">
                  <section className="dz-overview-section" aria-labelledby="overview-attention-title">
                    <div className="dz-overview-section-head">
                      <div>
                        <h2 id="overview-attention-title" className="dz-overview-section-title">تحتاج إلى متابعة</h2>
                        <span className="dz-overview-section-subtitle">الشحنات التي تتطلب اهتماماً بسبب تعذّر التوصيل أو التأجيل</span>
                      </div>
                      {alertCount > 0 && <button type="button" className="dz-overview-text-link" onClick={() => openShipmentList('alerts')}>عرض الكل ({alertCount})</button>}
                    </div>
                    {alertOrders.length === 0 ? (
                      <div className="dz-overview-empty">لا توجد شحنات تحتاج إلى متابعة حالياً. ستظهر هنا الحالات التي تتطلب تدخلاً.</div>
                    ) : alertOrders.slice(0, 5).map((order) => (
                      <div className="dz-overview-item" key={`attention-${order.id}`}>
                        <div className="dz-overview-item-main">
                          <span className="dz-overview-item-mark" aria-hidden="true" />
                          <div className="dz-overview-item-copy">
                            <strong>{order.customer_name || 'عميل'} <span style={{ color: 'var(--ink-muted)', fontWeight: 550 }}>· {order.external_order_id}</span></strong>
                            <span>{getStatusLabel(order.current_status)}{order.carrier_name ? ` · ${order.carrier_name}` : ''}</span>
                          </div>
                        </div>
                        <div className="dz-overview-item-meta">
                          <time dateTime={order.created_at}>{formatOrderDate(order.created_at)}</time>
                          <button type="button" className="dz-overview-item-action" onClick={() => openShipmentList('all', order.external_order_id)}>مراجعة</button>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className="dz-overview-section" aria-labelledby="overview-recent-title">
                    <div className="dz-overview-section-head">
                      <div>
                        <h2 id="overview-recent-title" className="dz-overview-section-title">أحدث الشحنات المسجلة</h2>
                        <span className="dz-overview-section-subtitle">مرتبة حسب تاريخ تسجيل الطلب، وليس حسب آخر تحديث للناقل</span>
                      </div>
                      <button type="button" className="dz-overview-text-link" onClick={() => openShipmentList('all')}>كل الشحنات</button>
                    </div>
                    {recentOrders.length === 0 ? (
                      <div className="dz-overview-empty">لا توجد شحنات بعد. عند وصول أول طلب سيظهر هنا.</div>
                    ) : recentOrders.map((order) => {
                      const kind = getStatusBadgeStyle(order.current_status);
                      return (
                        <div className="dz-overview-item" key={`recent-${order.id}`}>
                          <div className="dz-overview-item-main">
                            <span className={`dz-overview-item-mark ${kind === 'success' ? 'is-delivered' : kind === 'info' ? 'is-moving' : ''}`} aria-hidden="true" />
                            <div className="dz-overview-item-copy">
                              <strong>{order.customer_name || 'عميل'} <span style={{ color: 'var(--ink-muted)', fontWeight: 550 }}>· {order.external_order_id}</span></strong>
                              <span>{getStatusLabel(order.current_status)}{order.carrier_name ? ` · ${order.carrier_name}` : ''}</span>
                            </div>
                          </div>
                          <div className="dz-overview-item-meta">
                            <time dateTime={order.created_at}>{formatOrderDate(order.created_at)}</time>
                            <button type="button" className="dz-overview-item-action" onClick={() => openShipmentList('all', order.external_order_id)}>فتح</button>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                </div>

                <aside className="dz-overview-aside" aria-label="اختصارات">
                  <section className="dz-overview-section">
                    <div className="dz-overview-section-head"><div><h2 className="dz-overview-section-title">اختصارات</h2><span className="dz-overview-section-subtitle">الإجراءات التي تستخدمها يومياً</span></div></div>
                    <div className="dz-overview-actions">
                      <button type="button" className="dz-overview-action" onClick={() => openShipmentList('all')}>
                        <span className="dz-overview-action-icon"><Icons.Box /></span>
                        <span className="dz-overview-action-copy"><strong>كل الشحنات</strong><small>بحث وتصفية وتحديث الحالة</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => openShipmentList('alerts')}>
                        <span className="dz-overview-action-icon"><Icons.AlertTriangle /></span>
                        <span className="dz-overview-action-copy"><strong>تنبيهات COD</strong><small>{alertCount ? `${alertCount} شحنة تحتاج إلى مراجعة` : 'لا توجد تنبيهات حالياً'}</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => { setActiveTab('branding'); setMobileMenuOpen(false); }}>
                        <span className="dz-overview-action-icon"><Icons.Palette /></span>
                        <span className="dz-overview-action-copy"><strong>صفحة تتبع متجرك</strong><small>تعديل المظهر والرسائل وخيارات الدعم</small></span>
                      </button>
                      <button type="button" className="dz-overview-action" onClick={() => { setActiveTab('integrations'); setMobileMenuOpen(false); }}>
                        <span className="dz-overview-action-icon"><Icons.Plug /></span>
                        <span className="dz-overview-action-copy"><strong>بوابات الربط</strong><small>دليل إعداد خطوة بخطوة حسب متجرك</small></span>
                      </button>
                    </div>
                  </section>
                  <section className="dz-overview-section">
                    <div className="dz-overview-section-head"><div><h2 className="dz-overview-section-title">ملخص التشغيل</h2><span className="dz-overview-section-subtitle">حالات الشحن الحالية</span></div></div>
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark is-moving" /><div className="dz-overview-item-copy"><strong>في الطريق</strong><span>تشمل الشحنات المرسلة أو الخارجة للتوصيل</span></div></div><strong>{inTransitCount}</strong></div>
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark" style={{ background: '#a58b56', boxShadow: '0 0 0 4px rgba(165,139,86,.1)' }} /><div className="dz-overview-item-copy"><strong>نقطة الاستلام</strong><span>جاهزة للاستلام من المكتب</span></div></div><strong>{stopdeskCount}</strong></div>
                    <div className="dz-overview-item"><div className="dz-overview-item-main"><span className="dz-overview-item-mark is-delivered" /><div className="dz-overview-item-copy"><strong>مرتجعة أو ملغاة</strong><span>شحنات أُغلقت دون تسليم</span></div></div><strong>{returnedCount}</strong></div>
                  </section>
                </aside>
              </div>
            </section>
          )}

          {/* TABS: ORDERS & ALERTS */}
          {(activeTab === 'orders' || activeTab === 'alerts') && (
            <div>
              <div className="dz-stats-bar">
                <div className="dz-stat-item">
                  <span className="dz-stat-title">إجمالي الشحنات</span>
                  <span className="dz-stat-value">{orders.length}</span>
                  <span className="dz-stat-sub">كل الشحنات المسجلة</span>
                </div>
                <div className="dz-stat-item">
                  <span className="dz-stat-title">في الطريق</span>
                  <span className="dz-stat-value">{inTransitCount}</span>
                </div>
                <div className="dz-stat-item">
                  <span className="dz-stat-title">في نقطة Stopdesk</span>
                  <span className="dz-stat-value">{stopdeskCount}</span>
                </div>
                <div className="dz-stat-item">
                  <span className="dz-stat-title">تم التسليم</span>
                  <span className="dz-stat-value">{successRate}%</span>
                  <span className="dz-stat-sub">{deliveredCount} شحنة</span>
                </div>
              </div>

              <div className="dz-filter-row dz-shipment-filters" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className={`dz-filter-btn ${statusFilter === 'all' && activeTab === 'orders' ? 'active' : ''}`} onClick={() => { setStatusFilter('all'); if (activeTab !== 'orders') setActiveTab('orders'); }}>الكل</button>
                  <button className={`dz-filter-btn ${statusFilter === 'transit' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setStatusFilter('transit'); }}>في الطريق</button>
                  <button className={`dz-filter-btn ${statusFilter === 'stopdesk' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setStatusFilter('stopdesk'); }}>نقطة الاستلام</button>
                  <button className={`dz-filter-btn ${statusFilter === 'alerts' || activeTab === 'alerts' ? 'active' : ''}`} onClick={() => { setActiveTab('alerts'); setStatusFilter('alerts'); setMobileMenuOpen(false); }}>تنبيهات ({alertCount})</button>
                  <button className={`dz-filter-btn ${statusFilter === 'delivered' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setStatusFilter('delivered'); }}>تم التسليم</button>
                  <button className={`dz-filter-btn ${statusFilter === 'returned' ? 'active' : ''}`} onClick={() => { setActiveTab('orders'); setStatusFilter('returned'); }}>مرتجع</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select aria-label="تصفية حسب شركة الشحن" value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className="dz-filter-btn" style={{ outline: 'none' }}>
                    <option value="all">كل شركات الشحن</option>
                    {uniqueCarriers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select aria-label="ترتيب الشحنات" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'risk')} className="dz-filter-btn" style={{ outline: 'none' }}>
                    <option value="newest">الأحدث أولاً</option>
                    <option value="risk">الأكثر خطورة</option>
                    <option value="oldest">الأقدم أولاً</option>
                  </select>
                  {(searchTerm || statusFilter !== 'all' || carrierFilter !== 'all' || sortBy !== 'newest') && (
                    <button className="dz-filter-btn" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCarrierFilter('all'); setSortBy('newest'); setActiveTab('orders'); }}>مسح الفلاتر</button>
                  )}
                </div>
              </div>

              {filteredOrders.length > 0 && (
                <div
                  role="group"
                  aria-label="إجراءات الحذف الجماعي"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '12px 14px',
                    marginBottom: 12,
                    border: '1px solid var(--border-soft)',
                    borderRadius: 12,
                    background: 'var(--surface)',
                  }}
                >
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allFilteredOrdersSelected}
                      disabled={isDeletingOrders}
                      onChange={(event) => toggleFilteredOrderSelection(event.target.checked)}
                    />
                    تحديد كل النتائج ({filteredOrders.length})
                  </label>
                  {selectedOrderIds.length > 0 && (
                    <>
                      <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                        تم تحديد {selectedOrderIds.length} طلب
                      </span>
                      <button
                        type="button"
                        className="dz-btn"
                        disabled={isDeletingOrders}
                        onClick={() => void handleDeleteOrders(selectedOrderIds)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '8px 12px',
                          fontSize: 12,
                          background: '#dc2626',
                          color: '#fff',
                          borderColor: '#dc2626',
                          opacity: isDeletingOrders ? 0.65 : 1,
                        }}
                      >
                        <Icons.Trash />
                        {isDeletingOrders ? 'جارٍ الحذف...' : `حذف المحدد (${selectedOrderIds.length})`}
                      </button>
                      <button
                        type="button"
                        className="dz-btn dz-btn-outline"
                        disabled={isDeletingOrders}
                        onClick={() => setSelectedOrderIds([])}
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      >
                        إلغاء التحديد
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="dz-table-wrap dz-orders-desktop">
                <div className="dz-table-header">
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 750, color: 'var(--ink-main)' }}>قائمة الشحنات</h3>
                    <span className="dz-overview-section-subtitle">بيانات الطلب والعميل والحالة التشغيلية</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="dz-add-order-btn"
                      onClick={() => {
                        setIsAddOrderModalOpen(true);
                        setAddOrderError(null);
                        setNewOrderSuccess(null);
                      }}
                    >
                      <Icons.Plus />
                      <span>إضافة طلب جديد</span>
                    </button>
                    <span className="dz-orders-count">{filteredOrders.length} نتيجة من {orders.length}</span>
                  </div>
                </div>
                <div className="dz-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th aria-label="تحديد الطلبات" style={{ width: 42 }} />
                        <th>الطلب</th>
                        <th>العميل</th>
                        <th>شركة الشحن</th>
                        <th>الحالة</th>
                        <th>الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--ink-muted)' }}>{orders.length === 0 ? 'لا توجد شحنات مسجلة بعد.' : 'لا توجد نتائج تطابق البحث والفلاتر الحالية.'}</td></tr>
                      ) : filteredOrders.slice(0, visibleOrders).map((order) => {
                        const isAlert = isAttentionStatus(order.current_status);
                        const badgeStyle = getStatusBadgeStyle(order.current_status);
                        return (
                          <tr key={order.id} className={isAlert ? 'row-alert' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`تحديد الطلب ${order.external_order_id}`}
                                checked={selectedOrderIds.includes(order.id)}
                                disabled={isDeletingOrders}
                                onChange={(event) => toggleOrderSelection(order.id, event.target.checked)}
                              />
                            </td>
                            <td>
                              <strong style={{ display: 'block', fontSize: '12px', marginBottom: '5px', overflowWrap: 'anywhere' }}>{order.external_order_id}</strong>
                              <span style={{ color: 'var(--ink-light)', fontSize: '10px' }}>{formatOrderDate(order.created_at)} · تاريخ التسجيل</span>
                            </td>
                            <td>
                              <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>{order.customer_name || 'عميل'}</strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--ink-muted)', direction: 'ltr' }}>{order.customer_phone || 'لا يوجد هاتف'}</span>
                                {order.customer_phone && <button type="button" aria-label="نسخ رقم العميل" className="dz-icon-btn" onClick={() => copyToClipboard(order.customer_phone!, `ph_${order.id}`)}>{copiedKey === `ph_${order.id}` ? <Icons.Check /> : <Icons.Copy />}</button>}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '5px' }}>{order.carrier_name || 'غير محدد'}</div>
                              <span style={{ fontSize: '10px', color: 'var(--ink-muted)', overflowWrap: 'anywhere' }}>{order.carrier_tracking_number || 'لا يوجد رقم تتبع'}</span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                                {order.confirmation_status === 'pending' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(234,179,8,0.1)', color: '#92400e', fontWeight: 600 }}>بانتظار تأكيد العميل</span>}
                                {order.confirmation_status === 'confirmed' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(21,128,61,0.1)', color: '#15803d', fontWeight: 600 }}>أكد العميل الطلب</span>}
                                {order.confirmation_status === 'cancelled' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 600 }}>طلب العميل إلغاء الطلب</span>}
                                <span style={{ fontSize: 10, color: 'var(--ink-muted)', fontWeight: 600 }}>حالة الشحنة</span>
                                <span className={`dz-pill dz-pill-${badgeStyle}`}>{getStatusLabel(order.current_status)}</span>
                                <StatusSelector orderId={order.id} currentStatus={order.current_status} />
                              </div>
                            </td>
                            <td style={{ minWidth: 116 }}>
                              <div className="dz-order-action-grid" role="group" aria-label={`إجراءات الطلب ${order.external_order_id}`}>
                                <button
                                  type="button"
                                  className="dz-order-action-btn"
                                  aria-label={`تفاصيل الطلب ${order.external_order_id}`}
                                  title="تفاصيل الطلب"
                                  onClick={() => setSelectedOrderId(order.id)}
                                >
                                  <Icons.Eye />
                                </button>
                                <a
                                  href={`/t/${order.tracking_uuid}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="dz-order-action-btn"
                                  aria-label={`فتح صفحة تتبع ${order.external_order_id}`}
                                  title="صفحة التتبع"
                                >
                                  <Icons.ExternalLink />
                                </a>
                                {order.customer_phone ? (
                                  <a
                                    href={getWhatsAppRecoveryUrl(order)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`dz-order-action-btn dz-order-action-whatsapp ${isAlert ? 'is-urgent' : ''}`}
                                    aria-label="التواصل مع العميل عبر واتساب"
                                    title="واتساب"
                                  >
                                    <Icons.WhatsApp />
                                  </a>
                                ) : (
                                  <span className="dz-order-action-btn is-disabled" role="img" aria-label="رقم العميل غير متوفر" title="رقم العميل غير متوفر">
                                    <Icons.WhatsApp />
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="dz-order-action-btn dz-order-action-delete"
                                  aria-label={`حذف الطلب ${order.external_order_id}`}
                                  title="حذف الطلب"
                                  disabled={isDeletingOrders}
                                  onClick={() => void handleDeleteOrders([order.id])}
                                >
                                  <Icons.Trash />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dz-orders-mobile" aria-label="قائمة الشحنات على الهاتف">
                {filteredOrders.length === 0 ? (
                  <div className="dz-overview-empty">{orders.length === 0 ? 'لا توجد شحنات مسجلة بعد.' : 'لا توجد نتائج تطابق البحث والفلاتر الحالية.'}</div>
                ) : filteredOrders.slice(0, visibleOrders).map((order) => {
                  const isAlert = isAttentionStatus(order.current_status);
                  const badgeStyle = getStatusBadgeStyle(order.current_status);
                  return (
                    <article key={`mobile-${order.id}`} className="dz-order-mobile-card">
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 9, fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          aria-label={`تحديد الطلب ${order.external_order_id}`}
                          checked={selectedOrderIds.includes(order.id)}
                          disabled={isDeletingOrders}
                          onChange={(event) => toggleOrderSelection(order.id, event.target.checked)}
                        />
                        تحديد الطلب
                      </label>
                      <div className="dz-order-mobile-top">
                        <div className="dz-order-mobile-number"><strong>{order.external_order_id}</strong><small>تاريخ التسجيل: {formatOrderDate(order.created_at)}</small></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {order.confirmation_status === 'pending' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(234,179,8,0.1)', color: '#92400e', fontWeight: 600, whiteSpace: 'nowrap' }}>بانتظار تأكيد العميل</span>}
                          {order.confirmation_status === 'confirmed' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(21,128,61,0.1)', color: '#15803d', fontWeight: 600, whiteSpace: 'nowrap' }}>أكد العميل الطلب</span>}
                          {order.confirmation_status === 'cancelled' && <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 600, whiteSpace: 'nowrap' }}>طلب العميل إلغاء الطلب</span>}
                          <span className={`dz-pill dz-pill-${badgeStyle}`}>الشحنة: {getStatusLabel(order.current_status)}</span>
                        </div>
                      </div>
                      <div className="dz-order-mobile-customer">{order.customer_name || 'عميل'}</div>
                      <div className="dz-order-mobile-phone">
                        <span>{order.customer_phone || 'لا يوجد رقم هاتف'}</span>
                        {order.customer_phone && <button type="button" aria-label="نسخ رقم العميل" className="dz-icon-btn" onClick={() => copyToClipboard(order.customer_phone!, `mobile-ph_${order.id}`)}>{copiedKey === `mobile-ph_${order.id}` ? <Icons.Check /> : <Icons.Copy />}</button>}
                      </div>
                      <div className="dz-order-mobile-meta"><span>{order.carrier_name || 'شركة الشحن غير محددة'}</span><span>{order.carrier_tracking_number || 'لا يوجد رقم تتبع'}</span></div>
                      <div style={{ marginTop: '10px' }}><StatusSelector orderId={order.id} currentStatus={order.current_status} /></div>
                      <div className="dz-order-action-grid" role="group" aria-label={`إجراءات الطلب ${order.external_order_id}`}>
                        <button
                          type="button"
                          className="dz-order-action-btn"
                          aria-label={`تفاصيل الطلب ${order.external_order_id}`}
                          title="تفاصيل الطلب"
                          onClick={() => setSelectedOrderId(order.id)}
                        >
                          <Icons.Eye />
                        </button>
                        <a
                          href={`/t/${order.tracking_uuid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="dz-order-action-btn"
                          aria-label={`فتح صفحة تتبع ${order.external_order_id}`}
                          title="صفحة التتبع"
                        >
                          <Icons.ExternalLink />
                        </a>
                        {order.customer_phone ? (
                          <a
                            href={getWhatsAppRecoveryUrl(order)}
                            target="_blank"
                            rel="noreferrer"
                            className={`dz-order-action-btn dz-order-action-whatsapp ${isAlert ? 'is-urgent' : ''}`}
                            aria-label="التواصل مع العميل عبر واتساب"
                            title="واتساب"
                          >
                            <Icons.WhatsApp />
                          </a>
                        ) : (
                          <span className="dz-order-action-btn is-disabled" role="img" aria-label="رقم العميل غير متوفر" title="رقم العميل غير متوفر">
                            <Icons.WhatsApp />
                          </span>
                        )}
                        <button
                          type="button"
                          className="dz-order-action-btn dz-order-action-delete"
                          aria-label={`حذف الطلب ${order.external_order_id}`}
                          title="حذف الطلب"
                          disabled={isDeletingOrders}
                          onClick={() => void handleDeleteOrders([order.id])}
                        >
                          <Icons.Trash />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {visibleOrders < filteredOrders.length && (
                <div className="dz-orders-load-more"><button type="button" onClick={() => setVisibleOrders((count) => Math.min(count + 20, filteredOrders.length))}>عرض 20 شحنة أخرى ({filteredOrders.length - visibleOrders} متبقية)</button></div>
              )}

            </div>
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === 'analytics' && (
            <section className="dz-analytics" aria-label="تحليلات الشحنات">
              <div className="dz-overview-kpis dz-analytics-kpis">
                <div className="dz-overview-kpi"><span className="dz-overview-kpi-label">إجمالي الشحنات</span><strong className="dz-overview-kpi-value">{orders.length}</strong><span className="dz-overview-kpi-note">كل السجلات الحالية</span></div>
                <div className="dz-overview-kpi"><span className="dz-overview-kpi-label">نسبة التسليم الحالية</span><strong className="dz-overview-kpi-value">{successRate}%</strong><span className="dz-overview-kpi-note">الشحنات المسجلة بحالة «تم التسليم»</span></div>
                <div className={`dz-overview-kpi ${alertCount ? 'is-alert' : ''}`}><span className="dz-overview-kpi-label">تحتاج إلى متابعة</span><strong className="dz-overview-kpi-value">{alertCount}</strong><span className="dz-overview-kpi-note">من الحالات الحالية</span></div>
              </div>
              <div className="dz-analytics-grid">
                <section className="dz-overview-section dz-analytics-section" aria-labelledby="analytics-volume-title">
                  <div className="dz-overview-section-head"><div><h2 id="analytics-volume-title" className="dz-overview-section-title">حجم تسجيل الطلبات</h2><span className="dz-overview-section-subtitle">عدد الطلبات التي تم تسجيلها في كل يوم من آخر 7 أيام</span></div><span className="dz-analytics-total">{ordersCreatedLastSevenDays} طلباً</span></div>
                  <div className="dz-analytics-bars">
                    {lastSevenDays.map((day) => (
                      <div className="dz-analytics-bar-row" key={`${day.label}-${day.dateLabel}`}>
                        <span className="dz-analytics-day">{day.label} <small>{day.dateLabel}</small></span>
                        <div className="dz-analytics-bar-track"><div className="dz-analytics-bar-fill" style={{ width: `${Math.round((day.count / maxDailyOrders) * 100)}%` }} /></div>
                        <strong className="dz-analytics-bar-count">{day.count}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="dz-overview-section dz-analytics-section" aria-labelledby="analytics-status-title">
                  <div className="dz-overview-section-head"><div><h2 id="analytics-status-title" className="dz-overview-section-title">توزيع الحالات</h2><span className="dz-overview-section-subtitle">حسب الحالة الحالية لكل شحنة</span></div></div>
                  <div className="dz-analytics-status-list">
                    {statusBreakdown.map((item) => {
                      const percent = orders.length ? Math.round((item.count / orders.length) * 100) : 0;
                      return <div className="dz-analytics-status-item" key={item.key}>
                        <div className="dz-analytics-status-heading"><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.count} <small>({percent}%)</small></strong></div>
                        <div className="dz-analytics-bar-track"><div className="dz-analytics-bar-fill" style={{ width: `${percent}%`, background: item.color }} /></div>
                      </div>;
                    })}
                  </div>
                </section>
              </div>
              <div className="dz-analytics-footnote">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px', color: '#416B52' }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                <div>
                  <strong style={{ display: 'inline-block', marginInlineEnd: '6px', color: 'var(--ink-main)' }}>ملاحظة تحليلية:</strong>
                  هذه الشاشة تعتمد على تاريخ تسجيل الطلب والحالة الحالية في قاعدة البيانات. لا تعرض متوسط مدة التوصيل أو نسبة الالتزام بموعد التسليم لأن بيانات بداية ونهاية النقل اللازمة لحسابهما غير متاحة في هذا العرض.
                </div>
              </div>
              <div className="dz-analytics-action-row"><button type="button" className="dz-btn dz-btn-outline" onClick={() => openShipmentList('all')}>عرض الشحنات</button><button type="button" className="dz-btn" onClick={() => openShipmentList('alerts')}>مراجعة التنبيهات ({alertCount})</button></div>
            </section>
          )}

          {/* TAB: BRANDING STUDIO */}
          {activeTab === 'branding' && (
            <div className="dz-branding-workspace">
              <div className="dz-customizer-grid">

              {/* LEFT COLUMN: CONTROLS */}
              <form id="merchant-branding-form" onSubmit={handleSaveBranding}>
                <div className="dz-branding-panel-head">
                  <span className="dz-branding-kicker">BRAND STUDIO / 01</span>
                  <h2>صمّم صفحة التتبع بهوية متجرك</h2>
                  <p>اختر مجموعة واحدة للتعديل، وستنعكس خياراتك مباشرة على معاينة الهاتف.</p>
                </div>
                <section className="dz-brand-presets" aria-labelledby="brand-presets-title">
                  <div className="dz-brand-presets-heading">
                    <div>
                      <span className="dz-branding-kicker">CURATED STARTING POINTS</span>
                      <h3 id="brand-presets-title">ابدأ بأسلوب جاهز</h3>
                      <p>قوالب متوازنة تضبط المظهر دفعة واحدة؛ ويمكنك تعديل كل تفصيل بعدها.</p>
                    </div>
                    <span className="dz-brand-presets-note">تُعايَن قبل الحفظ</span>
                  </div>
                  <div className="dz-brand-presets-grid">
                    {BRAND_PRESETS.map((preset) => (
                      <button key={preset.id} type="button" className={`dz-brand-preset ${activeBrandPresetId === preset.id ? 'active' : ''}`} onClick={() => applyBrandPreset(preset)} aria-pressed={activeBrandPresetId === preset.id}>
                        <span className="dz-brand-preset-art" style={{ background: `linear-gradient(135deg, ${preset.colors[1]}, ${preset.colors[2]})` }} aria-hidden="true">
                          <span className="dz-brand-preset-swatch" style={{ background: preset.colors[0] }} />
                          <span className="dz-brand-preset-line" style={{ background: preset.colors[0] }} />
                          <span className="dz-brand-preset-dot" style={{ background: preset.colors[2] }} />
                        </span>
                        <span className="dz-brand-preset-copy"><strong>{preset.name}</strong><small>{preset.description}</small></span>
                        <span className="dz-brand-preset-check" aria-hidden="true">{activeBrandPresetId === preset.id ? '✓' : '↗'}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <nav className="dz-branding-categories" aria-label="فئات إعدادات الهوية">
                  {BRANDING_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`dz-brand-category ${brandingCategory === category.id ? 'active' : ''}`}
                      aria-pressed={brandingCategory === category.id}
                      onClick={() => setBrandingCategory(category.id)}
                    >
                      <span className="dz-brand-category-number">{category.number}</span>
                      <span className="dz-brand-category-copy">
                        <strong>{category.label}</strong>
                        <small>{category.description}</small>
                      </span>
                      <span className="dz-brand-category-mark" aria-hidden="true">{brandingCategory === category.id ? '✓' : ''}</span>
                    </button>
                  ))}
                </nav>

                <div className="dz-brand-edit-actions" aria-label="أدوات تعديل الهوية" data-history-version={brandHistoryTick}>
                  <div className={`dz-brand-edit-state ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`}><span className={`dz-brand-edit-dot ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} />{hasUnsavedBrandChanges ? 'المعاينة تتضمن تغييرات غير محفوظة' : 'المعاينة مطابقة للإعدادات المحفوظة'}</div>
                  <div className="dz-brand-edit-buttons">
                    <button type="button" className="dz-brand-tool-button" onClick={undoBrandChange} disabled={brandUndoStackRef.current.length === 0} title="تراجع عن آخر تغيير">↶ تراجع</button>
                    <button type="button" className="dz-brand-tool-button" onClick={redoBrandChange} disabled={brandRedoStackRef.current.length === 0} title="إعادة التغيير">↷ إعادة</button>
                    <button type="button" className="dz-brand-tool-button dz-brand-tool-reset" onClick={resetBrandCategory}>إعادة ضبط هذه الفئة</button>
                  </div>
                </div>

                {brandingCategory === 'identity' && (
                /* 1. BRAND COLORS & IDENTITY */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ color: 'var(--ink-muted)', fontSize: '18px' }}>◉</span> <span>ألوان صفحة التتبع</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    اختر اللون الأساسي لزر التأكيد، شريط التقدم، وأيقونات التتبع المعبرة:
                  </p>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {BRAND_PALETTES.map((palette) => (
                      <button
                        key={palette.hex}
                        type="button"
                        onClick={() => updateBrandConfig('brandColor', palette.hex)}
                        style={{
                          width: '38px', height: '38px', borderRadius: '50%', background: palette.hex,
                          border: brandConfig.brandColor.toLowerCase() === palette.hex.toLowerCase() ? '3px solid var(--ink-main)' : '3px solid transparent',
                          cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                        title={palette.name}
                      />
                    ))}
                  </div>
                  <div className={`dz-brand-contrast-note ${getBrandContrastRatio(brandConfig.brandColor, brandConfig.themeMode === 'dark' ? '#202420' : '#FFFFFF') < 4.5 ? 'is-low' : ''}`} role="status">
                    <span aria-hidden="true">◐</span>
                    {getBrandContrastRatio(brandConfig.brandColor, brandConfig.themeMode === 'dark' ? '#202420' : '#FFFFFF') < 4.5
                      ? 'قد يكون اللون خافتاً كنص صغير؛ تُعدّل ألوان النصوص المساعدة تلقائياً للحفاظ على الوضوح.'
                      : 'تباين لون العلامة مناسب مع الخلفية الأساسية المحددة.'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <label className="formLabel" style={{ margin: 0 }}>أو اختر كود مخصص (Hex):</label>
                    <input
                      type="color"
                      value={brandConfig.brandColor}
                      onChange={(e) => updateBrandConfig('brandColor', e.target.value)}
                      style={{ width: '38px', height: '38px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={brandConfig.brandColor}
                      onChange={(e) => updateBrandConfig('brandColor', e.target.value)}
                      className="dz-mono"
                      style={{ width: '100px', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label className="formLabel">وصف المتجر (Subtitle)</label>
                    <input
                      type="text"
                      value={brandConfig.brandSubtitle}
                      onChange={(e) => updateBrandConfig('brandSubtitle', e.target.value)}
                      placeholder="مثال: متجركم الموثوق للتسوق الإلكتروني في 58 ولاية..."
                      className="input"
                    />
                  </div>

                  <p style={{ margin: '15px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>
                    يُدار شعار المتجر من صفحة الإعدادات، ويظهر هنا تلقائياً في المعاينة.
                  </p>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 2. BACKGROUND STYLES & THEME */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>◻</span> <span>نمط الصفحة والخلفية</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    حدد الجو العام لصفحة التتبع التي يفتحها الزبون:
                  </p>

                  <div className="dz-choice-grid" style={{ marginBottom: '20px' }}>
                    {BACKGROUND_STYLES.map((bg) => (
                      <div
                        key={bg.id}
                        className={`dz-choice-card ${brandConfig.bgStyle === bg.id ? 'active' : ''}`}
                        onClick={() => updateBrandConfig('bgStyle', bg.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('bgStyle', bg.id); } }}
                      >
                        <div className="dz-background-swatch" style={{ background: bg.previewBg }} aria-hidden="true" />
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '17px' }}>{bg.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{bg.name}</span>
                        <span className="dz-choice-desc">{bg.desc}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-base)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-soft)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>وضع الإضاءة (Theme Mode):</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => updateBrandConfig('themeMode', 'light')}
                        className={`dz-btn dz-btn-outline ${brandConfig.themeMode === 'light' ? 'active' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '12px', background: brandConfig.themeMode === 'light' ? 'var(--ink-main)' : undefined, color: brandConfig.themeMode === 'light' ? '#fff' : undefined }}
                      >
                        فاتح (Light)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBrandConfig('themeMode', 'dark')}
                        className={`dz-btn dz-btn-outline ${brandConfig.themeMode === 'dark' ? 'active' : ''}`}
                        style={{ padding: '6px 14px', fontSize: '12px', background: brandConfig.themeMode === 'dark' ? 'var(--ink-main)' : undefined, color: brandConfig.themeMode === 'dark' ? '#fff' : undefined }}
                      >
                        داكن (Dark)
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', marginTop: '14px', padding: '16px', border: '1px solid var(--border-soft)', borderRadius: '12px', background: 'var(--surface)' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>تمويه الخلفية لتحسين وضوح المحتوى</div>
                      <div style={{ color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.7 }}>طبقة خفيفة بتمويه بسيط للخلفية والزخارف فقط؛ النصوص والمحتوى تبقى واضحة. يمكنك إيقافها في أي وقت.</div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', flexShrink: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 750 }}>
                      <input type="checkbox" checked={brandConfig.backgroundBlur !== false} onChange={(event) => updateBrandConfig('backgroundBlur', event.target.checked)} />
                      {brandConfig.backgroundBlur !== false ? 'مفعّل' : 'متوقف'}
                    </label>
                  </div>

                  {String(brandConfig.bgStyle) === 'blobs' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', marginTop: '14px', padding: '16px', border: '1px solid var(--border-soft)', borderRadius: '12px', background: 'var(--surface)' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>تحريك الأشكال العضوية</div>
                        <div style={{ color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.7 }}>حركة بطيئة وناعمة للكتل الضبابية، مستقلة عن مستوى الحركة العام.</div>
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', flexShrink: 0, cursor: 'pointer', fontSize: '12px', fontWeight: 750 }}>
                        <input type="checkbox" checked={Boolean(brandConfig.animateBackgroundBlobs)} onChange={(event) => updateBrandConfig('animateBackgroundBlobs', event.target.checked)} />
                        {brandConfig.animateBackgroundBlobs ? 'مفعّل' : 'متوقف'}
                      </label>
                    </div>
                  )}
                </div>

                )}

                {brandingCategory === 'layout' && (
                /* 3. TIMELINE TYPES & DESIGNS */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>◷</span> <span>طريقة عرض سجل الشحنة</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '18px' }}>
                    اختر الطريقة المرئية لعرض مراحل التوصيل وتحديثات الشحن للعميل:
                  </p>

                  <div className="dz-choice-grid">
                    {TIMELINE_DESIGNS.map((tl) => (
                      <div
                        key={tl.id}
                        className={`dz-choice-card ${brandConfig.timelineDesign === tl.id ? 'active' : ''}`}
                        onClick={() => updateBrandConfig('timelineDesign', tl.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('timelineDesign', tl.id); } }}
                      >
                        <div className={`dz-timeline-swatch dz-timeline-swatch--${tl.id}`} style={{ ['--timeline-swatch-brand' as string]: brandConfig.brandColor } as React.CSSProperties} aria-hidden="true">
                          <span /><span /><span />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '17px' }}>{tl.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{tl.name}</span>
                        <span className="dz-choice-desc">{tl.desc}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-soft)', marginTop: '24px', paddingTop: '22px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 800 }}>شكل الخطوط بين النقاط</h4>
                    <p style={{ margin: '0 0 14px', fontSize: '12px', lineHeight: 1.7, color: 'var(--ink-muted)' }}>يتحكم هذا الخيار في خطوط الربط ضمن التصاميم التي تستخدم مساراً متصلاً.</p>
                    <div className="dz-choice-grid">
                      {TIMELINE_LINE_STYLES.map((lineStyle) => (
                        <div
                          key={lineStyle.id}
                          className={`dz-choice-card ${((brandConfig as EditableBrandSettings).timelineLineStyle || 'straight') === lineStyle.id ? 'active' : ''}`}
                          onClick={() => updateBrandConfig('timelineLineStyle', lineStyle.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('timelineLineStyle', lineStyle.id); } }}
                        >
                          <div className={`dz-connector-swatch dz-connector-swatch--${lineStyle.id}`} style={{ ['--timeline-swatch-brand' as string]: brandConfig.brandColor } as React.CSSProperties} aria-hidden="true"><span /><i>{lineStyle.id === 'curved' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C2 23 2 77 12 100" /></svg>}{lineStyle.id === 'wave' && <svg viewBox="0 0 24 100" preserveAspectRatio="none"><path d="M12 0 C0 14 0 25 12 36 S24 60 12 72 S0 88 12 100" /></svg>}</i><span /></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px' }}>{lineStyle.icon}</span><span className="dz-choice-indicator" />
                          </div>
                          <span className="dz-choice-title">{lineStyle.name}</span>
                          <span className="dz-choice-desc">{lineStyle.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 4. CARD SURFACE & RADIUS */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>▱</span> <span>سطح بطاقة التتبع</span>
                  </h3>

                  <div style={{ marginBottom: '20px' }}>
                    <label className="formLabel">تأثير السطح (Surface Style)</label>
                    <div className="dz-choice-grid">
                      {CARD_SURFACES.map((cs) => (
                        <div
                          key={cs.id}
                          className={`dz-choice-card ${brandConfig.cardSurface === cs.id ? 'active' : ''}`}
                          onClick={() => updateBrandConfig('cardSurface', cs.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('cardSurface', cs.id); } }}
                        >
                          <span className="dz-choice-title">{cs.name}</span>
                          <span className="dz-choice-desc">{cs.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="formLabel">استدارة الحواف</label>
                    <div className="dz-choice-grid">
                      {CARD_RADII.map((cr) => (
                        <div
                          key={cr.id}
                          className={`dz-choice-card ${brandConfig.cardRadius === cr.id ? 'active' : ''}`}
                          onClick={() => updateBrandConfig('cardRadius', cr.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('cardRadius', cr.id); } }}
                        >
                          <span className="dz-choice-title">{cr.name}</span>
                          <span className="dz-choice-desc">{cr.px}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 5. TYPOGRAPHY */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Aa</span> <span>الخط المستخدم</span>
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '16px' }}>
                    اختر الخط الذي يعكس شخصية متجرك — كل خط يعطي انطباعاً مختلفاً:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {FONT_FAMILIES.map((ff) => (
                      <div
                        key={ff.id}
                        onClick={() => updateBrandConfig('fontFamily', ff.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: `2px solid ${brandConfig.fontFamily === ff.id ? 'var(--ink-main)' : 'var(--border-soft)'}`,
                          background: brandConfig.fontFamily === ff.id ? 'var(--bg-base)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: brandConfig.fontFamily === ff.id ? brandConfig.brandColor : 'var(--border-strong)',
                          flexShrink: 0,
                          transition: 'background 0.18s ease',
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700 }}>{ff.name}</div>
                          <div style={{ fontSize: '18px', lineHeight: 1.4, color: 'var(--ink-muted)', fontFamily: ff.id === 'cairo' ? "'Cairo', system-ui, sans-serif" : ff.id === 'tajawal' ? "'Tajawal', system-ui, sans-serif" : ff.id === 'ibm-plex' ? "'IBM Plex Sans Arabic', system-ui, sans-serif" : ff.id === 'noto-kufi' ? "'Noto Kufi Arabic', system-ui, sans-serif" : "'Readex Pro', system-ui, sans-serif" }}>{ff.sample}</div>
                        </div>
                        {brandConfig.fontFamily === ff.id && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: getReadableBrandAccent(brandConfig.brandColor, 'light') }}>محدد</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                )}

                {brandingCategory === 'appearance' && (
                /* 7. ANIMATION LEVEL */
                <div className="dz-card-box" style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ color: 'var(--ink-muted)', fontSize: '18px' }}>∿</span> <span>مستوى الحركة</span>
                  </h3>
                  <div className="dz-choice-grid">
                    {ANIMATION_LEVELS.map((al) => (
                      <div
                        key={al.id}
                        className={`dz-choice-card ${brandConfig.animationLevel === al.id ? 'active' : ''}`}
                        onClick={() => updateBrandConfig('animationLevel', al.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); updateBrandConfig('animationLevel', al.id); } }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <span style={{ fontSize: '18px' }}>{al.icon}</span>
                          <span className="dz-choice-indicator" />
                        </div>
                        <span className="dz-choice-title">{al.name}</span>
                        <span className="dz-choice-desc">{al.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                )}

                {brandingCategory === 'customer' && (
                /* 9. CUSTOMER EXPERIENCE & SUPPORT */
                <div className="dz-card-box" style={{ marginBottom: '32px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--ink-muted)' }}><Icons.MessageCircle /></span> <span>تجربة الزبون والدعم المباشر (Customer Experience)</span>
                  </h3>

                  <div style={{ marginBottom: '16px' }}>
                    <label className="formLabel">رقم واتساب خدمة العملاء (اختياري)</label>
                    <input
                      type="tel"
                      value={brandConfig.supportPhone || ''}
                      onChange={(e) => updateBrandConfig('supportPhone', e.target.value)}
                      placeholder="مثال: 0550123456 أو 0660..."
                      className="input"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '4px', display: 'block' }}>
                      سيظهر زر واتساب عائم أسفل صفحة التتبع، مع رسالة تتضمن رقم الطلب تلقائياً.
                    </span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', marginBottom: '20px' }}>
                    <input
                      type="checkbox"
                      checked={brandConfig.showWhatsAppButton !== false}
                      onChange={(e) => updateBrandConfig('showWhatsAppButton', e.target.checked)}
                    />
                    <span>إظهار زر واتساب العائم في صفحة التتبع</span>
                  </label>

                  <div style={{ marginBottom: '20px' }}>
                    <label className="formLabel">إعلان أو تنبيه للمشتري (Announcement Banner)</label>
                    <input
                      type="text"
                      value={brandConfig.announcementText || ''}
                      onChange={(e) => updateBrandConfig('announcementText', e.target.value)}
                      placeholder="مثال: يرجى إبقاء هاتفك مشغلاً لتأكيد موعد استلام الطلب مع الموزع 📞"
                      className="input"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showCarrierBadge}
                        onChange={(e) => updateBrandConfig('showCarrierBadge', e.target.checked)}
                      />
                      <span>إظهار شارة شركة الشحن ورقم التتبع مع زر النسخ</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showProductSection}
                        onChange={(e) => updateBrandConfig('showProductSection', e.target.checked)}
                      />
                      <span>إظهار قسم محتويات الشحنة والمنتجات</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={brandConfig.showOrderNumberBadge ?? true}
                        onChange={(e) => updateBrandConfig('showOrderNumberBadge', e.target.checked)}
                      />
                      <span>إظهار رقم الطلب في أعلى البطاقة</span>
                    </label>
                  </div>
                </div>
                )}
              </form>

              {/* RIGHT COLUMN: STICKY LIVE INTERACTIVE PREVIEW */}
              <div className="dz-branding-preview-sticky">
                <div className="dz-branding-preview-status" aria-live="polite">
                  <span className="dz-preview-live-dot" />
                  <strong>معاينة مباشرة</strong>
                  <span>{hasUnsavedBrandChanges ? 'تغييرات غير محفوظة' : 'آخر نسخة محفوظة'}</span>
                </div>
                {/* Memoised phone preview — re-renders only when deferred config settles */}
                <BrandingPhonePreview
                  brandConfig={deferredBrandConfig}
                  storeName={displayStoreName}
                />

              </div>
              </div>

              <div className={`dz-brand-savebar ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} role="status" aria-live="polite">
                <div className="dz-brand-savebar-copy">
                  <span className={`dz-brand-save-indicator ${hasUnsavedBrandChanges ? 'is-dirty' : ''}`} aria-hidden="true" />
                  <div>
                    <strong>{hasUnsavedBrandChanges ? 'لديك تغييرات غير محفوظة' : 'كل التغييرات محفوظة'}</strong>
                    <span>{hasUnsavedBrandChanges ? 'احفظ لتطبيق إعدادات الهوية على صفحة التتبع.' : 'يمكنك مواصلة التخصيص؛ ستظهر التغييرات هنا مباشرة.'}</span>
                  </div>
                </div>
                <button
                  type="submit"
                  form="merchant-branding-form"
                  disabled={!hasUnsavedBrandChanges || isSavingBrand}
                  className="dz-btn dz-brand-save-button"
                  style={{ background: brandConfig.brandColor, color: getReadableOnBrand(brandConfig.brandColor) }}
                >
                  {isSavingBrand ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
                </button>
              </div>
            </div>
          )}

          {/* TAB: UPSELLS (YOU MAY ALSO LIKE) */}
          {activeTab === 'upsells' && (
            <div className="dz-upsell-container" aria-label="زيادة المبيعات وعرض المنتجات التكميلية">
              {/* HERO BANNER */}
              <div className="dz-upsell-hero-banner">
                <div className="dz-upsell-hero-text">
                  <h3>
                    <Icons.ShoppingBag /> زيادة المبيعات (قد يعجبك أيضاً)
                  </h3>
                  <p>
                    تظهر هذه المنتجات في أسفل صفحة التتبع لزبائنك عندما يتابعون مسار شحنتهم. الصق رابط أي منتج من متجرك (Shopify، YouCan، WooCommerce، WordPress، أو متجر مبرمج) لجلبه تلقائياً بنقرة واحدة!
                  </p>
                </div>
                {orders.length > 0 && orders[0].tracking_uuid && (
                  <a
                    href={`${siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://tajertrack.vercel.app')}/t/${orders[0].tracking_uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dz-upsell-hero-badge"
                    style={{ textDecoration: 'none' }}
                  >
                    <Icons.ExternalLink /> معاينة صفحة التتبع الحية
                  </a>
                )}
              </div>

              {/* FORM CARD: SMART SCRAPER & MANUAL EDIT */}
              <div id="dz-upsell-form-anchor" className="dz-upsell-form-card">
                <div className="dz-upsell-form-head">
                  <div>
                    <h3>
                      {editingUpsellId ? <Icons.Edit /> : <Icons.Plus />}
                      {editingUpsellId ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد'}
                    </h3>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {editingUpsellId ? 'قم بتعديل بيانات المنتج ثم اضغط على حفظ التعديلات' : 'يمكنك جلب المنتج تلقائياً بالرابط أو كتابة تفاصيله يدوياً'}
                    </span>
                  </div>
                  {editingUpsellId && (
                    <button
                      type="button"
                      onClick={handleCancelEditUpsell}
                      className="dz-btn dz-btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>

                {/* SMART SCRAPER BAR */}
                <div className="dz-smart-fetch-box">
                  <label className="dz-smart-fetch-label">
                   جلب تلقائي بالرابط (Shopify, YouCan, WooCommerce, متجر خاص)
                  </label>
                  <div className="dz-smart-fetch-row">
                    <input
                      type="url"
                      className="dz-smart-fetch-input"
                      placeholder="https://mystore.com/products/example-product"
                      value={upsellScrapeUrl}
                      onChange={(e) => setUpsellScrapeUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleScrapeProductUrl();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="dz-smart-fetch-btn"
                      onClick={handleScrapeProductUrl}
                      disabled={isScrapingUpsell || !upsellScrapeUrl.trim()}
                    >
                      <Icons.Sparkles />
                      {isScrapingUpsell ? 'جاري الاستخراج...' : 'جلب تلقائي'}
                    </button>
                  </div>
                  {scrapeUpsellError && (
                    <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icons.AlertTriangle /> {scrapeUpsellError}
                    </div>
                  )}
                </div>

                {/* PRODUCT FORM */}
                <form onSubmit={handleSaveUpsellSubmit}>
                  {saveUpsellError && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icons.AlertTriangle /> {saveUpsellError}
                    </div>
                  )}

                  <div className="dz-upsell-inputs-grid">
                    <div className="dz-upsell-field">
                      <label>عنوان المنتج *</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: حقيبة ظهر كلاسيكية مضادة للماء"
                        value={upsellTitle}
                        onChange={(e) => setUpsellTitle(e.target.value)}
                      />
                    </div>

                    <div className="dz-upsell-field">
                      <label>رابط صفحة المنتج (Destination URL) *</label>
                      <input
                        type="url"
                        required
                        dir="ltr"
                        placeholder="https://mystore.com/products/bag"
                        value={upsellProductUrl}
                        onChange={(e) => setUpsellProductUrl(e.target.value)}
                      />
                      <small>الرابط الذي سيفتح للعميل في نافذة جديدة عند النقر على المنتج</small>
                    </div>

                    <div className="dz-upsell-field">
                      <ImageUploadField
                        label="صورة المنتج"
                        required
                        value={upsellImageUrl}
                        onChange={setUpsellImageUrl}
                        merchantId={merchantId}
                        folder="upsell-products"
                        quality={0.68}
                      />
                    </div>

                    <div className="dz-upsell-field">
                      <label>السعر (اختياري)</label>
                      <input
                        type="text"
                        placeholder="مثال: 3,500 د.ج (اتركه فارغاً إذا كنت لا ترغب بعرض السعر)"
                        value={upsellPrice}
                        onChange={(e) => setUpsellPrice(e.target.value)}
                      />
                      <small>إذا تركته فارغاً سيظهر المنتج بصورته وعنوانه فقط دون سعر</small>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', paddingTop: '10px', borderTop: '1px solid rgba(9, 9, 11, 0.06)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={upsellIsActive}
                        onChange={(e) => setUpsellIsActive(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#27342d', cursor: 'pointer' }}
                      />
                      تفعيل ظهور هذا المنتج في صفحة التتبع (نشط)
                    </label>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {editingUpsellId && (
                        <button
                          type="button"
                          onClick={handleCancelEditUpsell}
                          className="dz-btn dz-btn-outline"
                        >
                          إلغاء
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingUpsell}
                        className="dz-btn"
                        style={{ background: '#27342d', color: '#fff', padding: '10px 22px' }}
                      >
                        {isSavingUpsell
                          ? 'جاري الحفظ...'
                          : editingUpsellId
                          ? '✓ حفظ التعديلات'
                          : '✓ إضافة المنتج وعرضه للزبائن'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* PRODUCTS LIST */}
              <div className="dz-upsell-list-card">
                <div className="dz-upsell-list-head">
                  <div>
                    <h3>
                      منتجاتك المضافة ({upsellsList.length})
                    </h3>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      النشط حالياً: {upsellsList.filter((u) => u.is_active).length} منتج · تحكم بترتيب الظهور بالأسهم
                    </span>
                  </div>

                  <div className="dz-upsell-stats-pills">
                    <div className="dz-upsell-stat-pill" title="إجمالي عدد نقرات الزبائن على المنتجات المقترحة">
                      <Icons.MousePointer />
                      <span>إجمالي النقرات: <b>{upsellsList.reduce((acc, u) => acc + (Number(u.clicks_count) || 0), 0)}</b></span>
                    </div>
                    <div className="dz-upsell-stat-pill active" title="عدد المنتجات النشطة والمعروضة في صفحة التتبع">
                      <span>المعروضة: <b>{upsellsList.filter((u) => u.is_active).length}</b></span>
                    </div>
                  </div>
                </div>

                {upsellsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                    <div style={{ width: '56px', height: '56px', margin: '0 auto 14px', borderRadius: '50%', background: '#f3f4f6', display: 'grid', placeItems: 'center', color: '#9ca3af' }}>
                      <Icons.ShoppingBag />
                    </div>
                    <strong style={{ display: 'block', fontSize: '15px', color: '#111827', marginBottom: '6px' }}>
                      لا توجد منتجات مضافة بعد
                    </strong>
                    <p style={{ margin: '0 auto', maxWidth: '440px', fontSize: '13px', lineHeight: 1.6 }}>
                      الصق رابط أي منتج من متجرك في الحقل أعلاه واضغط على «جلب تلقائي ⚡» لتظهر اقتراحات الشراء لزبائنك في صفحة التتبع فوراً!
                    </p>
                  </div>
                ) : (
                  <div className="dz-upsell-cards-grid">
                    {upsellsList.map((item, index) => (
                      <div
                        key={item.id}
                        className={`dz-upsell-item-card ${!item.is_active ? 'is-inactive' : ''}`}
                      >
                        <div className="dz-upsell-item-card-top">
                          <img
                            src={toCachedImageUrl(item.image_url)}
                            alt={item.title}
                            className="dz-upsell-item-card-img"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
                            }}
                          />
                          <div className="dz-upsell-item-card-meta">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <span className="dz-upsell-order-badge" title="ترتيب ظهور المنتج للزبون">
                                #{index + 1}
                              </span>
                              <span className="dz-upsell-clicks-badge" title={`تم النقر على هذا المنتج ${item.clicks_count || 0} مرة من قبل الزبائن`}>
                                <Icons.MousePointer /> {item.clicks_count || 0} نقرة
                              </span>
                            </div>
                            <h4 className="dz-upsell-item-card-title" title={item.title}>
                              {item.title}
                            </h4>
                            {item.price ? (
                              <span className="dz-upsell-item-card-price">{item.price}</span>
                            ) : (
                              <span className="dz-upsell-item-card-noprice">بدون سعر</span>
                            )}
                          </div>
                        </div>

                        <div className="dz-upsell-item-card-bottom">
                          <div className="dz-upsell-order-controls" aria-label="ترتيب ظهور المنتج">
                            <button
                              type="button"
                              className="dz-upsell-action-btn reorder-btn"
                              disabled={index === 0 || reorderingUpsellId !== null}
                              onClick={() => handleReorderUpsell(item.id, 'up')}
                              title={index === 0 ? 'هذا أول منتج' : 'تقديم ترتيب المنتج للأعلى'}
                              aria-label="تقديم ترتيب المنتج للأعلى"
                            >
                              <Icons.ArrowUp />
                            </button>
                            <button
                              type="button"
                              className="dz-upsell-action-btn reorder-btn"
                              disabled={index === upsellsList.length - 1 || reorderingUpsellId !== null}
                              onClick={() => handleReorderUpsell(item.id, 'down')}
                              title={index === upsellsList.length - 1 ? 'هذا آخر منتج' : 'تأخير ترتيب المنتج للأسفل'}
                              aria-label="تأخير ترتيب المنتج للأسفل"
                            >
                              <Icons.ArrowDown />
                            </button>
                          </div>

                          <button
                            type="button"
                            className={`dz-upsell-toggle-btn ${item.is_active ? 'active' : 'inactive'}`}
                            onClick={() => handleToggleUpsell(item)}
                            disabled={togglingUpsellId === item.id}
                            title={item.is_active ? 'اضغط لإخفائه من صفحة التتبع' : 'اضغط لإظهاره في صفحة التتبع'}
                          >
                            {togglingUpsellId === item.id
                              ? '...'
                              : item.is_active
                              ? '✓ معروض'
                              : 'مخفي'}
                          </button>

                          <div className="dz-upsell-action-btns">
                            <a
                              href={item.product_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="dz-upsell-action-btn"
                              title="فتح رابط المنتج في نافذة جديدة"
                            >
                              <Icons.ExternalLink />
                            </a>
                            <button
                              type="button"
                              className="dz-upsell-action-btn"
                              onClick={() => handleEditUpsell(item)}
                              title="تعديل بيانات المنتج"
                            >
                              <Icons.Edit />
                            </button>
                            <button
                              type="button"
                              className="dz-upsell-action-btn danger"
                              onClick={() => handleDeleteUpsell(item.id)}
                              disabled={deletingUpsellId === item.id}
                              title="حذف المنتج"
                            >
                              <Icons.Trash />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: INTEGRATIONS — guided, progressive setup */}
          {activeTab === 'integrations' && (
            <div className="dz-int-guided" aria-label="إعداد ربط المتجر">
              {integrationChoicesHydratedFor !== merchantId ? (
                <div className="dz-int-guided-loading" role="status">جارٍ استعادة اختيارات الربط المحفوظة على هذا المتصفح...</div>
              ) : (
                <>
                  <div className="dz-int-guided-heading">
                    <div>
                      <span className="dz-setup-eyebrow">إعداد مرة واحدة</span>
                      <h2>خلّينا نربط متجرك</h2>
                      <p>جاوب عن سؤالين فقط، وسنعرض لك الخطوات التي تحتاجها دون تفاصيل غير ضرورية.</p>
                    </div>
                    {integrationStep === 3 && (
                      <button type="button" className="dz-int-guided-reset" onClick={() => {
                        setIntegrationPlatform(null);
                        setTrackingSource(null);
                        setSelectedCarrier(null);
                        setIntegrationStep(1);
                        setApiKeyRevealed(false);
                      }}>
                        <Icons.Refresh /> إعادة الاختبار
                      </button>
                    )}
                  </div>

                  {integrationStep === 1 && (
                    <section className="dz-int-guided-card" aria-labelledby="dz-int-source-title">
                      <div className="dz-int-guided-progress"><span className="is-active" /><span /><span /></div>
                      <div className="dz-int-guided-step-label">الخطوة 1 من 2</div>
                      <h3 id="dz-int-source-title">من أين تأتي طلبات متجرك؟</h3>
                      <p className="dz-int-guided-help">اختر الطريقة التي تستخدمها حالياً لتسجيل الطلبات.</p>
                      <div className="dz-int-guided-options">
                        <button type="button" className={`dz-int-guided-option ${integrationPlatform === 'shopify' ? 'is-selected' : ''}`} aria-pressed={integrationPlatform === 'shopify'} onClick={() => {
                          setIntegrationPlatform('shopify');
                          setTrackingSource(null);
                          setSelectedCarrier(null);
                        }}>
                          <span className="dz-int-guided-option-icon"><Icons.ShoppingBag /></span>
                          <span><strong>Shopify</strong><small>متجري يعمل على Shopify.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                        <button type="button" className={`dz-int-guided-option ${integrationPlatform === 'website' ? 'is-selected' : ''}`} aria-pressed={integrationPlatform === 'website'} onClick={() => {
                          setIntegrationPlatform('website');
                          setTrackingSource(null);
                          setSelectedCarrier(null);
                        }}>
                          <span className="dz-int-guided-option-icon"><Icons.Code /></span>
                          <span><strong>موقع إلكتروني خاص</strong><small>موقع مبرمج أو متجر مخصص.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                        <button type="button" className={`dz-int-guided-option ${integrationPlatform === 'manual' ? 'is-selected' : ''}`} aria-pressed={integrationPlatform === 'manual'} onClick={() => {
                          setIntegrationPlatform('manual');
                          setTrackingSource(null);
                          setSelectedCarrier(null);
                        }}>
                          <span className="dz-int-guided-option-icon"><Icons.Clipboard /></span>
                          <span><strong>إضافة الطلبات يدوياً</strong><small>أسجل الطلبات من لوحة تاجر تراك.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                      </div>
                      <div className="dz-int-guided-actions">
                        <span>ستتمكن من تعديل اختيارك لاحقاً.</span>
                        <button type="button" className="dz-btn" disabled={!integrationPlatform} onClick={() => setIntegrationStep(2)}>متابعة <Icons.ArrowLeft /></button>
                      </div>
                    </section>
                  )}

                  {integrationStep === 2 && (
                    <section className="dz-int-guided-card" aria-labelledby="dz-int-updates-title">
                      <div className="dz-int-guided-progress"><span className="is-done" /><span className="is-active" /><span /></div>
                      <div className="dz-int-guided-completed">
                        <span><Icons.Check /> مصدر الطلبات</span>
                        <strong>{integrationPlatform === 'shopify' ? 'Shopify' : integrationPlatform === 'website' ? 'موقع إلكتروني خاص' : 'إضافة يدوية'}</strong>
                        <button type="button" onClick={() => setIntegrationStep(1)}>تغيير</button>
                      </div>
                      <div className="dz-int-guided-step-label">الخطوة 2 من 2</div>
                      <h3 id="dz-int-updates-title">كيف تريد تحديث حالة الشحنة؟</h3>
                      <p className="dz-int-guided-help">استقبال الطلب وتحديث حالة التوصيل عمليتان منفصلتان. اختر ما يناسبك.</p>
                      <div className="dz-int-guided-options">
                        <button type="button" className={`dz-int-guided-option ${trackingSource === 'carrier' ? 'is-selected' : ''}`} aria-pressed={trackingSource === 'carrier'} onClick={() => setTrackingSource('carrier')}>
                          <span className="dz-int-guided-option-icon"><Icons.Truck /></span>
                          <span><strong>تلقائياً من شركة التوصيل</strong><small>تصل الحالات من الشركة عند تفعيل Webhook.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                        <button type="button" className={`dz-int-guided-option ${trackingSource === 'manual' ? 'is-selected' : ''}`} aria-pressed={trackingSource === 'manual'} onClick={() => {
                          setTrackingSource('manual');
                          setSelectedCarrier(null);
                        }}>
                          <span className="dz-int-guided-option-icon"><Icons.Edit /></span>
                          <span><strong>أحدّث الحالات بنفسي</strong><small>أغيّر حالة الشحنة من لوحة الطلبات.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                        <button type="button" className={`dz-int-guided-option ${trackingSource === 'unsure' ? 'is-selected' : ''}`} aria-pressed={trackingSource === 'unsure'} onClick={() => {
                          setTrackingSource('unsure');
                          setSelectedCarrier(null);
                        }}>
                          <span className="dz-int-guided-option-icon"><Icons.HelpCircle /></span>
                          <span><strong>لست متأكداً</strong><small>ساعدني في التحقق من دعم شركة التوصيل.</small></span>
                          <span className="dz-int-guided-radio" />
                        </button>
                      </div>
                      {trackingSource === 'carrier' && (
                        <div className="dz-int-guided-carrier-select">
                          <label htmlFor="dz-int-guided-carrier">اختر شركة التوصيل</label>
                          <select id="dz-int-guided-carrier" value={selectedCarrier ?? ''} onChange={(event) => setSelectedCarrier(event.target.value as Exclude<typeof selectedCarrier, null>)}>
                            <option value="" disabled>اختر الشركة...</option>
                            {carrierConnections.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}
                            <option value="other">شركة أخرى / غير موجودة</option>
                          </select>
                        </div>
                      )}
                      <div className="dz-int-guided-actions">
                        <button type="button" className="dz-btn dz-btn-outline" onClick={() => setIntegrationStep(1)}>رجوع</button>
                        <button type="button" className="dz-btn" disabled={!trackingSource || (trackingSource === 'carrier' && !selectedCarrier)} onClick={() => setIntegrationStep(3)}>عرض خطوات الربط <Icons.ArrowLeft /></button>
                      </div>
                    </section>
                  )}

                  {integrationStep === 3 && integrationPlatform && trackingSource && (
                    <section className="dz-int-guided-result" aria-live="polite">
                      <div className="dz-int-guided-result-head">
                        <div>
                          <span className="dz-setup-eyebrow">خطة الربط الخاصة بمتجرك</span>
                          <h3>{integrationPlatform === 'shopify' ? 'استقبال طلبات Shopify' : integrationPlatform === 'website' ? 'ربط موقعك الإلكتروني' : 'إضافة الطلبات من لوحة تاجر تراك'}</h3>
                          <p>يمكنك الرجوع وتعديل اختياراتك أو إعادة الاختبار في أي وقت.</p>
                        </div>
                        <span className="dz-int-guided-ready"><Icons.Check /> تم تحديد المسار</span>
                      </div>

                      {shouldLoadIntegrationApiKey && !integrationApiKey && (
                        <p className="dz-int-guided-note" role="status">
                          {integrationApiKeyLoading ? 'جارٍ تحميل بيانات الربط...' : 'تعذر تحميل بيانات الربط. حدّث الصفحة ثم أعد فتح هذا القسم.'}
                        </p>
                      )}
                      <div className="dz-int-guided-summary">
                        <span><small>مصدر الطلبات</small><strong>{integrationPlatform === 'shopify' ? 'Shopify' : integrationPlatform === 'website' ? 'موقع خاص' : 'إضافة يدوية'}</strong></span>
                        <span><small>تحديث الشحنات</small><strong>{trackingSource === 'carrier' ? (selectedCarrier === 'other' ? 'شركة توصيل أخرى' : activeCarrierConnection?.name || 'شركة التوصيل') : trackingSource === 'manual' ? 'يدوي' : 'بحاجة إلى تحقق'}</strong></span>
                        <button type="button" onClick={() => setIntegrationStep(1)}>تعديل الاختيارات</button>
                      </div>

                      {integrationPlatform === 'shopify' && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">01</span><div><h4>اربط Shopify لاستقبال الطلبات</h4><p>أنشئ Webhook لحدث إنشاء الطلب داخل إعدادات Shopify.</p></div></div>
                          <div className="dz-int-guided-copy">
                            <div><small>رابط استقبال طلبات Shopify</small><code dir="ltr">{shopifyUrl}</code></div>
                            <button type="button" disabled={!integrationApiKey || integrationApiKeyLoading} onClick={() => copyToClipboard(shopifyUrl, 'guided-shopify-webhook')}>{copiedKey === 'guided-shopify-webhook' ? <Icons.Check /> : <Icons.Copy />} {copiedKey === 'guided-shopify-webhook' ? 'تم النسخ' : 'نسخ الرابط'}</button>
                          </div>
                          <ol className="dz-int-guided-steps">
                            <li>افتح Shopify ثم Settings ثم Notifications.</li>
                            <li>انتقل إلى Webhooks وأنشئ Webhook جديداً.</li>
                            <li>اختر Order creation، وحدد JSON.</li>
                            <li>ألصق الرابط واحفظ الإعداد.</li>
                          </ol>
                          <p className="dz-int-guided-note">هذا الربط يستقبل الطلبات فقط. تحديثات شركة الشحن تحتاج إلى إعداد منفصل أدناه عند اختيار التحديث الآلي.</p>
                        </article>
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'other' && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">02</span><div><h4>تحقّق من دعم شركة التوصيل</h4><p>لا نملك رابطاً مخصصاً لهذه الشركة حالياً. يجب التأكد من أنها تستطيع إرسال Webhook خارجي عند تغيّر حالة الشحنة.</p></div></div>
                          <button type="button" className="dz-support-copy" onClick={() => copyToClipboard('مرحباً، أريد ربط شركة التوصيل لديّ مع تاجر تراك. هل تدعمون إرسال Webhook خارجي عند تغيّر حالة الشحنة؟ ما طريقة تفعيله من لوحة التاجر وما تنسيق الأحداث المرسلة؟', 'guided-other-carrier-question')}>{copiedKey === 'guided-other-carrier-question' ? <Icons.Check /> : <Icons.Copy />} نسخ سؤال جاهز للدعم</button>
                          <div className="dz-int-guided-note">إلى أن تتأكد من دعم Webhooks، يمكنك تحديث الحالات يدوياً من لوحة الطلبات.</div>
                        </article>
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'ecotrack' && (
                        <EcoTrackConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'zrexpress' && (
                        <ZRExpressConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'maystro' && (
                        <MaystroConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'zimou' && (
                        <ZimouConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'elogistia' && (
                        <ElogistiaConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'ecom_v2' && (
                        <EcomV2ConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier === 'yalidine' && (
                        <YalidineConnectionPanel />
                      )}

                      {trackingSource === 'carrier' && selectedCarrier !== 'other' && selectedCarrier !== 'ecotrack' && selectedCarrier !== 'zrexpress' && selectedCarrier !== 'maystro' && selectedCarrier !== 'zimou' && selectedCarrier !== 'elogistia' && selectedCarrier !== 'ecom_v2' && selectedCarrier !== 'yalidine' && activeCarrierConnection && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">02</span><div><h4>إعداد تحديثات {activeCarrierConnection.name}</h4><p>{activeCarrierConnection.hint}</p></div></div>
                          <div className="dz-int-guided-copy">
                            <div><small>رابط استقبال تحديثات الشحن</small><code dir="ltr">{activeCarrierConnection.url}</code></div>
                            <button type="button" disabled={!integrationApiKey || integrationApiKeyLoading} onClick={() => copyToClipboard(activeCarrierConnection.url, `guided-carrier-${activeCarrierConnection.id}`)}>{copiedKey === `guided-carrier-${activeCarrierConnection.id}` ? <Icons.Check /> : <Icons.Copy />} نسخ الرابط</button>
                          </div>
                          <div className="dz-int-guided-meta"><span>طريقة الإرسال</span><strong>{activeCarrierConnection.method}</strong><span>المصادقة</span><strong>مضمّنة في رابط الاستقبال الخاص بمتجرك</strong></div>
                          <ol className="dz-int-guided-steps">
                            <li>افتح لوحة شركة التوصيل أو تواصل مع دعمها لتفعيل Webhook خارجي.</li>
                            <li>أضف رابط الاستقبال وحدد أحداث تغيّر الحالة التي تريد إرسالها.</li>
                            <li>اطلب إرسال حدث تجريبي وتأكد من وصوله إلى تاجر تراك.</li>
                          </ol>
                          <p className="dz-int-guided-note">{activeCarrierConnection.caveat} نسخ الرابط وحده لا يفعّل إرسال الأحداث من حساب شركة التوصيل.</p>
                          <button type="button" className="dz-support-copy" onClick={() => copyToClipboard(activeCarrierConnection.supportQuestion, `guided-carrier-question-${activeCarrierConnection.id}`)}>{copiedKey === `guided-carrier-question-${activeCarrierConnection.id}` ? <Icons.Check /> : <Icons.Copy />} نسخ سؤال جاهز لدعم الشركة</button>
                        </article>
                      )}

                      {integrationPlatform === 'website' && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">{trackingSource === 'carrier' && (selectedCarrier === 'zrexpress' || selectedCarrier === 'maystro' || selectedCarrier === 'zimou' || selectedCarrier === 'elogistia' || selectedCarrier === 'ecom_v2') ? '02' : '01'}</span><div><h4>بيانات الربط الخاصة بمتجرك</h4><p>تظهر هذه البيانات لأنك اخترت موقعاً مبرمجاً خاصاً.</p></div></div>
                          <div className="dz-int-guided-credentials">
                            <div className="dz-int-guided-credential">
                              <div className="dz-int-guided-credential-head"><small>مفتاح API</small><button type="button" onClick={() => setApiKeyRevealed((value) => !value)}>{apiKeyRevealed ? <Icons.EyeOff /> : <Icons.Eye />}{apiKeyRevealed ? 'إخفاء' : 'إظهار'}</button></div>
                              <code dir="ltr">{integrationApiKeyLoading ? 'جارٍ التحميل...' : apiKeyRevealed ? integrationApiKey : integrationApiKey ? `${integrationApiKey.slice(0, 8)}••••••••••••••••••••` : 'غير متاح'}</code>
                              <button type="button" className="dz-int-guided-copy-link" disabled={!integrationApiKey || integrationApiKeyLoading} onClick={() => copyToClipboard(integrationApiKey, 'guided-api-key')}>{copiedKey === 'guided-api-key' ? <Icons.Check /> : <Icons.Copy />} {copiedKey === 'guided-api-key' ? 'تم النسخ' : 'نسخ المفتاح'}</button>
                            </div>
                            <div className="dz-int-guided-credential">
                              <div className="dz-int-guided-credential-head"><small>معرّف المتجر</small></div>
                              <code dir="ltr">{merchantId}</code>
                              <button type="button" className="dz-int-guided-copy-link" onClick={() => copyToClipboard(merchantId, 'guided-store-id')}>{copiedKey === 'guided-store-id' ? <Icons.Check /> : <Icons.Copy />} {copiedKey === 'guided-store-id' ? 'تم النسخ' : 'نسخ المعرّف'}</button>
                            </div>
                            <div className="dz-int-guided-credential">
                              <div className="dz-int-guided-credential-head"><small>رابط استقبال الطلبات المباشر</small></div>
                              <code dir="ltr">{directWebhookUrl}?key={integrationApiKey}</code>
                              <button type="button" className="dz-int-guided-copy-link" onClick={() => copyToClipboard(`${directWebhookUrl}?key=${integrationApiKey}`, 'guided-direct-webhook')}>{copiedKey === 'guided-direct-webhook' ? <Icons.Check /> : <Icons.Copy />} {copiedKey === 'guided-direct-webhook' ? 'تم النسخ' : 'نسخ الرابط'}</button>
                            </div>
                          </div>
                          <div className="dz-int-guided-recommended">
                            <div><span className="dz-setup-eyebrow">الطريقة الموصى بها</span><h4>اربطه عبر SDK أو REST بمساعدة البرمجة</h4><p>انسخ أمر التثبيت والتوجيه. على الوكيل فحص النسخة المنشورة أولاً؛ إن لم تدعم واجهة المصدر الحالية، فعليه استخدام REST دون تخمين.</p></div>
                            <div className="dz-int-guided-package-row">
                              <div className="dz-int-guided-package-select">
                                {(['npm', 'pnpm', 'yarn', 'bun'] as const).map((pm) => <button key={pm} type="button" className={packageManager === pm ? 'is-active' : ''} onClick={() => setPackageManager(pm)}>{pm}</button>)}
                              </div>
                              <code dir="ltr">{installCommands[packageManager]}</code>
                              <button type="button" onClick={() => copyToClipboard(installCommands[packageManager], 'guided-sdk-install')}>{copiedKey === 'guided-sdk-install' ? <Icons.Check /> : <Icons.Copy />} نسخ الأمر</button>
                            </div>
                            <div className="dz-int-guided-agent-row"><code dir="ltr">{sdkAgentPrompt}</code><button type="button" onClick={() => copyToClipboard(sdkAgentPrompt, 'guided-sdk-agent')}>{copiedKey === 'guided-sdk-agent' ? <Icons.Check /> : <Icons.Copy />} نسخ التوجيه</button></div>
                            <p className="dz-int-guided-note">قد تختلف نسخة npm عن مصدر SDK في المستودع. افحص رقم النسخة وملفات الأنواع قبل كتابة الكود؛ عند غياب واجهة core استخدم REST. لا تضع مفتاح API في المتصفح أو مستودع عام.</p>
                          </div>
                          <details className="dz-int-guided-details">
                            <summary>أمثلة المطور والتوثيق المتقدم</summary>
                            <div className="dz-code-container">
                              <div className="dz-code-header">
                                <div className="dz-code-tabs">
                                  {(['html', 'react', 'node', 'curl', 'agent'] as const).map((tab) => <button key={tab} type="button" className={`dz-code-tab-btn ${sdkCodeTab === tab ? 'active' : ''}`} onClick={() => setSdkCodeTab(tab)}>{tab === 'html' ? 'HTML' : tab === 'react' ? 'React / Next.js' : tab === 'node' ? 'Node.js' : tab === 'curl' ? 'REST API' : 'AI Prompt'}</button>)}
                                </div>
                                <button type="button" className="dz-btn dz-btn-outline" onClick={() => copyToClipboard(({ html: htmlCodeSnippet, react: reactCodeSnippet, node: nodeCodeSnippet, curl: curlSnippet, agent: sdkAgentPrompt })[sdkCodeTab], `guided-advanced-${sdkCodeTab}`)}>{copiedKey === `guided-advanced-${sdkCodeTab}` ? <Icons.Check /> : <Icons.Copy />} نسخ المثال</button>
                              </div>
                              <pre className="dz-code-pre">{sdkCodeTab === 'html' ? htmlCodeSnippet : sdkCodeTab === 'react' ? reactCodeSnippet : sdkCodeTab === 'node' ? nodeCodeSnippet : sdkCodeTab === 'curl' ? curlSnippet : sdkAgentPrompt}</pre>
                            </div>
                            <p className="dz-int-guided-doc-link"><a href={`${siteUrl}/skill.md`} target="_blank" rel="noreferrer">فتح توثيق تاجر تراك للمطورين</a></p>
                          </details>
                          <details className="dz-int-guided-details">
                            <summary>مرجع خصائص HTML للتتبع دون كتابة JavaScript</summary>
                            <p>أضف خاصية التتبع إلى نموذج الدفع بعد تهيئة SDK في ترويسة الموقع.</p>
                            <div className="dz-table-container">
                              <table className="dz-data-table">
                                <thead><tr><th>الخاصية</th><th>النوع</th><th>الاستخدام</th></tr></thead>
                                <tbody>
                                  <tr><td><code>data-dz-checkout</code></td><td>مطلوبة</td><td>تُضاف إلى عنصر form لتفعيل التقاط الطلب.</td></tr>
                                  <tr><td><code>data-dz-redirect="tracking"</code></td><td>اختيارية</td><td>توجيه العميل إلى صفحة التتبع بعد تسجيل الطلب.</td></tr>
                                  <tr><td><code>data-dz-field="name"</code></td><td>اختيارية</td><td>تحديد حقل اسم العميل عند اختلاف اسم الحقل في النموذج.</td></tr>
                                  <tr><td><code>data-dz-field="phone"</code></td><td>اختيارية</td><td>تحديد حقل رقم هاتف العميل.</td></tr>
                                  <tr><td><code>data-dz-field="wilaya"</code></td><td>اختيارية</td><td>تحديد حقل ولاية التوصيل.</td></tr>
                                  <tr><td><code>data-dz-prevent-default="false"</code></td><td>اختيارية</td><td>السماح للنموذج بإكمال إرساله الأصلي بالتوازي مع التسجيل في تاجر تراك.</td></tr>
                                </tbody>
                              </table>
                            </div>
                          </details>
                          <details className="dz-int-guided-details">
                            <summary>ربط Odoo أو نظام ERP مخصص</summary>
                            <p>يمكن إعداد Automated Action أو Webhook في نظام ERP لإرسال الطلبات أو أحداث الشحن إلى نقطة الاستقبال المخصصة.</p>
                            <div className="dz-int-guided-copy">
                              <div><small>Odoo Webhook URL</small><code dir="ltr">{odooUrl}</code></div>
                              <button type="button" disabled={!integrationApiKey || integrationApiKeyLoading} onClick={() => copyToClipboard(odooUrl, 'guided-odoo-webhook')}>{copiedKey === 'guided-odoo-webhook' ? <Icons.Check /> : <Icons.Copy />} نسخ الرابط</button>
                            </div>
                          </details>
                        </article>
                      )}

                      {integrationPlatform === 'manual' && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">01</span><div><h4>لا تحتاج إلى إعداد ربط للطلبات</h4><p>يمكنك إضافة الطلبات مباشرة من لوحة تاجر تراك. سنستخدم التحديث اليدوي أو ربط شركة الشحن حسب اختيارك في الخطوة التالية.</p></div></div>
                          <button type="button" className="dz-btn" onClick={() => {
                            setActiveTab('orders');
                            setIsAddOrderModalOpen(true);
                          }}>إضافة طلب جديد <Icons.ArrowLeft /></button>
                        </article>
                      )}

                      {trackingSource === 'manual' && (
                        <article className="dz-int-guided-panel dz-int-guided-manual">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">02</span><div><h4>تحديث الحالات من لوحة الطلبات</h4><p>بعد ظهور الطلب في القائمة، افتحه واختر الحالة الجديدة. لا تحتاج إلى Webhook من شركة التوصيل لهذا المسار.</p></div></div>
                          <button type="button" className="dz-btn dz-btn-outline" onClick={() => setActiveTab('orders')}>فتح الطلبات <Icons.ArrowLeft /></button>
                        </article>
                      )}

                      {trackingSource === 'unsure' && (
                        <article className="dz-int-guided-panel">
                          <div className="dz-int-guided-panel-title"><span className="dz-int-guided-number">02</span><div><h4>اسأل شركة التوصيل عن Webhooks</h4><p>اسأل الدعم إن كان حسابك يستطيع إرسال إشعار إلى رابط خارجي عند تغيّر حالة الشحنة.</p></div></div>
                          <button type="button" className="dz-support-copy" onClick={() => copyToClipboard('مرحباً، هل يدعم حسابي إرسال Webhook خارجي إلى رابط أقدمه لكم عند تغيّر حالة الشحنة؟ وأين يمكنني تفعيل ذلك وما تنسيق الأحداث المرسلة؟', 'guided-unsure-question')}>{copiedKey === 'guided-unsure-question' ? <Icons.Check /> : <Icons.Copy />} نسخ السؤال</button>
                          <div className="dz-int-guided-note">إلى أن تتأكد من ذلك، يمكنك اختيار التحديث اليدوي دون تعطيل استقبال الطلبات.</div>
                          <button type="button" className="dz-btn dz-btn-outline" onClick={() => {
                            setTrackingSource('manual');
                            setSelectedCarrier(null);
                          }}>اعتماد التحديث اليدوي مؤقتاً</button>
                        </article>
                      )}

                      <div className="dz-int-guided-footer">
                        <span>اختياراتك محفوظة على هذا المتصفح لهذا المتجر.</span>
                        <button type="button" onClick={() => setIntegrationStep(1)}>تعديل الاختيارات</button>
                        <button type="button" onClick={() => {
                          setIntegrationPlatform(null);
                          setTrackingSource(null);
                          setSelectedCarrier(null);
                          setIntegrationStep(1);
                          setApiKeyRevealed(false);
                        }}>إعادة الاختبار من البداية</button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: MAPPINGS */}
          {activeTab === 'mappings' && (
            <div>
              <div className="dz-card-box" style={{ marginBottom: '32px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>تطبيق قوالب معربة جاهزة بضغطة زر</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '20px' }}>بدلاً من كتابة الحالات يدوياً، حمّل الحزمة الموصى بها لشركتك:</p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <form action={async (fd) => { await applyPresetMappings(fd); showToast('تم تطبيق الحزمة بنجاح'); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="yalidine" />
                    <button type="submit" className="dz-btn dz-btn-outline">حزمة ياليدين</button>
                  </form>
                  <form action={async (fd) => { await applyPresetMappings(fd); showToast('تم تطبيق الحزمة بنجاح'); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="ecotrack" />
                    <button type="submit" className="dz-btn dz-btn-outline">حزمة إيكوتراك</button>
                  </form>
                  <form action={async (fd) => { await applyPresetMappings(fd); showToast('تم تطبيق الحزمة بنجاح'); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="zrexpress" />
                    <button type="submit" className="dz-btn dz-btn-outline">حزمة ZR Express</button>
                  </form>
                  <form action={async (fd) => { await applyPresetMappings(fd); showToast('تم تطبيق الحزمة بنجاح'); }}>
                    <input type="hidden" name="merchant_id" value={merchantId} /><input type="hidden" name="preset_type" value="shopify" />
                    <button type="submit" className="dz-btn dz-btn-outline">حزمة شوبيفاي</button>
                  </form>
                </div>
              </div>

              <div style={{ marginBottom: '32px' }}>
                <MappingForm merchantId={merchantId} />
              </div>

              <div className="dz-table-wrap">
                <div className="dz-table-header">
                  <h3>المطابقات المفعلة ({mappings.length})</h3>
                </div>
                <div className="dz-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>الكود الأصلي (Source)</th>
                        <th>ما يظهر للزبون (Display)</th>
                        <th style={{ textAlign: 'center' }}>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.length === 0 ? (
                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-muted)' }}>لا توجد مطابقات مخصصة. استخدم الحزم الجاهزة أعلاه.</td></tr>
                      ) : (
                        mappings.map((m) => {
                          const isEditing = editingMappingId === m.id;
                          return (
                            <tr key={m.id}>
                              <td><span className="dz-mono">{m.source_status}</span></td>
                              <td>
                                {isEditing ? (
                                  <input type="text" value={editDisplayStatus} onChange={(e) => setEditDisplayStatus(e.target.value)} className="input" style={{ padding: '8px 12px' }} autoFocus />
                                ) : (
                                  <span className="dz-pill">{m.display_status}</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button onClick={() => handleSaveInlineEdit(m.source_status)} disabled={isSavingEdit} className="dz-btn" style={{ padding: '6px 12px', fontSize: '11px' }}>حفظ</button>
                                    <button onClick={() => setEditingMappingId(null)} className="dz-btn dz-btn-outline" style={{ padding: '6px 12px', fontSize: '11px' }}>إلغاء</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button onClick={() => { setEditingMappingId(m.id); setEditDisplayStatus(m.display_status); }} className="dz-btn dz-btn-outline" style={{ padding: '6px 12px', fontSize: '11px' }}>تعديل</button>
                                    <form action={async (fd) => { await deleteStatusMapping(fd); showToast('تم حذف المطابقة بنجاح'); }}>
                                      <input type="hidden" name="id" value={m.id} />
                                      <button type="submit" className="dz-btn dz-btn-outline" style={{ padding: '6px 12px', fontSize: '11px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>حذف</button>
                                    </form>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BILLING */}
          {activeTab === 'settings' && (
            <div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: '18px', padding: '18px 20px', marginBottom: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>01 / STORE PROFILE</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>معلومات المتجر</h2>
                  </div>
                  <Icons.Store />
                </div>
                <form onSubmit={handleSaveBranding}>
                  <div className="dz-settings-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(240px, .85fr)', gap: '16px', alignItems: 'end' }}>
                    <div>
                      <label htmlFor="merchant-settings-store-name" className="formLabel">اسم المتجر</label>
                      <input id="merchant-settings-store-name" type="text" className="input" value={storeNameDraft} maxLength={80} required onChange={(event) => setStoreNameDraft(event.target.value)} placeholder="اسم متجرك" />
                      <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>يظهر الاسم بجانب شعارك في صفحات العملاء.</p>
                    </div>
                    <div>
                      <ImageUploadField label="شعار المتجر" value={brandConfig.logoUrl || ''} onChange={(url) => updateBrandConfig('logoUrl', url)} merchantId={merchantId} folder="upsell-products" quality={0.9} placeholder="ارفع شعار متجرك" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', marginTop: '14px', paddingTop: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>يُستخدم الشعار نفسه في صفحة التتبع وصفحة تأكيد الطلب.</span>
                    <button type="submit" className="dz-btn" disabled={isSavingBrand || (!hasUnsavedBrandChanges && !hasUnsavedStoreNameChanges)} style={{ minWidth: '132px', padding: '9px 18px', opacity: isSavingBrand || (!hasUnsavedBrandChanges && !hasUnsavedStoreNameChanges) ? .55 : 1 }}>
                      {isSavingBrand ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                    </button>
                  </div>
                </form>
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: '18px', padding: '18px 20px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>02 / TELEGRAM SERVICES</span>
                    <h2 style={{ margin: '3px 0 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-main)' }}>خدمات تيليجرام</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-muted)' }}>تحكم في الرسائل التي تصل إلى عملاء متجرك.</p>
                  </div>
                  <Icons.Send />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0 }}>
                  <div style={{ padding: '11px 16px 8px 8px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--ink-main)' }}>روابط التتبع</strong>
                      <span style={{ fontSize: '11px', color: telegramEnabled ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{telegramEnabled ? 'مفعّل' : 'معطّل'}</span>
                    </div>
                    <p style={{ minHeight: '34px', margin: '0 0 10px', color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.6 }}>إرسال رابط تتبع الشحنة تلقائياً عند تسجيل الطلب وموافقة العميل.</p>
                    <button type="button" role="switch" aria-checked={telegramEnabled} aria-label="تفعيل إرسال روابط التتبع عبر تيليجرام" disabled={isSavingTelegram}
                      onClick={() => startTransitionTelegram(async () => {
                        const next = !telegramEnabled;
                        setTelegramEnabled(next);
                        const result = await toggleTelegramTracking(merchantId, next);
                        if (result?.error) { setTelegramEnabled(!next); showToast(result.error); }
                        else showToast(next ? 'تم تفعيل إرسال روابط التتبع.' : 'تم تعطيل إرسال روابط التتبع.');
                      })}
                      style={{ width: '48px', height: '27px', border: 0, borderRadius: '99px', padding: '3px', display: 'flex', alignItems: 'center', justifyContent: telegramEnabled ? 'flex-end' : 'flex-start', direction: 'ltr', background: telegramEnabled ? '#273b30' : '#cbd1ca', cursor: isSavingTelegram ? 'wait' : 'pointer', opacity: isSavingTelegram ? .65 : 1, transition: 'background .18s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)' }}>
                      <span style={{ width: '21px', height: '21px', display: 'block', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' }} />
                    </button>
                  </div>
                  <div style={{ padding: '11px 8px 8px 16px', minWidth: 0, borderInlineStart: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '7px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--ink-main)' }}>تأكيد الطلب</strong>
                      <span style={{ fontSize: '11px', color: confirmationEnabled && hasActivePaidPlan ? '#267548' : 'var(--ink-muted)', fontWeight: 700 }}>{!hasActivePaidPlan ? 'للباقات المدفوعة' : confirmationEnabled ? 'مفعّل' : 'معطّل'}</span>
                    </div>
                    <p style={{ minHeight: '34px', margin: '0 0 10px', color: 'var(--ink-muted)', fontSize: '12px', lineHeight: 1.6 }}>إرسال رابط آمن للعميل لتأكيد الطلب أو طلب إلغائه.</p>
                    <button type="button" role="switch" aria-checked={confirmationEnabled && hasActivePaidPlan} aria-label="تفعيل طلب تأكيد الطلب عبر تيليجرام" disabled={!hasActivePaidPlan || isSavingConfirmation}
                      onClick={() => startTransitionConfirmation(async () => {
                        const next = !confirmationEnabled;
                        setConfirmationEnabled(next);
                        const result = await toggleConfirmationTelegram(next);
                        if (result?.error) { setConfirmationEnabled(!next); showToast(result.error); }
                        else showToast(next ? 'تم تفعيل طلب تأكيد الطلب.' : 'تم تعطيل طلب تأكيد الطلب.');
                      })}
                      style={{ width: '48px', height: '27px', border: 0, borderRadius: '99px', padding: '3px', display: 'flex', alignItems: 'center', justifyContent: confirmationEnabled ? 'flex-end' : 'flex-start', direction: 'ltr', background: confirmationEnabled && hasActivePaidPlan ? '#273b30' : '#cbd1ca', cursor: !hasActivePaidPlan || isSavingConfirmation ? 'not-allowed' : 'pointer', opacity: !hasActivePaidPlan || isSavingConfirmation ? .55 : 1, transition: 'background .18s ease', boxShadow: 'inset 0 1px 2px rgba(0,0,0,.12)' }}>
                      <span style={{ width: '21px', height: '21px', display: 'block', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.18)' }} />
                    </button>
                  </div>
                </div>
                {!hasActivePaidPlan && <p style={{ margin: '8px 0 0', paddingTop: '9px', borderTop: '1px solid var(--border-soft)', color: '#946b2d', fontSize: '11px' }}>ميزة تأكيد الطلب متاحة في الباقات المدفوعة Basic وGrowth وScale.</p>}
              </div>

              <div style={{ margin: '0 0 13px' }}>
                <span style={{ fontSize: '10px', letterSpacing: '.08em', color: 'var(--ink-light)', fontWeight: 800 }}>03 / SUBSCRIPTION</span>
                <h2 style={{ margin: '3px 0 0', fontSize: '19px', fontWeight: 800, color: 'var(--ink-main)' }}>الاشتراك والاستهلاك</h2>
              </div>

              {/* Unlimited Plan Status Card (brand-aligned, no emoji) */}
              {isUnlimitedPlan && (
                <div className="dz-unlimited-card" role="status" aria-live="polite">
                  <div className="dz-unlimited-card-content">
                    <div className="dz-unlimited-header">
                      <span className="dz-unlimited-badge">
                        <Icons.Zap /> باقة غير محدودة
                      </span>
                      <span className="dz-unlimited-pill">
                        <Icons.Check /> نشطة
                      </span>
                    </div>
                    <h3 className="dz-unlimited-title">
                      حسابك يعمل بالباقة غير المحدودة وبلا أي سقف للطلبات
                    </h3>
                    <p className="dz-unlimited-desc">
                      يمكنك تسجيل واستقبال وتتبع أي عدد من الشحنات شهرياً بكامل ميزات التتبع الفوري ودون أي حدود استهلاك.
                    </p>
                  </div>
                  <div className="dz-unlimited-aside">
                    <span className="dz-unlimited-symbol">∞</span>
                    <span className="dz-unlimited-symbol-label">سقف غير محدود</span>
                  </div>
                </div>
              )}

              <div className="dz-stats-bar" style={{ marginBottom: '20px' }}>
                <div className="dz-stat-item">
                  <span className="dz-stat-title">الباقة الحالية</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span className="dz-stat-value" style={{ margin: 0, textTransform: 'capitalize' }}>
                      {({ starter: 'مجانية (30 طلباً)', basic: '100 طلب', growth: '200 طلب', scale: 'غير محدودة' }[subscription.tier] || subscription.tier)}
                    </span>
                    <span className={`dz-pill ${subscription.status === 'active' ? 'dz-pill-success' : 'dz-pill-danger'}`}>
                      {subscription.status === 'active' ? 'نشط' : 'موقوف'}
                    </span>
                  </div>
                  <span className="dz-stat-sub">
                    {subscription.expiresAt ? `تاريخ الانتهاء: ${new Date(subscription.expiresAt).toLocaleDateString('ar-DZ')}` : subscription.tier === 'starter' ? 'لا تحتاج الباقة المجانية إلى تجديد مدفوع' : 'تُفعّل الباقة بعد مراجعة وصل الدفع'}
                  </span>
                </div>
                
                <div className="dz-stat-item">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="dz-stat-title" style={{ margin: 0 }}>الاستهلاك الشهري (الطلبات)</span>
                    {isUnlimitedPlan && <span className="dz-unlimited-stat-tag">∞ سقف غير محدود</span>}
                  </div>
                  <span className="dz-stat-value" style={{ marginBottom: '16px' }}>
                    {subscription.used}{' '}
                    <span style={{ fontSize: '14px', color: isUnlimitedPlan ? '#16a34a' : 'var(--ink-muted)', fontWeight: 600 }}>
                      / {isUnlimitedPlan ? '∞ (غير محدود)' : normalizedLimit}
                    </span>
                  </span>
                  {isUnlimitedPlan ? (
                    <div className="dz-unlimited-progress-track">
                      <div className="dz-unlimited-progress-fill" />
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-base)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(Math.round((subscription.used / (normalizedLimit || 1)) * 100), 100)}%`, height: '100%', background: subscription.used >= normalizedLimit ? '#ef4444' : 'var(--ink-main)', transition: 'width 0.5s ease' }} />
                    </div>
                  )}
                </div>
              </div>
              <p className="dz-billing-usage-note">
                {isUnlimitedPlan 
                  ? 'باقتك الحالية لا تضع سقفاً شهرياً للطلبات.' 
                  : `تبقّى لك ${Math.max(normalizedLimit - subscription.used, 0)} طلباً من أصل ${normalizedLimit} لهذا الشهر. عند الاقتراب من الحد، يمكنك اختيار باقة أعلى من هنا. تُطبّق الباقة بعد مراجعة الدفع وتأكيده.`}
              </p>

              {/* PLAN SELECTION SECTION — conditional on active paid plan */}
              {hasActivePaidPlan && isUnlimitedPlan ? (
                /* Scale plan active: no need to pick a pack, offer advance renewal only */
                <div className="dz-active-plan-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <span className="dz-unlimited-badge"><Icons.Shield /> الباقة غير المحدودة نشطة</span>
                    {expiryDateFormatted && (
                      <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>حتى {expiryDateFormatted}</span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.7 }}>
                    أنت على الباقة غير المحدودة. لا حاجة لاختيار باقة أخرى حالياً.
                    {expiryDateFormatted && ` تجديد الباقة الحالية سيكون في ${expiryDateFormatted}.`}
                  </p>
                  <button
                    type="button"
                    className="dz-btn dz-btn-outline"
                    style={{ fontSize: '13px' }}
                    onClick={() => setShowAdvanceRenewal(prev => !prev)}
                  >
                    {showAdvanceRenewal ? 'إلغاء الدفع المسبق' : 'دفع تجديد الشهر القادم مسبقاً'}
                  </button>
                  {!showAdvanceRenewal && (
                    <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--ink-muted)' }}>
                      يمكنك تحويل مبلغ التجديد مسبقاً قبل انتهاء الباقة وإرسال وصل الدفع للمراجعة.
                    </p>
                  )}
                </div>
              ) : (
                /* Not on scale or no active paid plan: show full plan chooser */
                <section className="dz-billing-pricing" aria-labelledby="dz-billing-pricing-title" dir="rtl">
                  {hasActivePaidPlan && expiryDateFormatted && (
                    <div className="dz-billing-next-cycle-banner">
                      <strong>اختيار الباقة للشهر القادم</strong>
                      <p>
                        باقتك الحالية نشطة حتى {expiryDateFormatted}. أي باقة تختارها وتدفع لها الآن ستُفعَّل تلقائياً في الدورة القادمة ابتداءً من ذلك التاريخ.
                      </p>
                    </div>
                  )}
                  <div className="dz-billing-pricing-head"><span className="dz-setup-eyebrow">الأسعار الشهرية</span><h3 id="dz-billing-pricing-title">اختَر الباقة حسب عدد طلباتك</h3><p>يُحسب الحد حسب الطلبات المسجّلة خلال الشهر.</p></div>
                  <div className="dz-billing-plan-list">
                    <div className={`dz-billing-plan ${subscription.tier === 'starter' ? 'is-current' : ''}`}><div><strong>مجانية</strong><small>أقل من 30 طلباً شهرياً</small></div><b>0 <small>دج / شهر</small></b><span>{subscription.tier === 'starter' ? 'باقتك الحالية' : 'للتجربة والبدء'}</span><div className="dz-billing-plan-benefit">إدارة أساسية للطلبات ورابط تتبّع لكل شحنة.</div></div>
                    <div className={`dz-billing-plan ${subscription.tier === 'basic' ? 'is-current' : ''} ${selectedUpgradeTier === 'basic' ? 'is-selected' : ''}`}>
                      <div><strong>100 طلب</strong><small>حتى 100 طلب شهرياً</small></div>
                      <b>1,000 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للمتاجر التي تحتاج مساحة أكبر للطلبات.</div>
                      {subscription.tier === 'basic' && hasActivePaidPlan ? (
                        <span style={{ fontSize: '11px', color: '#263b30', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>
                          باقتك الحالية{expiryDateFormatted ? ` (حتى ${expiryDateFormatted})` : ''}
                        </span>
                      ) : (
                        <button type="button" onClick={() => setSelectedUpgradeTier('basic')}>
                          {selectedUpgradeTier === 'basic' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                        </button>
                      )}
                    </div>
                    <div className={`dz-billing-plan ${subscription.tier === 'growth' ? 'is-current' : ''} ${selectedUpgradeTier === 'growth' ? 'is-selected' : ''}`}>
                      <div><strong>200 طلب</strong><small>حتى 200 طلب شهرياً</small></div>
                      <b>1,800 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للنمو مع متابعة عدد أكبر من الشحنات.</div>
                      {subscription.tier === 'growth' && hasActivePaidPlan ? (
                        <span style={{ fontSize: '11px', color: '#263b30', fontWeight: 700, textAlign: 'center', padding: '6px 0' }}>
                          باقتك الحالية{expiryDateFormatted ? ` (حتى ${expiryDateFormatted})` : ''}
                        </span>
                      ) : (
                        <button type="button" onClick={() => setSelectedUpgradeTier('growth')}>
                          {selectedUpgradeTier === 'growth' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                        </button>
                      )}
                    </div>
                    <div className={`dz-billing-plan ${subscription.tier === 'scale' ? 'is-current' : ''} ${selectedUpgradeTier === 'scale' ? 'is-selected' : ''}`}>
                      <div><strong>غير محدودة</strong><small>دون سقف شهري للطلبات</small></div>
                      <b>2,500 <small>دج / شهر</small></b>
                      <div className="dz-billing-plan-benefit">للمتاجر ذات حجم الشحنات المرتفع.</div>
                      <button type="button" onClick={() => setSelectedUpgradeTier('scale')}>
                        {selectedUpgradeTier === 'scale' ? 'الباقة المختارة' : (hasActivePaidPlan ? 'اختيار للشهر القادم' : 'اختيار الباقة')}
                      </button>
                    </div>
                  </div>
                  <div className="dz-billing-selected-summary"><div><strong>الباقة المحددة للدفع: ${{ basic: '100 طلب', growth: '200 طلب', scale: 'غير محدودة' }[selectedUpgradeTier]}{hasActivePaidPlan && expiryDateFormatted ? ` (تبدأ ${expiryDateFormatted})` : ''}</strong><p>حوّل المبلغ عبر BaridiMob ثم أرسل رقم العملية ورابط صورة الوصل في النموذج أدناه. لن تتغير باقتك حتى تتم مراجعة الدفع.</p></div><div className="dz-billing-selected-price">{{ basic: '1,000', growth: '1,800', scale: '2,500' }[selectedUpgradeTier]} <small>دج / شهر</small></div></div>
                </section>
              )}

              {/* BaridiMob payment form: always shown except when scale plan is active and advance renewal is not requested */}
              {(!hasActivePaidPlan || !isUnlimitedPlan || showAdvanceRenewal) && (
              <>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '32px 0 24px' }}>تأكيد التحويل عبر BaridiMob</h3>
              
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                
                {/* Form Side */}
                <div className="dz-card-box" style={{ flex: '1 1 400px' }}>
                  
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>رقم الحساب البريدي الجاري (RIP):</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                      <strong className="dz-mono" style={{ fontSize: '16px', background: 'transparent', border: 'none', padding: 0 }}>00799999123456789</strong>
                      <button className="dz-icon-btn" onClick={() => copyToClipboard('00799999002233445566', 'rip')}><Icons.Copy /></button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '8px' }}>صاحب الحساب: تاجر تراك </div>
                  </div>

                  <form onSubmit={handleSubmitProof}>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="formLabel">اختر الباقة</label>
                      <select value={selectedUpgradeTier} onChange={(e) => setSelectedUpgradeTier(e.target.value as any)} className="input">
                        <option value="basic">100 طلب شهرياً — 1,000 دج</option>
                        <option value="growth">200 طلب شهرياً — 1,800 دج</option>
                        <option value="scale">طلبات غير محدودة — 2,500 دج</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label className="formLabel">رقم العملية (Transaction Ref)</label>
                      <input type="text" name="transaction_ref" placeholder="BM-..." className="input" required />
                    </div>
                    <div style={{ marginBottom: '24px' }}>
                      <ImageUploadField
                        label="صورة وصل التحويل"
                        required
                        value={proofImageUrl}
                        onChange={setProofImageUrl}
                        merchantId={merchantId}
                        folder="payment-receipts"
                        quality={0.78}
                        placeholder="ارفع صورة الوصل (CCP / BaridiMob)"
                      />
                      <small style={{ display: 'block', marginTop: '6px', color: 'var(--ink-muted)', fontSize: '11px' }}>
                        الصورة تُرفع مباشرة وتُحفظ تلقائياً — لا تحتاج لرابط خارجي
                      </small>
                    </div>
                    <button type="submit" disabled={isSubmittingProof} className="dz-btn" style={{ width: '100%' }}>
                      {isSubmittingProof ? 'جاري الإرسال...' : 'إرسال وصل التحويل للمراجعة'}
                    </button>
                  </form>
                </div>

                {/* History Side */}
                <div style={{ flex: '2 1 500px' }}>
                  <div className="dz-table-wrap">
                    <div className="dz-table-header">
                      <h3>سجل المدفوعات</h3>
                    </div>
                    <div className="dz-table-scroll" style={{ maxHeight: '420px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>الباقة والمبلغ</th>
                            <th>المرجع</th>
                            <th>الحالة</th>
                            <th>التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--ink-muted)' }}>لم تقم بأي تحويلات بعد.</td></tr>
                          ) : (
                            payments.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <strong style={{ display: 'block' }}>{p.plan_tier.toUpperCase()}</strong>
                                  <span className="dz-mono" style={{ fontSize: '11px', border: 'none', background: 'transparent', padding: 0 }}>{p.amount_dzd.toLocaleString()} DZD</span>
                                </td>
                                <td><span className="dz-mono">{p.transaction_ref || '—'}</span></td>
                                <td>
                                  {p.status === 'approved' && <span className="dz-pill dz-pill-success">مقبول</span>}
                                  {p.status === 'pending' && <span className="dz-pill dz-pill-warning">قيد المراجعة</span>}
                                  {p.status === 'rejected' && <span className="dz-pill dz-pill-danger">مرفوض</span>}
                                </td>
                                <td style={{ color: 'var(--ink-muted)' }}>{new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {selectedOrder && typeof document !== 'undefined' && createPortal((
            <div className="dz-order-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedOrderId(null); }}>
              <aside className="dz-order-detail-panel" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" onMouseDown={(event) => event.stopPropagation()}>
                <div className="dz-order-detail-head">
                  <div>
                    <span className="dz-order-detail-kicker">تفاصيل الشحنة</span>
                    <h2 id="order-detail-title">{selectedOrder.external_order_id}</h2>
                    <p>{selectedOrder.customer_name || 'عميل'} · {formatOrderDate(selectedOrder.created_at)}</p>
                  </div>
                  <button type="button" className="dz-order-detail-close" aria-label="إغلاق التفاصيل" onClick={() => setSelectedOrderId(null)}><Icons.X /></button>
                </div>
                <div className="dz-order-detail-status">
                  <div><small>الحالة الحالية</small><strong>{getStatusLabel(selectedOrder.current_status)}</strong></div>
                  <span className={`dz-pill dz-pill-${getStatusBadgeStyle(selectedOrder.current_status)}`}>{isAttentionStatus(selectedOrder.current_status) ? 'تحتاج إلى متابعة' : getStatusLabel(selectedOrder.current_status)}</span>
                </div>
                <div className="dz-order-detail-fields">
                  <div className="dz-order-detail-field"><span>اسم العميل</span><strong>{selectedOrder.customer_name || 'غير متوفر'}</strong></div>
                  <div className="dz-order-detail-field"><span>رقم الهاتف</span><strong dir="ltr">{selectedOrder.customer_phone || 'غير متوفر'}</strong></div>
                  <div className="dz-order-detail-field"><span>اسم الطرد / المنتجات</span><strong>{selectedOrder.product_name || 'غير متوفر'}</strong></div>
                  <div className="dz-order-detail-field"><span>شركة الشحن</span><strong>{selectedOrder.carrier_name || 'غير محددة'}</strong></div>
                  <div className="dz-order-detail-field"><span>رقم التتبع</span><strong>{selectedOrder.carrier_tracking_number || 'غير متوفر'}</strong></div>
                  {selectedOrder.carrier_name === 'Maystro Delivery' && selectedOrder.carrier_order_id && (
                    <div className="dz-order-detail-field"><span>معرّف الطلب لدى Maystro</span><strong dir="ltr">{selectedOrder.carrier_order_id}</strong></div>
                  )}
                  {selectedOrder.carrier_name === 'Maystro Delivery' && selectedOrder.carrier_metadata && (
                    <>
                      <div className="dz-order-detail-field"><span>الولاية</span><strong>{selectedOrder.carrier_metadata.wilaya || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>البلدية</span><strong>{selectedOrder.carrier_metadata.communeName || selectedOrder.carrier_metadata.commune || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>العنوان</span><strong>{selectedOrder.carrier_metadata.destinationText || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>نوع التوصيل</span><strong>{Number(selectedOrder.carrier_metadata.deliveryType) === 1 ? 'توصيل إلى المنزل' : Number(selectedOrder.carrier_metadata.deliveryType) === 2 ? 'مكتب / Stopdesk' : Number(selectedOrder.carrier_metadata.deliveryType) === 3 ? 'نقطة استلام' : 'غير محدد'}</strong></div>
                      <div className="dz-order-detail-field"><span>المبلغ الإجمالي لدى Maystro</span><strong>{selectedOrder.carrier_metadata.totalPrice != null ? `${selectedOrder.carrier_metadata.totalPrice} دج` : 'غير متوفر'}</strong></div>
                      {selectedOrder.carrier_metadata.customerPhone2 && (
                        <div className="dz-order-detail-field"><span>رقم الهاتف الإضافي</span><strong dir="ltr">{selectedOrder.carrier_metadata.customerPhone2}</strong></div>
                      )}
                      {Array.isArray(selectedOrder.carrier_metadata.products) && selectedOrder.carrier_metadata.products.length > 0 && (
                        <div className="dz-order-detail-field" style={{ gridColumn: '1 / -1' }}>
                          <span>تفاصيل محتويات الطرد</span>
                          <strong style={{ display: 'grid', gap: '6px', fontWeight: 650 }}>
                            {selectedOrder.carrier_metadata.products.map((item: any, index: number) => (
                              <span key={index}>
                                {item.description || item.product || 'منتج'}
                                {item.quantity ? ` × ${item.quantity}` : ''}
                                {item.unitPrice != null ? ` · ${item.unitPrice} دج` : ''}
                              </span>
                            ))}
                          </strong>
                        </div>
                      )}

                    </>
                  )}
                  {selectedOrder.carrier_name === 'Zimou Express' && selectedOrder.carrier_metadata && (
                    <>
                      <div className="dz-order-detail-field"><span>معرّف الطرد لدى Zimou</span><strong dir="ltr">{selectedOrder.carrier_order_id || selectedOrder.carrier_metadata.zimouPackageId || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>الولاية</span><strong>{selectedOrder.carrier_metadata.wilaya || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>البلدية</span><strong>{selectedOrder.carrier_metadata.commune || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>عنوان التوصيل</span><strong>{selectedOrder.carrier_metadata.address || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>شركة التوصيل الشريكة</span><strong>{selectedOrder.carrier_metadata.partnerCompany || 'لم يتم تعيينها بعد'}</strong></div>
                      <div className="dz-order-detail-field"><span>رقم تتبع الشركة الشريكة</span><strong dir="ltr">{selectedOrder.carrier_metadata.partnerTrackingCode || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>الحالة الأصلية لدى Zimou</span><strong>{selectedOrder.carrier_metadata.statusName || selectedOrder.carrier_metadata.statusId || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>نوع التوصيل</span><strong>{selectedOrder.carrier_metadata.deliveryType || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>سعر التوصيل</span><strong>{selectedOrder.carrier_metadata.deliveryPrice != null ? `${selectedOrder.carrier_metadata.deliveryPrice} دج` : 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>مبلغ التحصيل</span><strong>{selectedOrder.carrier_metadata.codAmount != null ? `${selectedOrder.carrier_metadata.codAmount} دج` : 'غير متوفر'}</strong></div>
                    </>
                  )}
                  {selectedOrder.carrier_name === 'E-com Delivery v2' && selectedOrder.carrier_metadata?.ecomV2 && (
                    <>
                      <div className="dz-order-detail-field"><span>رقم التتبع لدى E-com Delivery</span><strong dir="ltr">{selectedOrder.carrier_metadata.ecomV2.trackingNumber || selectedOrder.carrier_tracking_number || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>الولاية</span><strong>{selectedOrder.carrier_metadata.ecomV2.wilayaId || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>البلدية</span><strong>{selectedOrder.carrier_metadata.ecomV2.commune || '—'}</strong></div>
                      <div className="dz-order-detail-field"><span>مكتب الاستلام</span><strong>{selectedOrder.carrier_metadata.ecomV2.stopDeskId || '—'}</strong></div>
                      <div className="dz-order-detail-field"><span>عنوان التوصيل</span><strong>{selectedOrder.carrier_metadata.ecomV2.address || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>مبلغ التحصيل</span><strong>{selectedOrder.carrier_metadata.ecomV2.codAmount != null ? Number(selectedOrder.carrier_metadata.ecomV2.codAmount).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>سعر التوصيل</span><strong>{selectedOrder.carrier_metadata.ecomV2.shippingFee != null ? Number(selectedOrder.carrier_metadata.ecomV2.shippingFee).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>طريقة التوصيل</span><strong>{selectedOrder.carrier_metadata.ecomV2.deliveryType === 'stopdesk' ? 'مكتب استلام' : 'توصيل إلى المنزل'}</strong></div>
                      <div className="dz-order-detail-field"><span>آخر حالة أصلية</span><strong>{selectedOrder.carrier_metadata.rawSituation || selectedOrder.carrier_metadata.ecomV2.rawSituation || 'بانتظار أول تحديث'}</strong></div>
                    </>
                  )}
                  {selectedOrder.carrier_name === 'Elogistia' && selectedOrder.carrier_metadata?.elogistia && (
                    <>
                      <div className="dz-order-detail-field"><span>رقم التتبع لدى Elogistia</span><strong dir="ltr">{selectedOrder.carrier_metadata.elogistia.trackingNumber || selectedOrder.carrier_tracking_number || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>الولاية</span><strong>{selectedOrder.carrier_metadata.elogistia.wilayaName || selectedOrder.carrier_metadata.elogistia.wilayaId || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>البلدية</span><strong>{selectedOrder.carrier_metadata.elogistia.commune || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>عنوان التوصيل</span><strong>{selectedOrder.carrier_metadata.elogistia.address || 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>مبلغ التحصيل</span><strong>{selectedOrder.carrier_metadata.elogistia.codAmount != null ? Number(selectedOrder.carrier_metadata.elogistia.codAmount).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>سعر التوصيل لدى Elogistia</span><strong>{selectedOrder.carrier_metadata.elogistia.shippingFee != null ? Number(selectedOrder.carrier_metadata.elogistia.shippingFee).toLocaleString('ar-DZ') + ' دج' : 'غير متوفر'}</strong></div>
                      <div className="dz-order-detail-field"><span>طريقة التوصيل</span><strong>{selectedOrder.carrier_metadata.elogistia.deliveryType === 'stopdesk' ? 'مكتب Elogistia' : 'توصيل إلى المنزل'}</strong></div>
                      <div className="dz-order-detail-field"><span>نوع العملية</span><strong>{selectedOrder.carrier_metadata.elogistia.deliveryMode === 'exchange' ? 'تبادل' : 'إرسال عادي'}</strong></div>
                      <div className="dz-order-detail-field"><span>آخر حالة أصلية</span><strong>{selectedOrder.carrier_metadata.rawStatus || 'بانتظار أول تحديث'}</strong></div>
                    </>
                  )}
                  <div className="dz-order-detail-field"><span>تاريخ تسجيل الطلب</span><strong>{new Date(selectedOrder.created_at).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>
                  <div className="dz-order-detail-field"><span>معرّف الطلب الداخلي</span><strong>{selectedOrder.id}</strong></div>
                </div>
                {(selectedOrder.carrier_name === 'Elogistia' || !selectedOrder.carrier_tracking_number) && (
                  <ElogistiaDispatchPanel key={selectedOrder.id} order={selectedOrder} />
                )}
                {(selectedOrder.carrier_name === 'E-com Delivery v2' || !selectedOrder.carrier_tracking_number) && (
                  <EcomV2DispatchPanel key={selectedOrder.id + '-ecom-v2'} order={selectedOrder} />
                )}
                <p className="dz-order-detail-note">يمكنك تعديل الحالة من القائمة أدناه. سجل التحديثات التفصيلي متاح في صفحة التتبع العامة، بينما تعرض هذه اللوحة البيانات المخزنة والمتاحة في لوحة التاجر.</p>
                <div style={{ paddingTop: '17px' }}><span className="dz-order-detail-kicker">تعديل الحالة</span><StatusSelector orderId={selectedOrder.id} currentStatus={selectedOrder.current_status} /></div>
                <div className="dz-order-detail-actions">
                  <a href={`/t/${selectedOrder.tracking_uuid}`} target="_blank" rel="noreferrer" className="dz-btn dz-btn-outline"><Icons.ExternalLink /> صفحة التتبع</a>
                  {selectedOrder.customer_phone && <a href={getWhatsAppRecoveryUrl(selectedOrder)} target="_blank" rel="noreferrer" className={`dz-btn ${isAttentionStatus(selectedOrder.current_status) ? 'dz-btn-wa-urgent' : 'dz-btn-wa'}`}><Icons.MessageCircle /> التواصل عبر واتساب</a>}
                </div>
              </aside>
            </div>
          ), document.body)}

          {isAddOrderModalOpen && typeof document !== 'undefined' && createPortal((
            <div
              className="dz-order-detail-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isCreatingOrder) {
                  setIsAddOrderModalOpen(false);
                }
              }}
            >
              <aside
                className="dz-order-detail-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-order-title"
                onMouseDown={(event) => event.stopPropagation()}
                style={{ width: 'min(500px, 100%)' }}
              >
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
                    onClick={() => setIsAddOrderModalOpen(false)}
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
                      تم إدراج مهمة الإرسال في طابور تيليجرام (Outbox). سيتولى العامل إرسالها فور تشغيله.
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
                      onClick={() => {
                        setNewOrderSuccess(null);
                        setIsAddOrderModalOpen(false);
                      }}
                    >
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

                    <input type="hidden" name="auto_enable_telegram" value="true" />

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
                            شركة الشحن
                          </label>
                          <select name="carrier_name" className="dz-input-field" defaultValue="Yalidine Express">
                            <option value="Yalidine Express">Yalidine Express (ياليدين)</option>
                            <option value="ZR Express">ZR Express</option>
                            <option value="Maystro Delivery">Maystro Delivery</option>
                            <option value="EcoTrack">EcoTrack</option>
                            <option value="Zimou Express">Zimou Express</option>
                            <option value="Elogistia">Elogistia</option>
                            <option value="توصيل خاص">توصيل خاص (متجرنا)</option>
                          </select>
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
                          <select name="status_raw" className="dz-input-field" defaultValue="order_placed">
                            <option value="order_placed">تم استلام الطلب (order_placed)</option>
                            <option value="processing">قيد التجهيز (processing)</option>
                            <option value="shipped">خرج للشحن والتوصيل (shipped)</option>
                          </select>
                        </div>
                      </div>

                      {/* TELEGRAM CARD */}
                      <div style={{
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: '11px',
                        padding: '16px',
                        marginTop: '6px',
                      }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            name="telegram_consent"
                            defaultChecked={true}
                            style={{ marginTop: '3px', width: '20px', height: '20px', accentColor: '#0284c7' }}
                          />
                          <div>
                            <strong style={{ display: 'block', fontSize: '14.5px', fontWeight: 800, color: '#0369a1' }}>
                              إرسال رابط التتبع فوراً عبر تيليجرام
                            </strong>
                            <span style={{ fontSize: '13px', color: '#0c4a6e', lineHeight: 1.6, display: 'block', marginTop: '4px' }}>
                              يسجل موافقة العميل ويدرج رسالة التتبع في طابور <code>telegram_tracking_outbox</code> ليقوم العامل بتسليمها إلى هاتف العميل عبر تيليجرام تلقائياً.
                            </span>
                          </div>
                        </label>
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
                        onClick={() => setIsAddOrderModalOpen(false)}
                        disabled={isCreatingOrder}
                        style={{ flex: 1, fontSize: '14px', fontWeight: 750, padding: '12px 20px', minHeight: '46px' }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
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