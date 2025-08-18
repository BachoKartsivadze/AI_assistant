import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/chat/openai-assistants/route"

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    beta: {
      threads: {
        create: vi.fn().mockResolvedValue({ id: "thread_123" }),
        messages: {
          create: vi.fn().mockResolvedValue({ id: "msg_123" })
        },
        runs: {
          create: vi.fn().mockResolvedValue({ id: "run_123", status: "queued" }),
          retrieve: vi.fn().mockResolvedValue({ id: "run_123", status: "completed" })
        },
        messages: {
          list: vi.fn().mockResolvedValue({
            data: [
              {
                id: "msg_456",
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: { value: "Hello! How can I help you today?" }
                  }
                ]
              }
            ]
          })
        }
      }
    }
  }))
}))

// Mock Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null })
        })
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null })
      })
    })
  })
}))

// Mock environment variables
vi.mock("@/lib/server/server-chat-helpers", () => ({
  checkApiKey: vi.fn(),
  getServerProfile: vi.fn().mockResolvedValue({
    user_id: "user_123",
    openai_api_key: "test_key",
    openai_organization_id: null
  })
}))

describe("OpenAI Assistants API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set required environment variable
    process.env.ASSISTANT_ID = "asst_test123"
  })

  it("should create a new thread for new chat", async () => {
    const request = new Request("http://localhost/api/chat/openai-assistants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatSettings: {
          model: "gpt-4-turbo-preview",
          prompt: "You are a helpful assistant",
          temperature: 0.7,
          contextLength: 4000,
          includeProfileContext: true,
          includeWorkspaceInstructions: true,
          embeddingsProvider: "openai"
        },
        messages: [
          {
            role: "user",
            content: "Hello, how can you help me?"
          }
        ]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe("Hello! How can I help you today?")
  })

  it("should reuse existing thread for existing chat", async () => {
    // Mock existing thread
    const mockSupabase = require("@supabase/supabase-js").createClient()
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ 
            data: { openai_thread_id: "existing_thread_123" } 
          })
        })
      })
    })

    const request = new Request("http://localhost/api/chat/openai-assistants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatSettings: {
          model: "gpt-4-turbo-preview",
          prompt: "You are a helpful assistant",
          temperature: 0.7,
          contextLength: 4000,
          includeProfileContext: true,
          includeWorkspaceInstructions: true,
          embeddingsProvider: "openai"
        },
        messages: [
          {
            role: "user",
            content: "Hello, how can you help me?"
          }
        ],
        chatId: "existing_chat_123"
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe("Hello! How can I help you today?")
  })

  it("should return error when ASSISTANT_ID is not set", async () => {
    delete process.env.ASSISTANT_ID

    const request = new Request("http://localhost/api/chat/openai-assistants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatSettings: {
          model: "gpt-4-turbo-preview",
          prompt: "You are a helpful assistant",
          temperature: 0.7,
          contextLength: 4000,
          includeProfileContext: true,
          includeWorkspaceInstructions: true,
          embeddingsProvider: "openai"
        },
        messages: [
          {
            role: "user",
            content: "Hello, how can you help me?"
          }
        ]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toContain("ASSISTANT_ID environment variable not set")
  })

  it("should return error when last message is not from user", async () => {
    const request = new Request("http://localhost/api/chat/openai-assistants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatSettings: {
          model: "gpt-4-turbo-preview",
          prompt: "You are a helpful assistant",
          temperature: 0.7,
          contextLength: 4000,
          includeProfileContext: true,
          includeWorkspaceInstructions: true,
          embeddingsProvider: "openai"
        },
        messages: [
          {
            role: "assistant",
            content: "Hello! How can I help you?"
          }
        ]
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.message).toBe("Last message must be from user")
  })
})
