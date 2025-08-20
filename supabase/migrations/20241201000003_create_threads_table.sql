--------------- CREATE THREADS TABLE ---------------

-- First, create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create threads table to store OpenAI thread information
CREATE TABLE IF NOT EXISTS threads (
    -- ID
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- OpenAI thread ID
    openai_thread_id TEXT NOT NULL UNIQUE,
    
    -- RELATIONSHIPS
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
    
    -- METADATA
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    
    -- STATUS
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- DESCRIPTION
    description TEXT
);

-- INDEXES
CREATE INDEX threads_user_id_idx ON threads(user_id);
CREATE INDEX threads_workspace_id_idx ON threads(workspace_id);
CREATE INDEX threads_chat_id_idx ON threads(chat_id);
CREATE INDEX threads_openai_thread_id_idx ON threads(openai_thread_id);
CREATE INDEX threads_active_idx ON threads(is_active);

-- RLS
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to own threads"
    ON threads
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- TRIGGERS
CREATE TRIGGER update_threads_updated_at
BEFORE UPDATE ON threads
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- FUNCTIONS
CREATE OR REPLACE FUNCTION get_or_create_thread(
    p_user_id UUID,
    p_workspace_id UUID,
    p_chat_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_thread_id UUID;
    v_openai_thread_id TEXT;
BEGIN
    -- Check if there's an existing active thread for this user/workspace
    SELECT id INTO v_thread_id
    FROM threads
    WHERE user_id = p_user_id 
      AND workspace_id = p_workspace_id 
      AND is_active = true
    LIMIT 1;
    
    IF v_thread_id IS NULL THEN
        -- Create new thread (OpenAI thread creation will be handled by the application)
        INSERT INTO threads (user_id, workspace_id, chat_id, openai_thread_id)
        VALUES (p_user_id, p_workspace_id, p_chat_id, 'pending_' || gen_random_uuid())
        RETURNING id INTO v_thread_id;
    END IF;
    
    RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
