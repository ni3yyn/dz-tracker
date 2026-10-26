import { MaystroAdapter, ALGERIA_WILAYAS_58 } from '../packages/orchestrator/src/index';

console.log('🧪 Starting Maystro Delivery Adapter Test Suite...\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// Test 1: Wilaya 58 dictionary integrity
assert(ALGERIA_WILAYAS_58[16].includes('Alger'), 'Wilaya 16 maps to Alger');
assert(ALGERIA_WILAYAS_58[31].includes('Oran'), 'Wilaya 31 maps to Oran');
assert(ALGERIA_WILAYAS_58[58].includes('El Meniaa'), 'Wilaya 58 maps to El Meniaa');

// Test 2: Standard Maystro payload
const payload1 = {
  order_id: 'MAY-987654',
  external_order_id: 'SHOPIFY-#1050',
  customer_name: 'Walid Mansouri',
  customer_phone: '0550123456',
  wilaya: 16,
  commune_name: 'Kouba',
  delivery_type: 0, // Domicile
  products: [{ name: 'Nike Air Max 90', quantity: 1 }],
  status: 'en_cours_de_livraison',
};

const result1 = MaystroAdapter.normalize('merchant_123', payload1);
assert(result1.merchantId === 'merchant_123', 'Preserves merchantId');
assert(result1.externalOrderId === 'SHOPIFY-#1050', 'Extracts externalOrderId');
assert(result1.carrierTrackingNumber === 'MAY-987654', 'Extracts carrierTrackingNumber');
assert(result1.customerName === 'Walid Mansouri', 'Extracts customer name');
assert(result1.customerPhone === '213550123456', 'Normalizes Algerian phone to 213550123456');
assert(result1.productName === 'Nike Air Max 90', 'Extracts product from products array');
assert(result1.carrierName === 'Maystro Delivery', 'Identifies carrier as Maystro Delivery');
assert(result1.statusRaw === 'out_for_delivery', 'Maps en_cours_de_livraison to out_for_delivery');

// Test 3: Stopdesk / Point de retrait detection
const payload2 = {
  tracking_id: 'MAY-STOPDESK-1',
  customer_name: 'Amine B.',
  customer_phone: '0770998877',
  wilaya: 31,
  delivery_type: 1, // Point de retrait
  status: 'point_de_retrait',
};

const result2 = MaystroAdapter.normalize('merchant_123', payload2);
assert(result2.statusRaw === 'ready_for_pickup', 'Maps point_de_retrait to ready_for_pickup');
assert(result2.description!.includes('Maystro Delivery'), 'Description includes Maystro Delivery branch');

// Test 4: Critical COD Risk Trigger (Client ne répond pas)
const payload3 = {
  tracking_id: 'MAY-ALERT-99',
  customer_name: 'Karim Z.',
  customer_phone: '0661234567',
  status: 'echec_livraison',
  reason: 'Client ne répond pas au téléphone',
};

const result3 = MaystroAdapter.normalize('merchant_123', payload3);
assert(result3.statusRaw === 'attempt_failed_no_answer', 'Triggers COD risk alert for no-answer attempt');

// Test 5: Delivered & COD Paid
const payload4 = {
  tracking_id: 'MAY-SUCCESS',
  status: 'livre',
};

const result4 = MaystroAdapter.normalize('merchant_123', payload4);
assert(result4.statusRaw === 'delivered', 'Maps livre to delivered');

console.log(`\n========================================`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
