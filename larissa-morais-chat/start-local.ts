
import { spawn } from 'child_process';
import localtunnel from 'localtunnel';

// Start Server
// Start Server with TUNNEL_URL
const startServer = (tunnelUrl: string) => {
    return spawn('npx', ['tsx', 'local-server.ts'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PUBLIC_URL: tunnelUrl }
    });
};

// Start Tunnel
(async () => {
    console.log("🚇 Opening tunnel...");
    try {
        const tunnel = await localtunnel({ port: 3000 });
        console.log(`\n🌍 PUBLIC URL: ${tunnel.url}`);
        console.log(`⚠️  COPY THIS URL if needed manually.`);

        const server = startServer(tunnel.url);

        tunnel.on('close', () => {
            console.log("Tunnel closed");
            server.kill();
        });
    } catch (err) {
        console.error("Tunnel error:", err);
    }
})();
