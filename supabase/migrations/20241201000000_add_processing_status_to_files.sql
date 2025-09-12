-- Add processing status to files table
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'timeout'));

-- Add processing error message for failed files
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Add processing started timestamp
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- Add processing completed timestamp  
ALTER TABLE files ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;

-- Create index for processing status queries
CREATE INDEX IF NOT EXISTS files_processing_status_idx ON files(processing_status);

-- Update existing files to have 'completed' status if they have tokens > 0
UPDATE files SET processing_status = 'completed' WHERE tokens > 0 AND processing_status = 'pending';
