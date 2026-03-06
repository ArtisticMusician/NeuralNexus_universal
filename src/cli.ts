#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import 'dotenv/config';

const program = new Command();
const API_URL = process.env.API_URL || 'http://localhost:3000';

program
  .name('nexus')
  .description('CLI to manage your Neural Nexus universal memory')
  .version('1.0.0');

program
  .command('recall')
  .description('Search your memories')
  .argument('<query>', 'The search query')
  .option('-l, --limit <number>', 'Number of results', '5')
  .action(async (query, options) => {
    try {
      const res = await axios.post(`${API_URL}/recall`, {
        query,
        limit: parseInt(options.limit)
      });
      
      console.log(chalk.blue.bold(`\nFound ${res.data.memories.length} memories for: "${query}"\n`));
      
      res.data.memories.forEach((m: any, i: number) => {
        console.log(chalk.green(`${i + 1}. [${m.category}] ${m.text}`));
        console.log(chalk.gray(`   Score: ${m.metadata.decayed_score.toFixed(4)} | ID: ${m.id}\n`));
      });
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.response?.data?.error || err.message);
    }
  });

program
  .command('store')
  .description('Add a new memory')
  .argument('<text>', 'The memory text')
  .option('-c, --category <type>', 'Category (fact, preference, etc.)', 'fact')
  .action(async (text, options) => {
    try {
      await axios.post(`${API_URL}/store`, {
        text,
        category: options.category
      });
      console.log(chalk.green('✔ Memory stored successfully.'));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.response?.data?.error || err.message);
    }
  });

program.parse();
