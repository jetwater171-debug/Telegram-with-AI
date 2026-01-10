
-- Inserir dados de mídia com tags. 
-- Copie e cole no Editor SQL do Supabase se o script automático falhar por permissão.

INSERT INTO media_library (file_name, file_url, file_type, media_category, tags, is_blurred) VALUES 
('foto_banho.jpg', 'https://images.unsplash.com/photo-1542156822-6924d1a71ace?q=80', 'image', 'preview', ARRAY['banho', 'toalha', 'chuveiro'], false),
('foto_lingerie.jpg', 'https://images.unsplash.com/photo-1596483549704-3e85a22af4ec?q=80', 'image', 'preview', ARRAY['lingerie', 'calcinha', 'cama', 'sutiã'], false),
('foto_dedo.jpg', 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?q=80', 'image', 'preview', ARRAY['dedo', 'melado', 'molhadinha'], false),
('video_preview.mp4', 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-at-home-42358-large.mp4', 'video', 'preview', ARRAY['preview', 'rebolando', 'bunda'], false),
('video_completo.mp4', 'https://assets.mixkit.co/videos/preview/mixkit-woman-dancing-in-her-room-33924-large.mp4', 'video', 'full_content', ARRAY['completo', 'siririca', 'gozando'], false)
ON CONFLICT DO NOTHING;
