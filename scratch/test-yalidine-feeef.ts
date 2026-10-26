import { YalidineAdapter } from '../packages/orchestrator/src/index';

console.log('🧪 Starting Feeef-Yalidine Knowledge Edge Case Test Suite...\n');

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

// Test 1: "Client absent (échoué)" -> attempt_failed_no_answer
const payload1 = {
  tracking: 'yal-test-01',
  order_id: 'ORD-ABSENT',
  status: 'Tentative échouée',
  reason: 'Client absent (échoué)',
  contact_phone: '0555112233',
};
const res1 = YalidineAdapter.normalize('merch_1', payload1);
assert(res1.statusRaw === 'attempt_failed_no_answer', 'Maps "Client absent (échoué)" to attempt_failed_no_answer');

// Test 2: "Client no-show" at Stopdesk agency -> attempt_failed_no_answer
const payload2 = {
  tracking: 'yal-test-02',
  status: 'Tentative échouée',
  reason: 'Client no-show',
};
const res2 = YalidineAdapter.normalize('merch_1', payload2);
assert(res2.statusRaw === 'attempt_failed_no_answer', 'Maps Stopdesk "Client no-show" to attempt_failed_no_answer');

// Test 3: "Faux numéro" -> attempt_failed_unreachable
const payload3 = {
  tracking: 'yal-test-03',
  status: 'Alerte',
  reason: 'Faux numéro',
};
const res3 = YalidineAdapter.normalize('merch_1', payload3);
assert(res3.statusRaw === 'attempt_failed_unreachable', 'Maps "Faux numéro" to attempt_failed_unreachable');

// Test 4: "Client incapable de payer" (Cash issue) -> attempt_failed
const payload4 = {
  tracking: 'yal-test-04',
  status: 'Tentative échouée',
  reason: 'Client incapable de payer',
};
const res4 = YalidineAdapter.normalize('merch_1', payload4);
assert(res4.statusRaw === 'attempt_failed', 'Maps "Client incapable de payer" to attempt_failed');
assert(res4.description?.includes('دفع مبلغ الشحنة') || false, 'Description mentions cash payment issue');

// Test 5: "Bloqué" (Security or verification hold) -> held_at_hub
const payload5 = {
  tracking: 'yal-test-05',
  status: 'Bloqué',
};
const res5 = YalidineAdapter.normalize('merch_1', payload5);
assert(res5.statusRaw === 'held_at_hub', 'Maps "Bloqué" to held_at_hub');

// Test 6: "En attente du client" (Stopdesk agency waiting for customer) -> ready_for_pickup
const payload6 = {
  tracking: 'yal-test-06',
  status: 'En attente du client',
  center_name: 'Bureau Bab Ezzouar',
};
const res6 = YalidineAdapter.normalize('merch_1', payload6);
assert(res6.statusRaw === 'ready_for_pickup', 'Maps "En attente du client" to ready_for_pickup');
assert(res6.description?.includes('Bab Ezzouar') || false, 'Includes agency center name');

// Test 7: Current location fields (current_center_name & current_wilaya_name)
const payload7 = {
  tracking: 'yal-test-07',
  status: 'Reçu à Wilaya',
  current_center_name: 'Hub Chéraga',
  current_wilaya_name: 'Alger',
};
const res7 = YalidineAdapter.normalize('merch_1', payload7);
assert(res7.statusRaw === 'at_local_hub', 'Maps "Reçu à Wilaya" to at_local_hub');
assert(res7.description?.includes('Alger') || false, 'Includes current wilaya name');

// Test 8: "Retour à retirer" -> returned
const payload8 = {
  tracking: 'yal-test-08',
  status: 'Retour à retirer',
};
const res8 = YalidineAdapter.normalize('merch_1', payload8);
assert(res8.statusRaw === 'returned', 'Maps "Retour à retirer" to returned');
assert(res8.description?.includes('طرد الإرجاع متاح الآن') || false, 'Instructs merchant package is at bureau');

console.log(`\n========================================`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
