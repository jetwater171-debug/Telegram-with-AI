
-- Add description column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'media_library' AND column_name = 'description') THEN 
        ALTER TABLE media_library ADD COLUMN description TEXT; 
    END IF; 
END $$;

-- Insert sample media data ensuring no duplicates based on file_name
DELETE FROM media_library WHERE file_name IN ('foto_banho.jpg', 'foto_lingerie.jpg', 'foto_dedo.jpg', 'video_preview.mp4', 'video_completo.mp4');

INSERT INTO media_library (file_name, file_url, file_type, media_category, description, is_blurred) VALUES 
('foto_banho.jpg', 'https://images.unsplash.com/photo-1542156822-6924d1a71ace?q=80&w=1000&auto=format&fit=crop', 'image', 'preview', 'foto no banho de toalha', false),
('foto_lingerie.jpg', 'https://images.unsplash.com/photo-1596483549704-3e85a22af4ec?q=80&w=1000&auto=format&fit=crop', 'image', 'preview', 'foto de lingerie sexy na cama calcinha', false),
('foto_dedo.jpg', 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?q=80&w=1000&auto=format&fit=crop', 'image', 'preview', 'foto do dedo melado molhadinha', false),
('video_preview.mp4', 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-at-home-42358-large.mp4', 'video', 'preview', 'video preview rebolando bunda', false),
('video_completo.mp4', 'https://assets.mixkit.co/videos/preview/mixkit-woman-dancing-in-her-room-33924-large.mp4', 'video', 'full_content', 'video completo siririca gozando', false);
