const fs = require('fs');
const path = require('path');

// 1. قراءة ملف .env
const envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ ملف .env غير موجود في المجلد الرئيسي!');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [k, ...v] = trimmed.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

console.log('🔍 الرابط:', url);
console.log('🔑 بداية المفتاح:', key ? `${key.substring(0, 15)}...` : 'مفقود ❌');

if (!url || !key) {
  console.error('❌ الرابط أو المفتاح مفقود داخل ملف .env');
  process.exit(1);
}

// 2. طلب مباشر لخادم Supabase
async function test() {
  try {
    console.log('\n⏳ جاري إرسال طلب مباشر لخادم Supabase...');
    const res = await fetch(`${url}/rest/v1/merchants?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    const status = res.status;
    const body = await res.text();

    console.log(`\n📡 كود الاستجابة (HTTP Status): ${status}`);
    if (res.ok) {
      console.log('✅ الاتصال والمفتاح صحيحان 100%! البيانات المسترجعة:');
      console.log(body);
    } else {
      console.log('❌ Supabase رفض الطلب مع الرسالة التالية:');
      console.log(body);
    }
  } catch (err) {
    console.error('❌ خطأ في الشبكة أو الاتصال:', err.message);
  }
}

test();