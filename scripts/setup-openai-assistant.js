#!/usr/bin/env node

/**
 * Setup script for OpenAI Assistant
 * 
 * This script helps you create an OpenAI Assistant and get the ID
 * to use in your ASSISTANT_ID environment variable.
 * 
 * Usage:
 * 1. Set your OPENAI_API_KEY environment variable
 * 2. Run: node scripts/setup-openai-assistant.js
 * 3. Copy the assistant ID to your .env file as ASSISTANT_ID=your_assistant_id
 */

const OpenAI = require("openai")

// Get API key from environment variable
const OPENAI_API_KEY = process.env.local.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY environment variable not set")
  console.log("Please set your OpenAI API key in your .env file:")
  console.log("OPENAI_API_KEY=your_api_key_here")
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
})

async function createAssistant() {
  try {
    console.log("🤖 Creating OpenAI Assistant...")
    
    const assistant = await openai.beta.assistants.create({
      name: "Chatbot UI Assistant",
      instructions: "You are a helpful AI assistant for the Chatbot UI application. You help users with their questions and tasks.",
      model: "gpt-4-turbo-preview",
      tools: []
    })

    console.log("✅ Assistant created successfully!")
    console.log("")
    console.log("📋 Assistant Details:")
    console.log(`   ID: ${assistant.id}`)
    console.log(`   Name: ${assistant.name}`)
    console.log(`   Model: ${assistant.model}`)
    console.log("")
    console.log("🔧 Next Steps:")
    console.log("1. Add this to your .env file:")
    console.log(`   ASSISTANT_ID=${assistant.id}`)
    console.log("")
    console.log("2. Restart your application")
    console.log("")
    console.log("💡 You can customize the assistant's instructions and tools later through the OpenAI dashboard")

  } catch (error) {
    console.error("❌ Error creating assistant:", error.message)
    
    if (error.status === 401) {
      console.log("")
      console.log("🔑 Your OpenAI API key appears to be invalid or expired.")
      console.log("Please check your API key and try again.")
    } else if (error.status === 429) {
      console.log("")
      console.log("⏰ Rate limit exceeded. Please wait a moment and try again.")
    }
    
    process.exit(1)
  }
}

// Run the setup
createAssistant()
