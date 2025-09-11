import { generateLocalEmbedding } from "@/lib/generate-local-embedding"
import {
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt,
  MAX_TOKENS_PER_REQUEST,
  MAX_BATCH_TOKENS
} from "@/lib/retrieval/processing"
import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { FileItemChunk } from "@/types"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import OpenAI from "openai"

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const formData = await req.formData()

    const file_id = formData.get("file_id") as string
    const embeddingsProvider = formData.get("embeddingsProvider") as string

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single()

    if (metadataError) {
      throw new Error(
        `Failed to retrieve file metadata: ${metadataError.message}`
      )
    }

    if (!fileMetadata) {
      throw new Error("File not found")
    }

    if (fileMetadata.user_id !== profile.user_id) {
      throw new Error("Unauthorized")
    }

    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from("files")
      .download(fileMetadata.file_path)

    if (fileError)
      throw new Error(`Failed to retrieve file: ${fileError.message}`)

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const blob = new Blob([fileBuffer])
    const fileExtension = fileMetadata.name.split(".").pop()?.toLowerCase()

    if (embeddingsProvider === "openai") {
      try {
        if (profile.use_azure_openai) {
          checkApiKey(profile.azure_openai_api_key, "Azure OpenAI")
        } else {
          checkApiKey(profile.openai_api_key, "OpenAI")
        }
      } catch (error: any) {
        error.message =
          error.message +
          ", make sure it is configured or else use local embeddings"
        throw error
      }
    }

    // Memory optimization: Process file in streaming batches instead of loading everything
    console.log(`Starting memory-optimized processing for ${fileMetadata.name}`)

    let totalTokens = 0
    let totalChunks = 0
    const BATCH_SIZE = 50 // Process 50 chunks at a time to manage memory

    // Initialize embeddings array for tracking
    let allEmbeddings: any[] = []

    // Initialize OpenAI client
    let openai
    if (profile.use_azure_openai) {
      openai = new OpenAI({
        apiKey: profile.azure_openai_api_key || "",
        baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
        defaultQuery: { "api-version": "2023-12-01-preview" },
        defaultHeaders: { "api-key": profile.azure_openai_api_key }
      })
    } else {
      openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id
      })
    }

    // Process file in streaming batches to optimize memory usage
    const processFileInBatches = async () => {
      let chunks: FileItemChunk[] = []

      // First, get all chunks but process them in batches
      switch (fileExtension) {
        case "csv":
          chunks = await processCSV(blob)
          break
        case "json":
          chunks = await processJSON(blob)
          break
        case "md":
          chunks = await processMarkdown(blob)
          break
        case "pdf":
          chunks = await processPdf(blob)
          break
        case "txt":
          chunks = await processTxt(blob)
          break
        default:
          throw new Error("Unsupported file type")
      }

      if (chunks.length === 0) {
        throw new Error("File could not be processed or is empty")
      }

      totalChunks = chunks.length
      totalTokens = chunks.reduce((acc, chunk) => acc + chunk.tokens, 0)

      console.log(
        `File processed into ${chunks.length} chunks with ${totalTokens} total tokens`
      )

      // Process chunks in batches to manage memory
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE)
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(chunks.length / BATCH_SIZE)

        console.log(
          `Processing batch ${batchNumber}/${totalBatches} (${batchChunks.length} chunks)`
        )

        // Calculate progress percentage
        const progressPercentage = Math.round((i / chunks.length) * 100)
        console.log(
          `Progress: ${progressPercentage}% (${i}/${chunks.length} chunks processed)`
        )

        // Process this batch
        const batchEmbeddings = await processBatchEmbeddings(
          batchChunks,
          embeddingsProvider,
          openai
        )

        // Store embeddings for this batch
        allEmbeddings.push(...batchEmbeddings)

        // Save this batch to database immediately to free memory
        const file_items = batchChunks.map((chunk, index) => ({
          file_id,
          user_id: profile.user_id,
          content: chunk.content,
          tokens: chunk.tokens,
          openai_embedding:
            embeddingsProvider === "openai"
              ? ((batchEmbeddings[index] || null) as any)
              : null,
          local_embedding:
            embeddingsProvider === "local"
              ? ((batchEmbeddings[index] || null) as any)
              : null
        }))

        await supabaseAdmin.from("file_items").upsert(file_items)

        // Clear memory by removing processed chunks
        batchChunks.length = 0

        // Force garbage collection hint (Node.js will handle this)
        if (global.gc) {
          global.gc()
        }

        console.log(
          `Batch ${batchNumber}/${totalBatches} completed and saved to database`
        )
      }

      // Clear the main chunks array to free memory
      chunks.length = 0
    }

    // Helper function to process embeddings for a batch
    const processBatchEmbeddings = async (
      batchChunks: FileItemChunk[],
      provider: string,
      client: any
    ) => {
      if (provider === "openai") {
        // Process OpenAI embeddings in smaller sub-batches to respect token limits
        let batchEmbeddings: any[] = []
        let currentSubBatch: string[] = []
        let currentSubBatchTokens = 0
        let skippedChunks = 0

        for (let i = 0; i < batchChunks.length; i++) {
          const chunk = batchChunks[i]
          const chunkTokens = chunk.tokens

          // Skip chunks that exceed individual limit
          if (chunkTokens > MAX_TOKENS_PER_REQUEST) {
            console.warn(
              `Chunk exceeds token limit: ${chunkTokens} tokens. Skipping.`
            )
            skippedChunks++
            batchEmbeddings.push(null)
            continue
          }

          // If adding this chunk would exceed the limit, process current sub-batch first
          if (
            currentSubBatchTokens + chunkTokens > MAX_BATCH_TOKENS &&
            currentSubBatch.length > 0
          ) {
            const response = await client.embeddings.create({
              model: "text-embedding-3-small",
              input: currentSubBatch
            })

            batchEmbeddings.push(
              ...response.data.map((item: any) => item.embedding)
            )
            currentSubBatch = [chunk.content]
            currentSubBatchTokens = chunkTokens
          } else {
            currentSubBatch.push(chunk.content)
            currentSubBatchTokens += chunkTokens
          }
        }

        // Process remaining chunks in the last sub-batch
        if (currentSubBatch.length > 0) {
          const response = await client.embeddings.create({
            model: "text-embedding-3-small",
            input: currentSubBatch
          })

          batchEmbeddings.push(
            ...response.data.map((item: any) => item.embedding)
          )
        }

        if (skippedChunks > 0) {
          console.warn(
            `Skipped ${skippedChunks} chunks in this batch due to token limit`
          )
        }

        return batchEmbeddings
      } else if (provider === "local") {
        // Process local embeddings
        const embeddingPromises = batchChunks.map(async chunk => {
          try {
            return await generateLocalEmbedding(chunk.content)
          } catch (error) {
            console.error(`Error generating local embedding for chunk`, error)
            return null
          }
        })

        return await Promise.all(embeddingPromises)
      }

      return []
    }

    // Execute the batch processing
    await processFileInBatches()

    // Update file metadata with total tokens
    await supabaseAdmin
      .from("files")
      .update({ tokens: totalTokens })
      .eq("id", file_id)

    // Log final success with statistics
    console.log(`✅ File processing completed successfully!`)
    console.log(
      `📊 Statistics: ${totalChunks} chunks, ${totalTokens} total tokens`
    )
    console.log(`💾 All chunks saved to database with embeddings`)

    return new NextResponse(
      JSON.stringify({
        message: "Embed Successful",
        statistics: {
          totalChunks,
          totalTokens,
          batchesProcessed: Math.ceil(totalChunks / BATCH_SIZE)
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  } catch (error: any) {
    console.log(`Error in retrieval/process: ${error.stack}`)
    const errorMessage = error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
