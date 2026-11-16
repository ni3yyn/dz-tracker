-- Remove the retired TajerTrack Companion browser-extension storage.
-- Drop dependent capture/nonce tables before the installation table they reference.
DROP TABLE IF EXISTS public.yalidine_companion_captures;
DROP TABLE IF EXISTS public.merchant_companion_proof_nonces;
DROP TABLE IF EXISTS public.merchant_companion_pairing_challenges;
DROP TABLE IF EXISTS public.merchant_companion_devices;
