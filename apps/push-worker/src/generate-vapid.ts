import webpush from 'web-push';

function generate(): void {
  const vapidKeys = webpush.generateVAPIDKeys();

  console.log('====================================================');
  console.log(' TajerTrack Web Push — Generated VAPID Keys');
  console.log('====================================================');
  console.log('\nAdd these keys to your environment (.env files):\n');
  console.log(`WEB_PUSH_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log(`WEB_PUSH_VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  console.log(`WEB_PUSH_VAPID_SUBJECT=mailto:support@tajertrack.dz`);
  console.log('\nAlso add NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY to apps/web/.env:');
  console.log(`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
  console.log('====================================================\n');
}

generate();

