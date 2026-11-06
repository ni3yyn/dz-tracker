import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { TelegramClient } from '@mtcute/node';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const rl = readline.createInterface({ input, output });

  console.log('====================================================');
  console.log(' TajerTrack MTProto Interactive Login & Session Tool');
  console.log('====================================================');
  console.log('This tool will log into your designated business Telegram');
  console.log('account and output a secure TELEGRAM_SESSION string.\n');

  try {
    let apiIdStr = process.env.TELEGRAM_API_ID;
    if (!apiIdStr) {
      apiIdStr = await rl.question('Enter Telegram API ID (from my.telegram.org): ');
    }

    let apiHash = process.env.TELEGRAM_API_HASH;
    if (!apiHash) {
      apiHash = await rl.question('Enter Telegram API Hash: ');
    }

    const apiId = parseInt(apiIdStr.trim(), 10);
    apiHash = apiHash.trim();

    if (isNaN(apiId) || !apiHash) {
      console.error('ERROR: Invalid API ID or API Hash.');
      process.exit(1);
    }

    const client = new TelegramClient({
      apiId,
      apiHash,
      storage: ':memory:',
      logLevel: 1,
    });

    console.log('\nConnecting to Telegram MTProto servers...');

    const user = await client.start({
      phone: async () => {
        const ph = await rl.question('\nEnter business account phone number (e.g. +213xxxxxxxxx): ');
        return ph.trim();
      },
      code: async () => {
        const c = await rl.question('Enter verification code received on Telegram / SMS: ');
        return c.trim();
      },
      password: async () => {
        const p = await rl.question('Enter 2-Step Verification password (leave blank if none): ');
        return p.trim() || undefined;
      },
    });

    const sessionString = await client.exportSession();

    console.log('\n====================================================');
    console.log(' SUCCESS: Telegram Session Created Successfully!   ');
    console.log('====================================================');
    console.log(`Connected User ID: ${user.id}`);
    console.log(`Display Name:      ${user.displayName || user.firstName}`);
    if (user.usernames?.length) {
      console.log(`Username:          @${user.usernames[0].username}`);
    }
    console.log('----------------------------------------------------');
    console.log('Set these environment variables in your .env / deployment:\n');
    console.log(`TELEGRAM_API_ID="${apiId}"`);
    console.log(`TELEGRAM_API_HASH="${apiHash}"`);
    console.log(`TELEGRAM_EXPECTED_USER_ID="${user.id}"`);
    console.log(`TELEGRAM_SESSION="${sessionString}"`);
    console.log(`TELEGRAM_WORKER_ENABLED="true"`);
    console.log('====================================================\n');

    await client.destroy();
  } catch (err: any) {
    console.error('\n[Login Error]:', err?.message || err);
  } finally {
    rl.close();
  }
}

main();

