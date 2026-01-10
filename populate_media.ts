
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envPath = path.resolve(__dirname, '.env.local');
let envConfig = {};
try {
    const content = fs.readFileSync(envPath, 'utf8');
    envConfig = content.split('\n').reduce((acc, line) => {
        const [key, val] = line.split('=');
        if (key && val) acc[key.trim()] = val.trim();
        return acc;
    }, {});
} catch (e) { }

const url = envConfig.VITE_SUPABASE_URL || envConfig.NEXT_PUBLIC_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
    console.log("Populating media_library...");

    const mediaItems = [
        { file_name: 'foto_banho.jpg', file_url: 'https://images.unsplash.com/photo-1542156822-6924d1a71ace?q=80', file_type: 'image', media_category: 'preview', tags: ['banho', 'toalha', 'chuveiro'] },
        { file_name: 'foto_lingerie.jpg', file_url: 'https://images.unsplash.com/photo-1596483549704-3e85a22af4ec?q=80', file_type: 'image', media_category: 'preview', tags: ['lingerie', 'calcinha', 'cama', 'sutiã'] },
        { file_name: 'foto_dedo.jpg', file_url: 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?q=80', file_type: 'image', media_category: 'preview', tags: ['dedo', 'melado', 'molhadinha'] },
        { file_name: 'video_preview.mp4', file_url: 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-at-home-42358-large.mp4', file_type: 'video', media_category: 'preview', tags: ['preview', 'rebolando', 'bunda'] },
        { file_name: 'video_completo.mp4', file_url: 'https://assets.mixkit.co/videos/preview/mixkit-woman-dancing-in-her-room-33924-large.mp4', file_type: 'video', media_category: 'full_content', tags: ['completo', 'siririca', 'gozando'] }
    ];

    for (const item of mediaItems) {
        // Check if exists
        const { data: existing } = await supabase.from('media_library').select('id').eq('file_name', item.file_name).single();
        if (!existing) {
            const { error } = await supabase.from('media_library').insert([item]);
            if (error) console.error(`Error inserting ${item.file_name}:`, error.message);
            else console.log(`Inserted ${item.file_name}`);
        } else {
            console.log(`Updated tags for ${item.file_name}`);
            await supabase.from('media_library').update({ tags: item.tags }).eq('id', existing.id);
        }
    }
}

run();
