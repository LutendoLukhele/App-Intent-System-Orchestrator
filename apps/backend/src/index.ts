/**
 * ASO Backend - Application Entry Point
 * 
 * This file wires together all ASO packages into a running Express server.
 * 
 * For the full implementation, see the main src/index.ts in the project root.
 * This is a reference showing how packages are composed.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

// ASO Packages
// import { PlannerService, ToolConfigManager } from '@aso/intent-engine';
// import { Compiler, Matcher, Runtime, HybridStore } from '@aso/cortex';
// import { setupTelemetry, setupMetrics, setupHealth, setupSecurity } from '@aso/observability';
// import { ILLMClient, IToolProvider } from '@aso/interfaces';

// Local adapters (not yet extracted to packages)
// import { GroqLLMClient } from './adapters/llm';
// import { ProviderGateway, NangoProviderAdapter } from './adapters/providers';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  const app = express();
  const server = createServer(app);
  
  // =========================================================================
  // 1. Observability (first - captures all requests)
  // =========================================================================
  // setupTelemetry(app, { serviceName: 'aso-backend' });
  // setupSecurity(app);
  // setupMetrics(app);
  // setupHealth(app, {
  //   checks: {
  //     redis: async () => redis.ping() === 'PONG',
  //     postgres: async () => db.query('SELECT 1'),
  //   }
  // });

  // =========================================================================
  // 2. Initialize Adapters
  // =========================================================================
  // const llmClient: ILLMClient = new GroqLLMClient(process.env.GROQ_API_KEY!);
  // const toolProvider: IToolProvider = new ToolConfigManager('./config/tools.json');
  
  // =========================================================================
  // 3. Initialize Core Services
  // =========================================================================
  // const planner = new PlannerService({
  //   llmClient,
  //   toolProvider,
  //   maxTokens: 4096
  // });
  
  // const cortexStore = new HybridStore(redis, postgres);
  // const cortexCompiler = new Compiler(llmClient);
  // const cortexMatcher = new Matcher(cortexStore);
  // const cortexRuntime = new Runtime(cortexStore, toolExecutor);

  // =========================================================================
  // 4. WebSocket Server
  // =========================================================================
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    ws.on('message', async (data) => {
      // Handle conversation messages
      // const message = JSON.parse(data.toString());
      // await conversationService.handleMessage(ws, message);
    });
  });

  // =========================================================================
  // 5. HTTP Routes
  // =========================================================================
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (req, res) => res.json({ status: 'ok' }));
  
  // app.use('/api/interpret', interpretRoutes);
  // app.use('/api/sessions', sessionRoutes);
  // app.use('/api/documents', documentRoutes);
  // app.use('/webhooks/cortex', cortexWebhookRoutes);

  // =========================================================================
  // 6. Start Server
  // =========================================================================
  server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     █████╗ ███████╗ ██████╗                                   ║
║    ██╔══██╗██╔════╝██╔═══██╗                                  ║
║    ███████║███████╗██║   ██║                                  ║
║    ██╔══██║╚════██║██║   ██║                                  ║
║    ██║  ██║███████║╚██████╔╝                                  ║
║    ╚═╝  ╚═╝╚══════╝ ╚═════╝                                   ║
║                                                               ║
║    App-System-Orchestrator                                    ║
║    Intent Orchestration Infrastructure                        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}                              ║
║  📡 WebSocket: ws://localhost:${PORT}/ws                        ║
║  📊 Metrics: http://localhost:${PORT}/metrics                   ║
║  💚 Health: http://localhost:${PORT}/health/ready               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });
}

bootstrap().catch(console.error);
