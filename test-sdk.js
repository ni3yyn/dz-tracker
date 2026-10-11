// محاكاة مطور قام بتثبيت الحزمة: const { TrackerClient } = require('@saas/sdk');
const { TrackerClient } = require('./packages/sdk/dist/index.js');

const client = new TrackerClient({ baseUrl: 'http://localhost:3000' });

async function run() {
  console.log('⏳ جلب بيانات طلب شوبيفاي برمجياً عبر الـ SDK...');
  
  // استبدل بالـ UUID الخاص بطلب شوبيفاي الذي أنشأناه (#SH-1042)
  const tracking = await client.getTracking('eeb5c28a-9b7f-4848-8750-3a75576e411e');
  
  console.log('✅ استجابة الـ SDK:');
  console.dir(tracking, { depth: null });
}

run();