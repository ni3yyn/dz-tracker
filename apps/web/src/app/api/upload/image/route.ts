import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@saas/database';

// Max file size: 5MB (before compression — after should be ~100-400KB)
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'merchant-uploads';
    const folder = (formData.get('folder') as string) || 'general';
    const merchantId = formData.get('merchant_id') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'لم يتم إرسال ملف' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'حجم الملف كبير جداً (الحد الأقصى 5 ميغابايت)' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Build a unique file path: folder/merchantId_timestamp.ext
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const timestamp = Date.now();
    const prefix = merchantId ? `${merchantId}_` : '';
    const filePath = `${folder}/${prefix}${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload/image] Supabase storage error:', uploadError);
      return NextResponse.json({ error: 'فشل رفع الملف: ' + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return NextResponse.json({ success: true, url: publicUrl, path: filePath });
  } catch (err) {
    console.error('[upload/image] unexpected error:', err);
    return NextResponse.json({ error: 'خطأ غير متوقع في رفع الصورة' }, { status: 500 });
  }
}

