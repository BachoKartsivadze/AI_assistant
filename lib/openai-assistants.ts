import OpenAI from "openai"

export interface CreateAssistantOptions {
  name: string
  instructions: string
  model: string
  tools?: any[]
  fileIds?: string[]
}

export interface AssistantResponse {
  id: string
  name: string
  instructions: string
  model: string
  tools: any[]
  fileIds: string[]
}

/**
 * Creates a new OpenAI Assistant or returns an existing one
 */
export async function createOrGetAssistant(
  openai: OpenAI,
  options: CreateAssistantOptions
): Promise<AssistantResponse> {
  try {
    // Try to create a new assistant
    const assistant = await openai.beta.assistants.create({
      name: options.name,
      instructions: options.instructions,
      model: options.model,
      tools: options.tools || [],
      file_ids: options.fileIds || []
    })

    return {
      id: assistant.id,
      name: assistant.name || "",
      instructions: assistant.instructions || "",
      model: assistant.model,
      tools: assistant.tools || [],
      fileIds: assistant.file_ids || []
    }
  } catch (error: any) {
    if (error.status === 400 && error.message?.includes("already exists")) {
      // Assistant already exists, try to retrieve it
      // Note: OpenAI doesn't provide a way to search assistants by name
      // So we'll need to handle this differently in practice
      throw new Error(
        "Assistant creation failed. Please check your OpenAI account."
      )
    }
    throw error
  }
}

/**
 * Creates a new thread for a conversation
 */
export async function createThread(openai: OpenAI): Promise<string> {
  const thread = await openai.beta.threads.create()
  return thread.id
}

/**
 * Adds a message to a thread
 */
export async function addMessageToThread(
  openai: OpenAI,
  threadId: string,
  content: string,
  role: "user" | "assistant" = "user"
): Promise<void> {
  await openai.beta.threads.messages.create(threadId, {
    role,
    content
  })
}

/**
 * Starts a run on a thread
 */
export async function startRun(
  openai: OpenAI,
  threadId: string,
  assistantId: string
): Promise<string> {
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId
  })
  return run.id
}

/**
 * Waits for a run to complete and returns the status
 */
export async function waitForRunCompletion(
  openai: OpenAI,
  threadId: string,
  runId: string,
  maxWaitTime: number = 60000 // 60 seconds default
): Promise<string> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId)

    if (run.status === "completed") {
      return run.status
    }

    if (
      run.status === "failed" ||
      run.status === "cancelled" ||
      run.status === "expired"
    ) {
      throw new Error(`Run failed with status: ${run.status}`)
    }

    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error("Run timed out")
}

/**
 * Gets the latest assistant message from a thread
 */
export async function getLatestAssistantMessage(
  openai: OpenAI,
  threadId: string
): Promise<string> {
  const messages = await openai.beta.threads.messages.list(threadId)

  // Find the latest assistant message
  const assistantMessages = messages.data.filter(
    msg => msg.role === "assistant"
  )
  const latestMessage = assistantMessages[0] // Messages are ordered newest first

  if (!latestMessage || !latestMessage.content[0]) {
    throw new Error("No assistant response found")
  }

  const content = latestMessage.content[0]
  if (content.type !== "text") {
    throw new Error("Assistant response is not text")
  }

  return content.text.value
}
