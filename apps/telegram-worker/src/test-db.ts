import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/telegram-worker/.env') });

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;

console.log('Testing Supabase connection to:', url);
const supabase = createClient(url, key);

async function test() {
  try {
    // 1. Test telegram_worker_state table
    const { data: stateData, error: stateError } = await supabase
      .from('telegram_worker_state')
      .select('*')
      .limit(1);

    if (stateError) {
      console.error('Error querying telegram_worker_state:', stateError);
    } else {
      console.log('✅ telegram_worker_state accessible:', stateData);
    }

    // 2. Test telegram_tracking_outbox table
    const { data: outboxData, error: outboxError } = await supabase
      .from('telegram_tracking_outbox')
      .select('count', { count: 'exact', head: true });

    if (outboxError) {
      console.error('Error querying telegram_tracking_outbox:', outboxError);
    } else {
      console.log('✅ telegram_tracking_outbox accessible. Total rows:', outboxData);
    }

    // 3. Test RPC claim_next_telegram_tracking_job
    const { data: rpcData, error: rpcError } = await supabase.rpc('claim_next_telegram_tracking_job', {
      p_worker_id: 'test-verifier',
      p_lease_seconds: 10,
    });

    if (rpcError) {
      console.error('Error testing claim_next_telegram_tracking_job:', rpcError);
    } else {
      console.log('✅ RPC claim_next_telegram_tracking_job callable. Result:', rpcData);
    }

    // 4. Test merchants table for telegram_tracking_link_enabled column
    const { data: merchantData, error: merchantError } = await supabase
      .from('merchants')
      .select('id, telegram_tracking_link_enabled')
      .limit(1);

    if (merchantError) {
      console.error('Error checking merchants.telegram_tracking_link_enabled:', merchantError);
    } else {
      console.log('✅ merchants table column telegram_tracking_link_enabled exists:', merchantData);
    }
  } catch (err: any) {
    console.error('Unexpected exception during DB test:', err);
  }
}

test();

