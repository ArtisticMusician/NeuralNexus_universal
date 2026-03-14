# Neural Nexus API Reference

All endpoints require `X-API-Key` (if configured) and optionally `User-Id` (for multi-tenancy).

## Core Endpoints

### `POST /recall`
Search long-term memory.
- **Body**: `{ query: string, limit?: number, userid?: string, maxTokens?: number }`
- **Logic**: Hybrid search (Vector + BM25) merged via RRF.

### `POST /store`
Add or update memory.
- **Body**: `{ text: string, category?: string, userid?: string, metadata?: object }`
- **Deduplication**: Merges if similarity >= 0.95.

### `POST /reinforce`
Strengthen a memory.
- **Body**: `{ memoryId: string, strengthAdjustment?: number }`

### `GET /audit`
Retrieve the replacement audit log (SQLite-backed).

## Admin Endpoints

### `GET /admin/export`
Export memories in NDJSON format.
- **Query Param**: `userid` (optional)

### `POST /admin/import`
Import memories from NDJSON string.

## System

### `GET /health`
Returns system status.
