import { createClient, SupabaseClient } from '@supabase/supabase-js';

// تعريف هيكل قاعدة البيانات بالكامل لضمان Type Safety في جميع الحزم والتطبيقات
export type Database = {
  public: {
    Tables: {
      merchants: {
        Row: {
          id: string;
          store_name: string;
          api_key: string;
          created_at: string;
          auth_user_id: string | null;
          subscription_tier?: string | null;
          subscription_status?: string | null;
          max_orders_limit?: number | null;
          monthly_orders_used?: number | null;
          subscription_expires_at?: string | null;
        };
        Insert: {
          id?: string;
          store_name: string;
          api_key?: string;
          created_at?: string;
          auth_user_id?: string | null;
          subscription_tier?: string | null;
          subscription_status?: string | null;
          max_orders_limit?: number | null;
          monthly_orders_used?: number | null;
          subscription_expires_at?: string | null;
        };
        Update: {
          id?: string;
          store_name?: string;
          api_key?: string;
          created_at?: string;
          auth_user_id?: string | null;
          subscription_tier?: string | null;
          subscription_status?: string | null;
          max_orders_limit?: number | null;
          monthly_orders_used?: number | null;
          subscription_expires_at?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          merchant_id: string;
          external_order_id: string;
          customer_phone: string | null;
          customer_name: string | null;
          product_name: string | null;
          product_image: string | null;
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
          product_name?: string | null;
          product_image?: string | null;
          tracking_uuid?: string;
          current_status?: string;
          carrier_name?: string | null;
          carrier_tracking_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          external_order_id?: string;
          customer_phone?: string | null;
          customer_name?: string | null;
          product_name?: string | null;
          product_image?: string | null;
          tracking_uuid?: string;
          current_status?: string;
          carrier_name?: string | null;
          carrier_tracking_number?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          }
        ];
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
        Update: {
          id?: string;
          order_id?: string;
          status_title?: string;
          status_raw?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          }
        ];
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
        Update: {
          id?: string;
          merchant_id?: string;
          source_status?: string;
          display_status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          }
        ];
      };
      subscription_payments: {
        Row: {
          id: string;
          merchant_id: string;
          plan_tier: string;
          amount_dzd: number;
          payment_method: string;
          payment_proof_url: string | null;
          transaction_ref: string | null;
          status: string;
          admin_notes: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          plan_tier: string;
          amount_dzd: number;
          payment_method: string;
          payment_proof_url?: string | null;
          transaction_ref?: string | null;
          status?: string;
          admin_notes?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          merchant_id?: string;
          plan_tier?: string;
          amount_dzd?: number;
          payment_method?: string;
          payment_proof_url?: string | null;
          transaction_ref?: string | null;
          status?: string;
          admin_notes?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchants';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
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