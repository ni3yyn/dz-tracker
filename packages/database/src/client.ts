import { createClient, SupabaseClient } from '@supabase/supabase-js';

// تعريف هيكل قاعدة البيانات بالكامل لضمان Type Safety
export type Database = {
  public: {
    Tables: {
      merchants: {
        Row: {
          id: string;
          store_name: string;
          api_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_name: string;
          api_key?: string;
          created_at?: string;
        };
        Update: {
          store_name?: string;
          api_key?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          merchant_id: string;
          external_order_id: string;
          customer_phone: string | null;
          customer_name: string | null;
          tracking_uuid: string;
          current_status: string;
          carrier_name: string | null;
          carrier_tracking_number: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          external_order_id: string;
          customer_phone?: string | null;
          customer_name?: string | null;
          tracking_uuid?: string;
          current_status?: string;
          carrier_name?: string | null;
          carrier_tracking_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          current_status?: string;
          carrier_name?: string | null;
          carrier_tracking_number?: string | null;
          updated_at?: string;
        };
      };
      order_history: {
        Row: {
          id: string;
          order_id: string;
          status_title: string;
          status_raw: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          status_title: string;
          status_raw: string;
          description?: string | null;
          created_at?: string;
        };
      };
      status_mappings: {
        Row: {
          id: string;
          merchant_id: string;
          source_status: string;
          display_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          source_status: string;
          display_status: string;
          created_at?: string;
        };
      };
    };
  };
};

// 1. عميل الواجهات العامة (Browser Client)
// يدعم: sb_publishable_* أو مفتاح anon القديم
export const getSupabaseBrowserClient = (): SupabaseClient<Database> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      '[Supabase Browser Client Error]: Missing NEXT_PUBLIC_SUPABASE_URL or Publishable/Anon key in environment variables.'
    );
  }

  return createClient<Database>(supabaseUrl, publishableKey);
};

// 2. عميل السيرفر والـ Backend (Admin Client)
// يدعم: sb_secret_* أو مفتاح service_role القديم (لتجاوز الـ RLS)
export const getSupabaseAdminClient = (): SupabaseClient<Database> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      '[Supabase Admin Client Error]: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY in environment variables.'
    );
  }

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};