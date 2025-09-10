export * from "./csv"
export * from "./docx"
export * from "./json"
export * from "./md"
export * from "./pdf"
export * from "./txt"

// Optimized chunk size to ensure we never exceed OpenAI's token limits
// Even with larger files, individual chunks will be well under the 300,000 token limit
export const CHUNK_SIZE = 2000 // Further reduced for maximum safety margin
export const CHUNK_OVERLAP = 200

// Maximum tokens for a single embedding request (OpenAI limit)
export const MAX_TOKENS_PER_REQUEST = 300000

// Conservative batch size to stay well under the limit
export const MAX_BATCH_TOKENS = 250000 // 83% of the limit for safety
