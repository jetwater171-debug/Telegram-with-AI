
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ No API Key found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log("Using Key ending in:", apiKey.slice(-4));
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // There isn't a direct listModels method on the SDK instance easily accessible in all versions, 
        // asking it to generate content with a known model is a good test.
        // But let's try to just run a simple prompt on 1.5-flash-001 vs 1.5-flash vs 2.0-flash-exp

        const modelsToCheck = ["gemini-1.5-flash", "gemini-1.5-flash-001", "gemini-1.5-flash-8b", "gemini-2.0-flash-exp"];

        for (const m of modelsToCheck) {
            console.log(`\nTesting model: ${m}`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Test");
                console.log(`   ✅ Success! Response: ${result.response.text()}`);
            } catch (e: any) {
                console.log(`   ❌ Failed: ${e.message.split('[')[0]}`); // Short error
            }
        }

    } catch (e) {
        console.error(e);
    }
}

listModels();
