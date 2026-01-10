
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const envStatus = {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? '✅ Loaded' : '❌ MISSING',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? '✅ Loaded' : '❌ MISSING',
        VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY ? '✅ Loaded' : '❌ MISSING',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ MISSING',
        // Check if we can reach Google
        google_reachability: 'Untested'
    };

    // Try a simple verify of Supabase?
    // We won't crash here.

    return res.status(200).json({
        status: 'Debug Endpoint Online',
        environment: envStatus,
        timestamp: new Date().toISOString()
    });
}
