#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

const program = new Command();
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.NEXUS_API_KEY;

const api = axios.create({
  baseURL: API_URL,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
});

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
      const res = await api.post(`/recall`, {
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
      await api.post(`/store`, {
        text,
        category: options.category
      });
      console.log(chalk.green('✔ Memory stored successfully.'));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.response?.data?.error || err.message);
    }
  });

program
  .command('export')
  .description('Export all memories to a file')
  .argument('<file>', 'Output JSONL file path')
  .option('-u, --user <id>', 'User ID to export')
  .action(async (file, options) => {
    try {
      const res = await api.get(`/admin/export`, {
        params: { userId: options.user },
        responseType: 'text' 
      });
      
      const filePath = path.resolve(process.cwd(), file);
      await fs.writeFile(filePath, res.data);
      console.log(chalk.green(`✔ Exported memories to ${filePath}`));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.response?.data?.error || err.message);
    }
  });

program
  .command('import')
  .description('Import memories from a file')
  .argument('<file>', 'Input JSONL/JSON file path')
  .action(async (file) => {
    try {
      const filePath = path.resolve(process.cwd(), file);
      const content = await fs.readFile(filePath, 'utf-8');
      
      const res = await api.post(`/admin/import`, content, {
        headers: { 'Content-Type': 'text/plain' } 
      });
      
      console.log(chalk.green(`✔ Imported ${res.data.count} memories.`));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.response?.data?.error || err.message);
    }
  });

program.parse();
