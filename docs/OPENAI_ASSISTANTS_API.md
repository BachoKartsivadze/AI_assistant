# OpenAI Assistants API Integration

This document explains how to use the new OpenAI Assistants API integration in Chatbot UI.

## Overview

The application has been refactored to use the OpenAI Assistants API instead of the Chat Completions API. This provides several benefits:

- **Persistent Conversations**: Each chat session maintains its own thread, allowing for better context continuity
- **Built-in Memory**: The assistant remembers previous interactions within each thread
- **Future Extensibility**: Easy to add tools, file uploads, and other assistant features

## Setup

### 1. Environment Variables

Create a `.env` file in your project root (if it doesn't exist) and add the following environment variables:

```bash
# Required for OpenAI Assistants API
OPENAI_API_KEY=your_openai_api_key_here
ASSISTANT_ID=your_openai_assistant_id_here

# Optional: OpenAI Organization ID
OPENAI_ORGANIZATION_ID=your_organization_id_here
```

**Note**: Make sure to replace `your_openai_api_key_here` with your actual OpenAI API key and `your_openai_assistant_id_here` with the assistant ID you'll get from the setup script.

### 2. Create an OpenAI Assistant

You can create an assistant manually through the OpenAI dashboard, or use the provided setup script:

```bash
# Make sure you have OPENAI_API_KEY set in your .env file
node scripts/setup-openai-assistant.js
```

The script will:
- Create a new assistant with default settings
- Display the assistant ID
- Provide instructions for adding it to your environment

### 3. Restart the Application

After setting the `ASSISTANT_ID`, restart your application for the changes to take effect.

## How It Works

### API Flow

1. **Thread Management**: Each chat conversation gets its own OpenAI thread
2. **Message Handling**: User messages are added to the thread
3. **Assistant Processing**: The assistant processes the message and generates a response
4. **Response Retrieval**: The response is fetched and returned to the frontend

### Database Changes

The system automatically manages:
- `openai_thread_id`: Links each chat to its OpenAI thread
- Thread creation and reuse for existing conversations
- Seamless integration with existing chat functionality

## API Endpoints

### `/api/chat/openai-assistants`

**POST** - Send a message to the OpenAI Assistant

**Request Body:**
```json
{
  "chatSettings": {
    "model": "gpt-4-turbo-preview",
    "prompt": "You are a helpful assistant",
    "temperature": 0.7,
    "contextLength": 4000,
    "includeProfileContext": true,
    "includeWorkspaceInstructions": true,
    "embeddingsProvider": "openai"
  },
  "messages": [
    {
      "role": "user",
      "content": "Hello, how can you help me?"
    }
  ],
  "chatId": "optional-chat-id-for-existing-conversations"
}
```

**Response:**
```json
{
  "message": "Hello! I'm here to help you with any questions or tasks you might have..."
}
```

## Migration from Chat Completions

The frontend automatically routes OpenAI requests to the new Assistants API endpoint. No changes are needed in the UI or other components.

### What Changed

- **API Route**: `/api/chat/openai` → `/api/chat/openai-assistants` (for OpenAI provider)
- **Response Format**: Streaming → Simple JSON (easier to handle)
- **Thread Management**: Automatic thread creation and management

### What Stayed the Same

- **Frontend UI**: No changes to the user interface
- **Message Display**: Messages still display properly
- **Chat History**: Existing chat functionality preserved
- **Other Providers**: Azure, Google, etc. remain unchanged

## Troubleshooting

### Setup Script Issues

1. **Module not found error**
   ```
   Error: Cannot find package 'dotenv'
   ```
   - Solution: The setup script doesn't require dotenv. Make sure you're running it from the project root directory.

2. **ES Module error**
   ```
   Warning: file parsed as an ES module
   ```
   - Solution: The script uses CommonJS syntax. Run it with: `node scripts/setup-openai-assistant.js`

### Common Issues

1. **ASSISTANT_ID not set**
   ```
   Error: ASSISTANT_ID environment variable not set
   ```
   - Solution: Add `ASSISTANT_ID=your_id` to your `.env` file

2. **Invalid API Key**
   ```
   Error: OpenAI API Key is incorrect
   ```
   - Solution: Check your `OPENAI_API_KEY` in the environment

3. **Assistant not found**
   ```
   Error: Assistant not found
   ```
   - Solution: Verify the `ASSISTANT_ID` matches an existing assistant in your OpenAI account

### Debug Mode

To see detailed logs, check your server console for:
- Thread creation/retrieval
- Message processing
- Run status updates

## Future Enhancements

### Planned Features

- **File Uploads**: Support for uploading files to assistants
- **Tool Integration**: Built-in tools and function calling
- **Custom Instructions**: Dynamic assistant configuration
- **Multi-Modal**: Support for images and other content types

### Configuration Options

The assistant can be customized through:
- OpenAI Dashboard: Modify instructions, tools, and settings
- Environment Variables: Different assistants for different environments
- Dynamic Configuration: Runtime assistant selection

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify your environment variables
3. Check the OpenAI dashboard for assistant status
4. Review server logs for detailed error messages

## API Reference

For more information about the OpenAI Assistants API, see:
- [OpenAI Assistants API Documentation](https://platform.openai.com/docs/assistants)
- [OpenAI Node.js SDK](https://github.com/openai/openai-node)
