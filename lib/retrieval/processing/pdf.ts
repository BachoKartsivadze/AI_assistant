import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

export const processPdf = async (pdf: Blob): Promise<FileItemChunk[]> => {
  console.log("Starting PDF processing with memory optimization...")

  const loader = new PDFLoader(pdf)
  const docs = await loader.load()

  // Memory optimization: Process pages one by one instead of joining all text
  let chunks: FileItemChunk[] = []

  // Process each page separately to reduce memory usage
  for (let pageIndex = 0; pageIndex < docs.length; pageIndex++) {
    const doc = docs[pageIndex]
    const pageContent = doc.pageContent

    // Skip empty pages
    if (!pageContent.trim()) {
      continue
    }

    // If page content is small enough, use it as a single chunk
    const pageTokens = encode(pageContent).length
    if (pageTokens <= CHUNK_SIZE) {
      chunks.push({
        content: pageContent,
        tokens: pageTokens
      })
    } else {
      // Split large pages into chunks
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP
      })

      const splitDocs = await splitter.createDocuments([pageContent])

      for (const splitDoc of splitDocs) {
        chunks.push({
          content: splitDoc.pageContent,
          tokens: encode(splitDoc.pageContent).length
        })
      }
    }

    // Clear the page content to free memory
    docs[pageIndex] = null as any
  }

  // Clear the docs array to free memory
  docs.length = 0

  console.log(`PDF processing completed: ${chunks.length} chunks created`)
  return chunks
}
