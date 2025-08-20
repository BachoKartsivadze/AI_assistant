--------------- ADD OPENAI THREAD ID TO CHATS ---------------

-- Add openai_thread_id column to chats table
ALTER TABLE chats ADD COLUMN openai_thread_id TEXT;

-- Add index for better performance
CREATE INDEX chats_openai_thread_id_idx ON chats(openai_thread_id);
