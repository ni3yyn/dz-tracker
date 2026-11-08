import assert from 'node:assert/strict';
import test from 'node:test';
import { EcomV2Adapter, mapEcomV2Status, parseEcomV2Date } from '../carriers/ecom-v2.adapter.js';

test('maps E-com Delivery v2 documented statuses without guessing unknown labels',()=>{
  assert.equal(mapEcomV2Status('Livrée').statusRaw,'delivered');
  assert.equal(mapEcomV2Status('Récupérer').statusRaw,'delivered');
  assert.equal(mapEcomV2Status('Retour Fournisseur').statusRaw,'returned');
  assert.equal(mapEcomV2Status('Commande Annuler').statusRaw,'cancelled');
  assert.equal(mapEcomV2Status('Au Bureau').statusRaw,'in_transit');
  assert.equal(mapEcomV2Status('En Préparation').statusRaw,'pending');
  assert.equal(mapEcomV2Status('EnCours').statusRaw,'unknown');
  assert.equal(mapEcomV2Status('New label not in mapping').statusRaw,'unknown');
});

test('normalizes a native history row to the existing TajerTrack order reference',()=>{
  const event=EcomV2Adapter.normalize('merchant-1',{tracking:'ECOM-001',id_externe:'STORE-ORDER-7',date:'2026-11-08 10:30:00',situation:'Livrée',commentaire:'Remis au client',mobile_1:'0555123456',nom_complet:'Sara Mansouri',article:'Sac'});
  assert.equal(event.externalOrderId,'STORE-ORDER-7');
  assert.equal(event.carrierName,'E-com Delivery v2');
  assert.equal(event.carrierTrackingNumber,'ECOM-001');
  assert.equal(event.statusRaw,'delivered');
  assert.equal(event.sourceProvider,'ecom_v2');
  assert.equal(event.sourceOccurredAt,'2026-11-08T09:30:00.000Z');
});

test('parses E-com local timestamps as Algeria time',()=>{
  assert.equal(parseEcomV2Date('2026-11-08 10:30:00'),'2026-11-08T09:30:00.000Z');
  assert.equal(parseEcomV2Date('not-a-date'),undefined);
});
