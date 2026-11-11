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
