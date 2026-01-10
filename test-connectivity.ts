import { fetch } from 'undici'; // or built-in in Node 18+

async function test() {
    console.log("Testing connectivity to Telegram...");
    try {
        const res = await fetch('https://api.telegram.org');
        console.log(`Status: ${res.status}`);
        console.log("Connectivity OK");
    } catch (e) {
        console.error("Connectivity FAILED:", e);
    }
}

test();
