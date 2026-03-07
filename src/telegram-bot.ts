import { Telegraf } from 'telegraf';
import { fileURLToPath } from "url";
import { core } from './server.js';
import 'dotenv/config';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Command: /start
bot.start((ctx) => ctx.reply('Welcome to your Neural Nexus Mobile Agent! Send me anything to remember, or use /recall <query> to search.'));

// Command: /recall <query>
bot.command('recall', async (ctx) => {
  const query = ctx.message.text.replace('/recall', '').trim();
  const userId = ctx.from?.id.toString() || "telegram_user";
  
  if (!query) return ctx.reply('Please provide a query: /recall <query>');

  try {
    const results = await core.recall({ query, limit: 3, userId });
    const memories = results.memories;

    if (!memories || memories.length === 0) {
      return ctx.reply('No relevant memories found.');
    }

    const reply = memories.map((m: any) => `📌 [${m.category}] ${m.text}`).join('\n\n');
    ctx.reply(`🧠 Found these relevant memories:\n\n${reply}`);
  } catch (err: any) {
    ctx.reply(`❌ Error: ${err.message}`);
  }
});

// Any other message: Store it
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from?.id.toString() || "telegram_user";
  
  if (text.startsWith('/')) return;

  try {
    await core.store({ text, category: 'fact', userId });
    ctx.reply('✅ Saved to long-term memory.');
  } catch (err: any) {
    ctx.reply(`❌ Failed to store: ${err.message}`);
  }
});

async function run() {
  await core.initialize();
  bot.launch().then(() => {
    console.log('Mobile Agent (Telegram Bot) is active.');
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
