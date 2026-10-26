import {
  YalidineAdapter,
  ZRExpressAdapter,
  EcoTrackAdapter,
  MaystroAdapter,
  ShopifyAdapter,
  IdempotencyEngine,
  ALGERIA_WILAYAS_58,
} from '../packages/orchestrator/src/index';

console.log('🚀 Running Complete Algerian Carrier Suite Verification...\n');

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    failed++;
  }
}

// ==========================================
// 1. Yalidine Express Verification
// ==========================================
console.log('📦 1. Testing Yalidine / Guepex Adapter...');
const yaliPayload = {
  tracking: 'yal-test-8899',
  order_id: 'YAL-ORD-01',
  firstname: 'Karim',
  familyname: 'Meziani',
  contact_phone: '0550123456',
  address: '15 Rue Didouche Mourad',
  to_wilaya_name: 'Alger',
  to_commune_name: 'Alger Centre',
  is_stopdesk: true,
  stopdesk_name: 'Agence Grande Poste',
  status: 'En attente du client',
  reason: 'Client absent (échoué)',
};

const yaliRes = YalidineAdapter.normalize('merch_001', yaliPayload);
assert(yaliRes.merchantId === 'merch_001', 'Yalidine: preserves merchantId');
assert(yaliRes.carrierTrackingNumber === 'yal-test-8899', 'Yalidine: extracts tracking number');
assert(yaliRes.customerPhone === '213550123456', 'Yalidine: normalizes phone to 213550123456');
assert(yaliRes.statusRaw === 'attempt_failed_no_answer', 'Yalidine: catches "Client absent (échoué)" as COD alert');
assert(yaliRes.carrierName === 'Yalidine Express', 'Yalidine: carrier name attribution');

// ==========================================
// 2. ZR Express (Procolis API) Verification
// ==========================================
console.log('\n⚡ 2. Testing ZR Express / Procolis Adapter...');
const zrPayload = {
  Colis: [
    {
      Tracking: 'ZR-882200',
      id_Externe: 'SHOPIFY-#901',
      Client: 'Yacine Belkacem',
      MobileA: '0000000000', // bad primary
      MobileB: '0770987654', // valid secondary
      IDWilaya: '31',
      Commune: 'Es Senia',
      TypeLivraison: '1', // Stopdesk
      TProduit: 'Chaussures Sport',
      Situation: 'Echec de livraison',
      Motif: 'Client ne répond pas au téléphone',
    },
  ],
};

const zrRes = ZRExpressAdapter.normalize('merch_001', zrPayload);
assert(zrRes.carrierTrackingNumber === 'ZR-882200', 'ZR Express: extracts Tracking from Colis[0]');
assert(zrRes.externalOrderId === 'SHOPIFY-#901', 'ZR Express: extracts id_Externe');
assert(zrRes.customerPhone === '213770987654', 'ZR Express: falls back to MobileB and normalizes to 213');
assert(zrRes.statusRaw === 'attempt_failed_no_answer', 'ZR Express: maps "Client ne répond pas" to attempt_failed_no_answer');
assert(zrRes.carrierName === 'ZR Express', 'ZR Express: carrier attribution');

// ==========================================
// 3. EcoTrack Universal Verification
// ==========================================
console.log('\n🌐 3. Testing EcoTrack Universal Adapter (Conexlog/UPS, DHD, etc.)...');
const ecoPayload = {
  tracking_code: 'ECO-UPS-4433',
  reference: 'ORD-ECO-99',
  carrier_name: 'Conexlog/UPS',
  nom_client: 'Nabil Boualem',
  telephone: '0661112233',
  code_wilaya: 9,
  commune: 'Boufarik',
  stop_desk: 1,
  status: 'ECHEC_CLIENT_INJOIGNABLE',
};

const ecoRes = EcoTrackAdapter.normalize('merch_001', ecoPayload);
assert(ecoRes.carrierTrackingNumber === 'ECO-UPS-4433', 'EcoTrack: extracts tracking_code');
assert(ecoRes.carrierName === 'Conexlog/UPS', 'EcoTrack: dynamic carrier attribution');
assert(ecoRes.customerPhone === '213661112233', 'EcoTrack: normalizes phone to 213');
assert(ecoRes.statusRaw === 'attempt_failed_no_answer', 'EcoTrack: maps ECHEC_CLIENT_INJOIGNABLE');

// ==========================================
// 4. Maystro Delivery Verification
// ==========================================
console.log('\n🚀 4. Testing Maystro Delivery Adapter...');
const mayPayload = {
  tracking_id: 'MAY-776655',
  external_order_id: 'SHOPIFY-#88',
  customer_name: 'Anis Khelifi',
  customer_phone: '0560334455',
  wilaya: 16, // Alger integer
  commune_name: 'Bab El Oued',
  delivery_type: 1, // Point de retrait
  status: 'point_de_retrait',
};

const mayRes = MaystroAdapter.normalize('merch_001', mayPayload);
assert(mayRes.carrierTrackingNumber === 'MAY-776655', 'Maystro: extracts tracking_id');
assert(mayRes.customerPhone === '213560334455', 'Maystro: normalizes phone to 213');
assert(mayRes.statusRaw === 'ready_for_pickup', 'Maystro: maps point_de_retrait to ready_for_pickup');
assert(mayRes.description?.includes('Alger') || false, 'Maystro: resolves wilaya 16 to Alger');

// ==========================================
// 5. Shopify Adapter Verification
// ==========================================
console.log('\n🛍️ 5. Testing Shopify Store Adapter...');
const shopifyPayload = {
  id: 87654321,
  name: '#1099',
  customer: {
    first_name: 'Sofiane',
    last_name: 'Dahmani',
    phone: '0555998877',
  },
  line_items: [
    { title: 'Chemise Slim Fit', quantity: 1 },
  ],
  fulfillments: [
    {
      tracking_number: 'TRK-SHOPIFY-1',
      tracking_company: 'Yalidine Express',
      shipment_status: 'in_transit',
    },
  ],
};

const shopifyRes = ShopifyAdapter.normalize('merch_001', shopifyPayload);
assert(shopifyRes.externalOrderId === '#1099', 'Shopify: extracts order name #1099');
assert(shopifyRes.customerPhone === '213555998877', 'Shopify: normalizes phone');
assert(shopifyRes.productName === 'Chemise Slim Fit', 'Shopify: extracts item name');
assert(shopifyRes.carrierName === 'Yalidine Express', 'Shopify: extracts carrier from fulfillment');

// ==========================================
// 6. Idempotency Engine Verification
// ==========================================
console.log('\n🔒 6. Testing Idempotency & SHA-256 Burst Deduplication...');
const testParams = {
  merchantId: 'merch_001',
  source: 'yalidine',
  carrierTrackingNumber: 'YAL-BURST-1',
};
const fp1 = IdempotencyEngine.generateFingerprint(testParams);
const fp2 = IdempotencyEngine.generateFingerprint(testParams);
assert(fp1 === fp2, 'Idempotency: generates identical SHA-256 for identical payload parameters');

const firstAcquired = IdempotencyEngine.acquire(fp1);
assert(firstAcquired, 'Idempotency: first request acquires lock');

const checkFirst = IdempotencyEngine.check(fp1);
assert(checkFirst.isDuplicate, 'Idempotency: immediate burst re-send detected as duplicate');

const secondAcquire = IdempotencyEngine.acquire(fp1);
assert(!secondAcquire, 'Idempotency: duplicate request blocked from acquiring lock');

console.log(`\n======================================================`);
console.log(`Overall Carrier Test Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) process.exit(1);
