# OpenAI Assistants File Memory System

This document explains how the OpenAI Assistants file memory system works in the chatbot UI, allowing files uploaded in conversations to be permanently stored and accessible across all chats and sessions.

## Overview

The system automatically associates uploaded files with the current selected assistant, uploads them to OpenAI, and makes them available to the assistant in every conversation. This provides persistent file memory that persists across chat sessions.

## How It Works

### 1. File Upload and Association
When a file is uploaded during a conversation:
- The file is stored locally in the database and processed for embeddings
- If an assistant is currently selected, the file is automatically associated with that assistant
- The file is uploaded to OpenAI's file storage system
- The OpenAI file ID is stored in the local database

### 2. File Attachment to Threads
When starting a new chat or continuing an existing one:
- All files associated with the current assistant are automatically attached to the OpenAI thread
- New files uploaded during the conversation are also attached
- The assistant can access all these files to answer questions

### 3. Persistent Memory
- Files remain associated with the assistant permanently
- Every new chat session automatically includes all assistant files
- Files are accessible across different workspaces and sessions

## Setup Requirements

### Environment Variables
```bash
ASSISTANT_ID=your_openai_assistant_id
OPENAI_API_KEY=your_openai_api_key
```

### Database Migrations
Run the following migrations to add required fields:

1. **Add OpenAI file ID to files table:**
```sql
-- Migration: 20241201000001_add_openai_file_id.sql
ALTER TABLE files ADD COLUMN openai_file_id TEXT;
CREATE INDEX files_openai_file_id_idx ON files(openai_file_id);
CREATE UNIQUE INDEX files_openai_file_id_unique_idx ON files(openai_file_id) WHERE openai_file_id IS NOT NULL;
```

2. **Add OpenAI thread ID to chats table:**
```sql
-- Migration: 20241201000002_add_openai_thread_id.sql
ALTER TABLE chats ADD COLUMN openai_thread_id TEXT;
CREATE INDEX chats_openai_thread_id_idx ON chats(openai_thread_id);
```

## API Endpoints

### Upload File to OpenAI
```
POST /api/assistants/openai/upload-file
Body: { "fileId": "uuid" }
```

This endpoint:
- Downloads the file from local storage
- Uploads it to OpenAI's file storage
- Updates the local database with the OpenAI file ID

### OpenAI Assistants Chat
```
POST /api/chat/openai-assistants
Body: { 
  "chatSettings": {...},
  "messages": [...],
  "chatId": "uuid",
  "newMessageFiles": [...]
}
```

This endpoint:
- Creates or retrieves an OpenAI thread
- Attaches all assistant files to the thread
- Attaches new message files to the thread
- Processes the chat with the assistant

## Usage

### 1. Select an Assistant
Choose an assistant from the sidebar or use the `@` command to select one.

### 2. Upload Files
Upload files using the file picker in the chat input. Files will automatically be:
- Stored locally
- Associated with the current assistant
- Uploaded to OpenAI
- Available in all future conversations with that assistant

### 3. Chat with Files
The assistant will automatically have access to all associated files and can answer questions based on their content.

## File Types Supported

The system supports the same file types as the existing retrieval system:
- PDF files
- DOCX files
- Text files
- Markdown files
- CSV files
- JSON files

## Error Handling

The system is designed to be resilient:
- If OpenAI upload fails, the local file association still works
- If file attachment to thread fails, other files continue to work
- Warnings are logged but don't stop the conversation

## Limitations

- Files are only associated with one assistant at a time
- Large files may take time to upload to OpenAI
- OpenAI has file size and type limitations
- Files must be processed successfully for embeddings to work

## Troubleshooting

### Files Not Appearing
1. Check that an assistant is selected
2. Verify the file was uploaded successfully
3. Check browser console for error messages
4. Ensure the OpenAI API key is valid

### OpenAI Upload Failures
1. Check OpenAI API key and quotas
2. Verify file size is within OpenAI limits
3. Check file type is supported by OpenAI
4. Review server logs for detailed error messages

## Future Enhancements

- Support for multiple assistant associations
- Automatic file cleanup and management
- File versioning and updates
- Batch file operations
- File sharing between assistants
