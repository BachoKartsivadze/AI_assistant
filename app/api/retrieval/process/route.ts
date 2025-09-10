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

    let chunks: FileItemChunk[] = []

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
        return new NextResponse("Unsupported file type", {
          status: 400
        })
    }

    // Log file processing info
    const totalTokens = chunks.reduce((acc, chunk) => acc + chunk.tokens, 0)
    console.log(
      `File processed into ${chunks.length} chunks with ${totalTokens} total tokens`
    )

    // The system can handle files of any size by batching the embeddings API calls
    // Each individual chunk should be under 4000 tokens due to our chunking strategy
    if (chunks.length === 0) {
      return new NextResponse("File could not be processed or is empty", {
        status: 400
      })
    }

    let embeddings: any = []

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

    if (embeddingsProvider === "openai") {
      // OpenAI embeddings API has a limit of 300,000 tokens per request
      // Using imported constant for consistency
      const allEmbeddings: any[] = []

      // Use the already calculated totalTokens
      console.log(
        `Processing file with ${chunks.length} chunks and ${totalTokens} total tokens`
      )

      // Process chunks in batches to stay within token limit
      let currentBatch: string[] = []
      let currentBatchTokens = 0
      let skippedChunks = 0

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const chunkTokens = chunk.tokens

        // If a single chunk exceeds the limit, try to split it further or skip it
        if (chunkTokens > MAX_TOKENS_PER_REQUEST) {
          console.warn(
            `Chunk ${i} exceeds token limit: ${chunkTokens} tokens. This should not happen with proper chunking.`
          )
          skippedChunks++
          allEmbeddings.push(null) // Add null to maintain array alignment
          continue
        }

        // If adding this chunk would exceed the limit, process current batch first
        if (
          currentBatchTokens + chunkTokens > MAX_BATCH_TOKENS &&
          currentBatch.length > 0
        ) {
          console.log(
            `Processing batch of ${currentBatch.length} chunks with ${currentBatchTokens} tokens`
          )
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: currentBatch
          })

          allEmbeddings.push(
            ...response.data.map((item: any) => item.embedding)
          )

          // Reset for next batch
          currentBatch = [chunk.content]
          currentBatchTokens = chunkTokens
        } else {
          currentBatch.push(chunk.content)
          currentBatchTokens += chunkTokens
        }

        // Safety check: if current batch is getting close to limit, process it
        if (currentBatchTokens > MAX_BATCH_TOKENS) {
          // Use conservative batch limit
          console.log(
            `Processing safety batch of ${currentBatch.length} chunks with ${currentBatchTokens} tokens`
          )
          const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: currentBatch
          })

          allEmbeddings.push(
            ...response.data.map((item: any) => item.embedding)
          )

          // Reset for next batch
          currentBatch = []
          currentBatchTokens = 0
        }
      }

      // Process remaining chunks in the last batch
      if (currentBatch.length > 0) {
        console.log(
          `Processing final batch of ${currentBatch.length} chunks with ${currentBatchTokens} tokens`
        )
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: currentBatch
        })

        allEmbeddings.push(...response.data.map((item: any) => item.embedding))
      }

      if (skippedChunks > 0) {
        console.warn(
          `Skipped ${skippedChunks} chunks due to token limit. Total processed: ${allEmbeddings.filter(e => e !== null).length}/${chunks.length}`
        )
      }

      embeddings = allEmbeddings
    } else if (embeddingsProvider === "local") {
      const embeddingPromises = chunks.map(async chunk => {
        try {
          return await generateLocalEmbedding(chunk.content)
        } catch (error) {
          console.error(`Error generating embedding for chunk: ${chunk}`, error)

          return null
        }
      })

      embeddings = await Promise.all(embeddingPromises)
    }

    const file_items = chunks.map((chunk, index) => ({
      file_id,
      user_id: profile.user_id,
      content: chunk.content,
      tokens: chunk.tokens,
      openai_embedding:
        embeddingsProvider === "openai"
          ? ((embeddings[index] || null) as any)
          : null,
      local_embedding:
        embeddingsProvider === "local"
          ? ((embeddings[index] || null) as any)
          : null
    }))

    await supabaseAdmin.from("file_items").upsert(file_items)

    // Use the already calculated totalTokens from earlier
    await supabaseAdmin
      .from("files")
      .update({ tokens: totalTokens })
      .eq("id", file_id)

    return new NextResponse("Embed Successful", {
      status: 200
    })
  } catch (error: any) {
    console.log(`Error in retrieval/process: ${error.stack}`)
    const errorMessage = error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
