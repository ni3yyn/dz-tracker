import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/telegram-worker/.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function inspect() {
  console.log('--- 1. Latest Orders ---');
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, external_order_id, customer_name, customer_phone, telegram_consent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  if (ordersErr) console.error('Orders error:', ordersErr);
  else console.log(JSON.stringify(orders, null, 2));

  console.log('--- 2. Latest Outbox Jobs ---');
  const { data: outbox, error: outboxErr } = await supabase
    .from('telegram_tracking_outbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (outboxErr) console.error('Outbox error:', outboxErr);
  else console.log(JSON.stringify(outbox, null, 2));

  console.log('--- 3. Latest Delivery Attempts ---');
  const { data: attempts, error: attemptsErr } = await supabase
    .from('telegram_tracking_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (attemptsErr) console.error('Attempts error:', attemptsErr);
  else console.log(JSON.stringify(attempts, null, 2));

  console.log('--- 4. Worker State ---');
  const { data: state, error: stateErr } = await supabase
    .from('telegram_worker_state')
    .select('*');

  if (stateErr) console.error('Worker state error:', stateErr);
  else console.log(JSON.stringify(state, null, 2));
}

inspect();

