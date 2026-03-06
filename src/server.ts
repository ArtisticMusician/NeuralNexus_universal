import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { normalizeMemoryConfig } from "./core/config.js";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const server = fastify({
  logger: true,
});

// Configure CORS
await server.register(cors, {
  origin: "*",
});

// Serve Dashboard
server.register(fastifyStatic, {
  root: join(__dirname, "dashboard"),
  prefix: "/",
});

// Initialize Core Configuration
const config = normalizeMemoryConfig({
  embedding: {
    model: process.env.EMBEDDING_MODEL,
    device: process.env.EMBEDDING_DEVICE || "cpu",
  },
  qdrant: {
    url: process.env.QDRANT_URL,
    collection: process.env.QDRANT_COLLECTION,
    apiKey: process.env.QDRANT_API_KEY,
  },
  replacementLog: {
    enabled: process.env.REPLACEMENT_LOG_ENABLED !== "false",
    sqlitePath: process.env.REPLACEMENT_LOG_PATH,
  },
  apiKey: process.env.NEXUS_API_KEY, // Security layer key
});

export const core = new NeuralNexusCore(config);

/**
 * Authentication Hook: Secures the API with an optional X-API-Key header.
 * Only applied if NEXUS_API_KEY is set in environment.
 */
server.addHook("preHandler", async (request, reply) => {
  if (!config.apiKey) return; // Authentication disabled if no key set

  const apiKey = request.headers["x-api-key"] || (request.query as any)["api_key"];
  
  // Allow health check without key
  if (request.url === "/health") return;

  if (apiKey !== config.apiKey) {
    return reply.status(401).send({ error: "Unauthorized: Invalid or missing X-API-Key" });
  }
});

server.addHook("onReady", async () => {
  await core.initialize();
  server.log.info("Neural Nexus Core initialized");
});

// Helper to get user_id from header or body
const getUserId = (request: any): string | undefined => {
  const header = request.headers["user-id"] || request.headers["x-user-id"];
  if (header) return Array.isArray(header) ? header[0] : header;
  return request.body?.user_id || request.body?.userId;
};

// --- Endpoints ---

server.post("/recall", async (request, reply) => {
  const body = request.body as any;
  const userId = getUserId(request);
  
  if (!body.query) {
    return reply.status(400).send({ error: "query is required" });
  }

  const results = await core.recall({
    query: body.query,
    limit: body.limit,
    userId: userId,
    maxTokens: body.max_tokens || body.maxTokens,
  });

  return results;
});

server.post("/store", async (request, reply) => {
  const body = request.body as any;
  const userId = getUserId(request);

  if (!body.text) {
    return reply.status(400).send({ error: "text is required" });
  }

  await core.store({
    text: body.text,
    category: body.category,
    userId: userId,
    metadata: body.metadata,
  });

  return reply.status(201).send({ status: "stored" });
});

server.post("/reinforce", async (request, reply) => {
  const body = request.body as any;
  
  if (!body.memory_id && !body.memoryId) {
    return reply.status(400).send({ error: "memory_id is required" });
  }

  await core.reinforce({
    memoryId: body.memory_id || body.memoryId,
    strengthAdjustment: body.strength_adjustment ?? 0.05,
  });

  return { status: "reinforced" };
});

server.get("/audit", async (request) => {
  const query = request.query as { limit?: string };
  const limit = query.limit ? parseInt(query.limit) : 50;
  return await core.getAuditLogs(limit);
});

server.get("/health", async () => {
  return { status: "ok" };
});

// Admin Endpoints
server.get("/admin/export", async (request, reply) => {
  const query = request.query as { userId?: string };
  const memories = await core.exportMemories(query.userId);
  
  reply.header("Content-Disposition", "attachment; filename=nexus_export.jsonl");
  reply.header("Content-Type", "application/x-ndjson");
  
  return memories.map(m => JSON.stringify(m)).join("\n");
});

server.post("/admin/import", async (request, reply) => {
  const body = request.body as string; 
  let memories: any[] = [];

  try {
    memories = JSON.parse(body);
  } catch {
    memories = body.trim().split("\n").map(line => JSON.parse(line));
  }

  await core.importMemories(memories);
  return { status: "imported", count: memories.length };
});

export const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3000");
    const host = process.env.HOST || "0.0.0.0";
    await server.listen({ port, host });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
