import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { Database } from "@/supabase/types"

export const runtime: ServerRuntime = "nodejs"

export async function POST(request: Request) {
  try {
    console.log("🔐 Starting file upload to OpenAI...")

    const profile = await getServerProfile()
    console.log("👤 Profile found:", !!profile)

    if (!profile.openai_api_key) {
      throw new Error("OpenAI API key not found in profile")
    }

    checkApiKey(profile.openai_api_key, "OpenAI")
    console.log("🔑 API key validated")

    const json = await request.json()
    const { fileId } = json as { fileId: string }
    console.log("📁 Processing file ID:", fileId)

    if (!fileId) {
      return new Response(JSON.stringify({ message: "File ID is required" }), {
        status: 400
      })
    }

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    // Initialize Supabase client
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get file metadata
    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single()

    if (metadataError || !fileMetadata) {
      console.error("❌ File metadata error:", metadataError)
      throw new Error("File not found")
    }

    console.log("📋 File metadata retrieved:", fileMetadata.name)

    if (fileMetadata.user_id !== profile.user_id) {
      console.error("🚫 Unauthorized access attempt:", {
        fileUserId: fileMetadata.user_id,
        profileUserId: profile.user_id
      })
      throw new Error("Unauthorized")
    }

    // Download file from storage
    console.log("⬇️ Downloading file from storage...")
    const { data: file, error: fileError } = await supabaseAdmin.storage
      .from("files")
      .download(fileMetadata.file_path)

    if (fileError) {
      console.error("❌ File download error:", fileError)
      throw new Error(`Failed to retrieve file: ${fileError.message}`)
    }

    console.log("✅ File downloaded successfully")

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    console.log("🔄 File converted to buffer, size:", fileBuffer.length)

    // Create a File object for OpenAI upload
    const openaiFileBlob = new File([fileBuffer], fileMetadata.name, {
      type: fileMetadata.type
    })

    // Upload file to OpenAI
    console.log("🚀 Uploading to OpenAI...")
    const openaiFile = await openai.files.create({
      file: openaiFileBlob,
      purpose: "assistants"
    })

    console.log("🎉 OpenAI upload successful, file ID:", openaiFile.id)

    // Update the file record with OpenAI file ID
    try {
      await supabaseAdmin
        .from("files")
        .update({ openai_file_id: openaiFile.id })
        .eq("id", fileId)

      console.log(
        `Updated file ${fileId} with OpenAI file ID: ${openaiFile.id}`
      )
    } catch (error) {
      console.warn("Failed to update file with OpenAI file ID:", error)
      throw new Error(`Failed to update database: ${error}`)
    }

    return new Response(
      JSON.stringify({
        message: "File uploaded to OpenAI successfully",
        openaiFileId: openaiFile.id,
        localFileId: fileId
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    console.error("Error uploading file to OpenAI:", error)
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
