
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
    console.log(`📨 [${req.method}] ${req.path}`);
    next();
});

// Routes
app.post('/api/telegram/webhook', async (req, res) => {
    console.log("📩 Webhook received:", req.body);
    console.log("   Query Params:", req.query);
    try {
        console.log("   Importing webhook handler...");
        // Use absolute path or ensure relative path is correct
        // Since we are in root, ./api/... is correct
        const { default: webhookHandler } = await import('./api/telegram/webhook');
        console.log("   Invoking handler...");
        await webhookHandler(req as any, res as any);
    } catch (e: any) {
        console.error(e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 DEBUG SERVER running at http://localhost:${PORT}`);
});
