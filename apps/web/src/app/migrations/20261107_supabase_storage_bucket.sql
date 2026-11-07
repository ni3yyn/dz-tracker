-- Run this in Supabase SQL Editor (once)
-- Creates the storage bucket and sets public read policy

-- 1. Create bucket (public = anyone can read URLs, only server can write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'merchant-uploads',
  'merchant-uploads',
  true,
  5242880,  -- 5 MB max per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read on all files in this bucket
CREATE POLICY "Public read merchant uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'merchant-uploads');

-- 3. Allow service_role (admin client) to insert/delete — our API route uses this
CREATE POLICY "Service role can upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'merchant-uploads');

CREATE POLICY "Service role can delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'merchant-uploads');

