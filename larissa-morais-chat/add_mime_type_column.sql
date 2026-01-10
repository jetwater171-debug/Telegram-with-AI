-- Add media_mime_type column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime_type text;

-- Add comment for documentation
COMMENT ON COLUMN messages.media_mime_type IS 'MIME type of the media (e.g., audio/webm, video/mp4)';
