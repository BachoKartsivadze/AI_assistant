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
  getLatestAssistantMessage
} from "@/lib/openai-assistants"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, chatId } = json as {
    chatSettings: ChatSettings
    messages: any[]
    chatId?: string
  }

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

    if (chatId) {
      // Check if thread already exists for this chat
      const { data: chat } = await supabaseAdmin
        .from("chats")
        .select("openai_thread_id")
        .eq("id", chatId)
        .single()

      if (chat?.openai_thread_id) {
        threadId = chat.openai_thread_id
      } else {
        // Create new thread
        threadId = await createThread(openai)

        // Update chat with thread ID
        await supabaseAdmin
          .from("chats")
          .update({ openai_thread_id: threadId })
          .eq("id", chatId)
      }
    } else {
      // Create new thread for new chat
      threadId = await createThread(openai)
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
