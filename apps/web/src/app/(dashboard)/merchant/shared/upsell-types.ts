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

export type ReorderDirection = 'up' | 'down';
