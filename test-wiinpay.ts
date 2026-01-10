
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

async function testWiinPay() {
    console.log("Testing WiinPay API...");
    console.log("URL:", `${WIINPAY_BASE_URL}/payment/create`);

    try {
        const res = await fetch(`${WIINPAY_BASE_URL}/payment/create`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: WIINPAY_API_KEY,
                value: 10.00,
                name: "Teste Debug",
                email: "teste@debug.com",
                description: "Teste de Integração"
            })
        });

        const status = res.status;
        const text = await res.text();

        console.log(`Status: ${status}`);
        console.log("Response Body:", text);

        if (!res.ok) {
            console.error("❌ Request failed!");
        } else {
            console.log("✅ Request successful (HTTP 200/201)");
            try {
                const json = JSON.parse(text);
                console.log("Parsed JSON:", json);
            } catch (e) {
                console.log("Could not parse JSON.");
            }
        }

    } catch (error: any) {
        console.error("❌ Fatal Fetch Error:", error.message);
    }
}

testWiinPay();
