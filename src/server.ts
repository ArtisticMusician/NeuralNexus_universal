import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createInterface } from "readline";
import { Readable, Transform, TransformCallback } from "stream";
import { NeuralNexusCore } from "./core/NeuralNexusCore.js";
import { normalizeMemoryConfig, MEMORY_CATEGORIES } from "./core/config.js";
import "dotenv/config";

import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Number of records to accumulate before flushing to the store. */
const IMPORT_BATCH_SIZE = 500;

/** Maximum bytes allowed in a single JSONL line (10 MB). */
const MAX_LINE_BYTES = 10 * 1024 * 1024;

/**
 * Sits between the raw request stream and readline.
 * Counts bytes since the last newline; if any single line
 * exceeds `maxLineBytes`, it destroys the pipeline with an
 * error *before* readline can finish buffering it.
 */
class LineLengthGuard extends Transform {
    private bytesSinceNewline = 0;

    constructor(private readonly maxLineBytes: number) {
        super();
    }

    _transform(
        chunk: Buffer,
        _encoding: string,
        callback: TransformCallback,
    ): void {
        for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === 0x0a) {
                this.bytesSinceNewline = 0;
            } else {
                this.bytesSinceNewline++;
                if (this.bytesSinceNewline > this.maxLineBytes) {
                    callback(
                        new Error(
                            `Line exceeds the ${this.maxLineBytes}-byte limit. ` +
                            `Use newline-delimited JSON (one object per line).`,
                        ),
                    );
                    return;
                }
            }
        }

        this.push(chunk);
        callback();
    }
}

export const server = fastify({
    logger: true,
});

// Configure CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000").split(",");
await server.register(cors, {
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) {
            cb(null, true);
            return;
        }
        cb(new Error("Not allowed by CORS"), false);
    },
});

// Serve Dashboard - Look in multiple locations for resilience
const possiblePaths = [
    join(__dirname, "..", "dashboard"),
    join(__dirname, "..", "..", "dashboard"),
    join(process.cwd(), "dashboard"),
    join(process.cwd(), "dist", "dashboard"),
];
let dashboardPath = possiblePaths[0];
for (const p of possiblePaths) {
    if (existsSync(p)) {
        dashboardPath = p;
        break;
    }
}

server.register(fastifyStatic, {
    root: dashboardPath,
    prefix: "/",
});

// Streaming content-type parsers: pass the raw Readable through
// so the route handler can consume it incrementally.
server.addContentTypeParser(
    ["application/x-ndjson", "application/jsonl", "text/plain"],
    function (
        _request: any,
        payload: any,
        done: (err: Error | null, body?: any) => void,
    ) {
        done(null, payload);
    },
);

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
    apiKey: process.env.NEXUS_API_KEY,
});

export const core = new NeuralNexusCore(config);

/**
 * Authentication Hook: Secures the API with an optional X-API-Key header.
 * Only applied if NEXUS_API_KEY is set in environment.
 */
server.addHook("preHandler", async (request, reply) => {
    if (!config.apiKey) return;

    const apiKey =
        request.headers["x-api-key"] || (request.query as any)["api_key"];

    if (request.url === "/health") return;

    if (apiKey !== config.apiKey) {
        return reply
            .status(401)
            .send({ error: "Unauthorized: Invalid or missing X-API-Key" });
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

server.get("/categories", async () => {
    return { categories: MEMORY_CATEGORIES };
});

// Admin Endpoints
server.get("/admin/export", async (request, reply) => {
    const query = request.query as { userId?: string };
    const memories = await core.exportMemories(query.userId);

    reply.header(
        "Content-Disposition",
        "attachment; filename=nexus_export.jsonl",
    );
    reply.header("Content-Type", "application/x-ndjson");

    return memories.map((m) => JSON.stringify(m)).join("\n");
});

server.post("/admin/import", async (request, reply) => {
    let totalImported = 0;
    let parseErrors = 0;
    let batch: any[] = [];

    /** Flush the current batch to persistent storage. */
    const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) return;
        const toImport = batch;
        batch = [];
        await core.importMemories(toImport);
        totalImported += toImport.length;
    };

    // ── Path A: Streaming (NDJSON / JSONL / text/plain) ──────────
    if (request.body && typeof (request.body as any).pipe === "function") {
        const raw = request.body as Readable;
        const guard = new LineLengthGuard(MAX_LINE_BYTES);
        const guarded = raw.pipe(guard);

        const rl = createInterface({
            input: guarded,
            crlfDelay: Infinity,
        });

        try {
            for await (const rawLine of rl) {
                const trimmed = rawLine.trim();
                if (!trimmed || trimmed === "[" || trimmed === "]") continue;

                const cleaned = trimmed.endsWith(",")
                    ? trimmed.slice(0, -1)
                    : trimmed;

                try {
                    batch.push(JSON.parse(cleaned));
                } catch {
                    parseErrors++;
                    server.log.warn(
                        `Import: skipping malformed line (error #${parseErrors})`,
                    );
                    if (parseErrors > 100) {
                        raw.destroy();
                        return reply.status(400).send({
                            error: "Too many parse errors — aborting import",
                            imported: totalImported,
                            parseErrors,
                        });
                    }
                    continue;
                }

                if (batch.length >= IMPORT_BATCH_SIZE) {
                    await flushBatch();
                }
            }
        } catch (err: any) {
            raw.destroy();
            return reply.status(413).send({
                error: err.message,
                imported: totalImported,
            });
        }

        await flushBatch();
        return { status: "imported", count: totalImported, parseErrors };
    }

    // ── Path B: Pre-parsed JSON array (application/json) ────────
    if (Array.isArray(request.body)) {
        const memories = request.body as any[];
        for (let i = 0; i < memories.length; i += IMPORT_BATCH_SIZE) {
            const chunk = memories.slice(i, i + IMPORT_BATCH_SIZE);
            await core.importMemories(chunk);
            totalImported += chunk.length;
        }
        return { status: "imported", count: totalImported };
    }

    // ── Unrecognized format ──────────────────────────────────────
    return reply.status(400).send({
        error:
            "Unsupported body format. " +
            "Use Content-Type: application/x-ndjson for large streaming imports, " +
            "or application/json for small payloads.",
    });
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