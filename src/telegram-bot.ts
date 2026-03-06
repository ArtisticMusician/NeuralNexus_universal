import { Telegraf } from 'telegraf';
import axios from 'axios';
import 'dotenv/config';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const NEXUS_API_URL = process.env.API_URL || 'http://localhost:3000';

// Command: /start
bot.start((ctx) => ctx.reply('Welcome to your Neural Nexus Mobile Agent! Send me anything to remember, or use /recall <query> to search.'));

// Command: /recall <query>
bot.command('recall', async (ctx) => {
  const query = ctx.message.text.replace('/recall', '').trim();
  if (!query) return ctx.reply('Please provide a query: /recall <query>');

  try {
    const res = await axios.post(`${NEXUS_API_URL}/recall`, { query, limit: 3 });
    const memories = res.data.memories;

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
  if (text.startsWith('/')) return; // Ignore other commands

  try {
    await axios.post(`${NEXUS_API_URL}/store`, { text, category: 'fact' });
    ctx.reply('✅ Saved to long-term memory.');
  } catch (err: any) {
    ctx.reply(`❌ Failed to store: ${err.message}`);
  }
});

// Start the bot
bot.launch().then(() => {
  console.log('Mobile Agent (Telegram Bot) is active.');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
