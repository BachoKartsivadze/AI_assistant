--------------- ADD OPENAI FILE ID TO FILES ---------------

-- Add openai_file_id column to files table
ALTER TABLE files ADD COLUMN openai_file_id TEXT;

-- Add index for better performance
CREATE INDEX files_openai_file_id_idx ON files(openai_file_id);

-- Add constraint to ensure uniqueness
CREATE UNIQUE INDEX files_openai_file_id_unique_idx ON files(openai_file_id) WHERE openai_file_id IS NOT NULL;
