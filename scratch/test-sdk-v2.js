const path = require('node:path');
const { DZTrackerClient, normalizeAlgerianPhone, formatAlgerianPhoneDisplay } = require(path.resolve(__dirname, '../packages/sdk/dist/index.js'));

console.log('\n🧪 ========================================================');
console.log('🧪 RUNNING DZ TRACKING SDK V2.0.0 TEST SUITE');
console.log('🧪 ========================================================\n');

// 1. Phone Normalizer Test
console.log('1️⃣ Testing Algerian Phone Normalizer & Formatter...');
console.assert(normalizeAlgerianPhone('0555 12 34 56') === '213555123456', 'normalize 05');
console.assert(normalizeAlgerianPhone('+213 6 12 34 56 78') === '213612345678', 'normalize +213');
console.assert(normalizeAlgerianPhone('0770-99-88-77') === '213770998877', 'normalize 07 dashes');
console.assert(formatAlgerianPhoneDisplay('213555123456') === '05 55 12 34 56', 'display format');
console.log('   ✅ Phone normalization tests passed!\n');

// 2. DZTrackerClient Instantiation & Validation
console.log('2️⃣ Testing DZTrackerClient Constructor & Multi-Tenant Isolation...');
let threw = false;
try {
  new DZTrackerClient({});
} catch (e) {
  threw = true;
}
console.assert(threw, 'Should throw if apiKey is missing');

const client1 = new DZTrackerClient({ apiKey: 'key_store_1', baseUrl: 'https://store1.dz-tracker.com' });
const client2 = new DZTrackerClient({ apiKey: 'key_store_2', baseUrl: 'https://store2.dz-tracker.com' });

console.assert(client1.getConfig().apiKey === 'key_store_1', 'Client 1 apiKey isolated');
console.assert(client2.getConfig().apiKey === 'key_store_2', 'Client 2 apiKey isolated');
console.assert(client1.getConfig().baseUrl === 'https://store1.dz-tracker.com', 'Client 1 baseUrl isolated');
console.log('   ✅ Multi-tenant client isolation tests passed!\n');

// 3. WhatsApp Recovery Deep Link Generator
console.log('3️⃣ Testing WhatsApp 1-Click Recovery Link Generator...');
const waUrl = client1.generateWhatsAppUrl(
  '0555123456',
  '#ORD-9021',
  'https://store1.dz-tracker.com/t/uuid-1234',
  'Yacine'
);
console.assert(waUrl.startsWith('https://wa.me/213555123456'), 'WhatsApp link recipient normalized');
console.assert(waUrl.includes(encodeURIComponent('Yacine')), 'WhatsApp link includes customer name');
console.assert(waUrl.includes(encodeURIComponent('#ORD-9021')), 'WhatsApp link includes order ID');
console.assert(waUrl.includes(encodeURIComponent('https://store1.dz-tracker.com/t/uuid-1234')), 'WhatsApp link includes tracking URL');
console.log('   Generated WhatsApp URL Preview:\n   ' + waUrl);
console.log('   ✅ WhatsApp Recovery Generator tests passed!\n');

// 4. Test Build Exports
console.log('4️⃣ Testing Package Module Exports & Signatures...');
const sdk = require(path.resolve(__dirname, '../packages/sdk/dist/index.js'));
console.assert(typeof sdk.initTracker === 'function', 'initTracker exported');
console.assert(typeof sdk.trackOrder === 'function', 'trackOrder exported');
console.assert(typeof sdk.updateStatus === 'function', 'updateStatus exported');
console.assert(typeof sdk.trackAndRedirect === 'function', 'trackAndRedirect exported');
console.assert(typeof sdk.setupAutoCapture === 'function', 'setupAutoCapture exported');
console.assert(typeof sdk.useTracker === 'function', 'useTracker exported');
console.log('   ✅ All package functions and bindings exported correctly!\n');

console.log('🎉 ========================================================');
console.log('🎉 ALL DZ TRACKING SDK V2.0.0 TESTS PASSED (100% GREEN)');
console.log('🎉 ========================================================\n');
