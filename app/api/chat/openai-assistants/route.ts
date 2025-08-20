import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { createClient } from "@supabase/supabase-js"
import { Database } from "@/supabase/types"
import {
  createThread,
  addMessageToThread,
  startRun,
  waitForRunCompletion,
  getLatestAssistantMessage,
  attachFileToThread
} from "@/lib/openai-assistants"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const {
    chatSettings,
    messages,
    chatId,
    newMessageFiles,
    workspaceId,
    selectedAssistantId
  } = json as {
    chatSettings: ChatSettings
    messages: any[]
    chatId?: string
    newMessageFiles?: any[]
    workspaceId?: string
    selectedAssistantId?: string
  }

  console.log("📨 Request data:", {
    hasChatSettings: !!chatSettings,
    messageCount: messages?.length,
    chatId,
    newMessageFilesCount: newMessageFiles?.length,
    workspaceId,
    selectedAssistantId
  })

  try {
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    // Get or create OpenAI Assistant
    const assistantId = process.env.ASSISTANT_ID
    if (!assistantId) {
      throw new Error("ASSISTANT_ID environment variable not set")
    }

    // Initialize Supabase client
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let threadId: string
    let localThreadId: string

    if (chatId) {
      // Check if thread already exists for this chat
      const { data: existingThread } = await supabaseAdmin
        .from("threads")
        .select("id, openai_thread_id")
        .eq("chat_id", chatId)
        .eq("is_active", true)
        .single()

      if (existingThread) {
        // Use existing thread
        threadId = existingThread.openai_thread_id
        localThreadId = existingThread.id
        console.log(`Using existing thread: ${threadId}`)
      } else {
        // Create new thread
        threadId = await createThread(openai)
        console.log(`Created new thread: ${threadId}`)

        // Store thread in database
        const { data: newThread } = await supabaseAdmin
          .from("threads")
          .insert({
            openai_thread_id: threadId,
            user_id: profile.user_id,
            workspace_id: workspaceId || "",
            chat_id: chatId,
            description: "Chat thread"
          })
          .select("id")
          .single()

        localThreadId = newThread?.id || ""
      }
    } else {
      // Create new thread for new chat
      threadId = await createThread(openai)
      console.log(`Created new thread for new chat: ${threadId}`)

      // Store thread in database
      const { data: newThread } = await supabaseAdmin
        .from("threads")
        .insert({
          openai_thread_id: threadId,
          user_id: profile.user_id,
          workspace_id: workspaceId || "",
          chat_id: null,
          description: "New chat thread"
        })
        .select("id")
        .single()

      localThreadId = newThread?.id || ""
    }

    // Load files associated with the current assistant
    try {
      console.log("📚 Loading assistant files...")

      let localAssistantId: string

      if (selectedAssistantId) {
        // Use the selected assistant
        localAssistantId = selectedAssistantId
        console.log("🎯 Using selected assistant:", localAssistantId)
      } else {
        // Fallback to first assistant (we'll improve this later)
        const { data: assistants } = await supabaseAdmin
          .from("assistants")
          .select("id")
          .limit(1)
        if (assistants && assistants.length > 0) {
          localAssistantId = assistants[0].id
          console.log("🔍 Fallback to first assistant:", localAssistantId)
        } else {
          console.log("⚠️ No assistants found")
          return
        }
      }

      const { data: assistantFiles } = await supabaseAdmin
        .from("assistant_files")
        .select("file_id")
        .eq("assistant_id", localAssistantId)
      if (assistantFiles && assistantFiles.length > 0) {
        console.log(
          `📁 Found ${assistantFiles.length} files associated with assistant ${localAssistantId}`
        )
        const fileIds = assistantFiles.map(af => af.file_id)
        const { data: files } = await supabaseAdmin
          .from("files")
          .select("*")
          .in("id", fileIds)
        console.log(`📄 Files found:`, files?.length || 0)

        for (const file of files || []) {
          try {
            console.log(`🔄 Processing file: ${file.name}`)
            // Check if openai_file_id field exists and has a value
            const hasOpenaiFileId =
              file.hasOwnProperty("openai_file_id") && file.openai_file_id
            if (hasOpenaiFileId && file.openai_file_id) {
              // File already uploaded to OpenAI, just attach it to the thread
              console.log(
                `✅ File ${file.name} already has OpenAI ID: ${file.openai_file_id}`
              )
              await attachFileToThread(openai, threadId, file.openai_file_id)
              console.log(
                `📎 Attached existing file ${file.name} (${file.openai_file_id}) to thread`
              )
            } else {
              // File not uploaded to OpenAI yet, upload it now
              console.log(`📤 Uploading file ${file.name} to OpenAI...`)
              // Download file from storage
              const { data: fileData, error: fileError } =
                await supabaseAdmin.storage
                  .from("files")
                  .download(file.file_path)
              if (fileError) {
                console.warn(
                  `❌ Failed to download file ${file.id}:`,
                  fileError
                )
                continue
              }
              // Convert file to buffer
              const fileBuffer = Buffer.from(await fileData.arrayBuffer())
              // Create a File object for OpenAI upload
              const openaiFileBlob = new File([fileBuffer], file.name, {
                type: file.type
              })
              // Upload file to OpenAI
              const openaiFile = await openai.files.create({
                file: openaiFileBlob,
                purpose: "assistants"
              })
              console.log(
                `🎉 Uploaded file ${file.name} to OpenAI: ${openaiFile.id}`
              )
              // Try to update database with OpenAI file ID
              try {
                await supabaseAdmin
                  .from("files")
                  .update({ openai_file_id: openaiFile.id })
                  .eq("id", file.id)
                console.log(
                  `💾 Updated file ${file.id} with OpenAI file ID: ${openaiFile.id}`
                )
              } catch (updateError) {
                console.warn(
                  `⚠️ Failed to update file with OpenAI file ID:`,
                  updateError
                )
                // Continue even if update fails
              }
              // Attach file to thread
              await attachFileToThread(openai, threadId, openaiFile.id)
              console.log(`📎 Attached new file ${file.name} to thread`)
            }
          } catch (error) {
            console.warn(`❌ Failed to process file ${file.id}:`, error)
          }
        }
      } else {
        console.log("ℹ️ No files associated with this assistant")
      }
    } catch (error) {
      console.warn("❌ Failed to load assistant files:", error)
    }

    // Attach any new message files to the thread
    if (newMessageFiles && newMessageFiles.length > 0) {
      for (const file of newMessageFiles) {
        try {
          // Use OpenAI file ID if available, otherwise skip
          if (file.openai_file_id) {
            await attachFileToThread(openai, threadId, file.openai_file_id)
            console.log(`Attached new message file ${file.id} to thread`)
          } else {
            console.warn(
              `New file ${file.id} does not have OpenAI file ID, skipping attachment`
            )
          }
        } catch (error) {
          console.warn(`Failed to attach new file ${file.id} to thread:`, error)
          // Continue with other files even if one fails
        }
      }
    }

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1]
    if (lastUserMessage.role !== "user") {
      throw new Error("Last message must be from user")
    }

    // Add the user message to the thread
    await addMessageToThread(openai, threadId, lastUserMessage.content, "user")

    // Create and start a run
    const runId = await startRun(openai, threadId, assistantId)

    // Wait for run completion
    await waitForRunCompletion(openai, threadId, runId)

    // Get the assistant's response
    const assistantResponse = await getLatestAssistantMessage(openai, threadId)

    // Return the response in the format the frontend expects
    return new Response(assistantResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    })
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    } else if (
      errorMessage
        .toLowerCase()
        .includes("assistant_id environment variable not set")
    ) {
      errorMessage =
        "ASSISTANT_ID environment variable not set. Please configure it in your environment."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
