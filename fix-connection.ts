
import localtunnel from 'localtunnel';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

(async () => {
    console.log("🔄 Iniciando reparo automático da conexão...");

    // 1. Pegar o Bot do Banco
    const { data: bots, error } = await supabase
        .from('telegram_bots')
        .select('*')
        .limit(1);

    if (error || !bots || bots.length === 0) {
        console.error("❌ Nenhum bot encontrado no banco. Adicione um pelo site primeiro.");
        process.exit(1);
    }

    const bot = bots[0];
    console.log(`🤖 Bot encontrado: ${bot.bot_name}`);

    // 2. Iniciar Túnel
    const tunnel = await localtunnel({ port: 3000 });
    console.log(`🌍 Nova URL Pública: ${tunnel.url}`);

    // 3. Rodar o Servidor Local (IMEDIATAMENTE)
    console.log("🚀 Iniciando servidor backend...");
    const server = spawn('npx', ['tsx', 'local-server.ts'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PUBLIC_URL: tunnel.url }
    });

    tunnel.on('close', () => {
        console.log("Tunnel closed");
        server.kill();
    });

    // 4. Atualizar Webhook no Telegram (Async, não bloqueante)
    (async () => {
        try {
            console.log("🔗 Atualizando Webhook no Telegram...");
            const webhookUrl = `${tunnel.url}/api/telegram/webhook?bot_id=${bot.id}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    drop_pending_updates: true
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            const result = await response.json();
            if (result.ok) {
                console.log(`✅ Webhook atualizado com sucesso!`);
                console.log(`👉 Pode mandar mensagem para o bot agora.`);
            } else {
                console.error(`❌ Erro ao atualizar webhook:`, result);
            }
        } catch (err) {
            console.error("❌ Falha ao conectar com Telegram:", err);
        }
    })();


})();
