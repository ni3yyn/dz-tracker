export const EXCHANGE_REQUEST_REASONS = [
  { value: 'size_mismatch', label: 'المقاس غير مناسب' },
  { value: 'color_mismatch', label: 'اللون غير مناسب' },
  { value: 'wrong_product', label: 'وصلني منتج مختلف' },
  { value: 'damaged', label: 'المنتج تالف أو معيب' },
  { value: 'other', label: 'سبب آخر' },
] as const;

export type ExchangeRequestReason = (typeof EXCHANGE_REQUEST_REASONS)[number]['value'];
export type ExchangeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ExchangeRequestSummary {
  id: string;
  status: ExchangeRequestStatus;
  reason: ExchangeRequestReason;
  customer_note: string | null;
  merchant_response: string | null;
  created_at: string;
}

export interface MerchantExchangeRequest extends ExchangeRequestSummary {
  merchant_id: string;
  order_id: string;
  updated_at?: string;
  reviewed_at?: string | null;
  order: {
    external_order_id: string;
    customer_name: string | null;
    product_name: string | null;
  } | null;
}

export function isDeliveredStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('تم التسليم') || normalized.includes('تم التوصيل') || normalized.includes('تم تسليم')) return true;
  if (normalized === 'delivered' || normalized === 'livre' || normalized === 'livree') return true;
  return normalized.endsWith('_delivered') || normalized.endsWith('_livre') || normalized.endsWith('_livree');
}
