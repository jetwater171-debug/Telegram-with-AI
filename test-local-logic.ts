
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

(async () => {
    console.log("🧪 Testando lógica do servidor localmente...");

    // 1. Pegar Bot ID
    const { data: bots } = await supabase.from('telegram_bots').select('id').limit(1);
    if (!bots || bots.length === 0) {
        console.error("❌ Nenhum bot encontrado.");
        process.exit(1);
    }
    const botId = bots[0].id;

    // 2. Payload Simulado do Telegram
    const payload = {
        message: {
            chat: { id: 123456789 }, // ID Falso
            from: { first_name: "Tester" },
            text: "Oi gatinha"
        }
    };

    console.log(`📤 Enviando POST para localhost:3000... (BotID: ${botId})`);

    try {
        const response = await fetch(`http://localhost:3000/api/telegram/webhook?bot_id=${botId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("📥 Resposta do Servidor:", data);

        const fs = await import('fs');
        fs.writeFileSync('response.json', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log("✅ Servidor processou com sucesso (Status 200)");
        } else {
            console.error("❌ Servidor retornou erro:", response.status);
        }

    } catch (err) {
        console.error("❌ Falha na conexão com localhost:3000. O servidor está rodando?", err);
    }

})();
