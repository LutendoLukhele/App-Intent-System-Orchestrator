"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const ioredis_1 = __importDefault(require("ioredis"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const storage = __importStar(require("node-persist"));
const telemetry_1 = require("./monitoring/telemetry");
const logging_1 = require("./monitoring/logging");
const security_1 = require("./monitoring/security");
const metrics_1 = require("./monitoring/metrics");
const health_1 = require("./monitoring/health");
const error_handling_1 = require("./monitoring/error-handling");
const bootstrap_rate_limiting_1 = require("./middleware/bootstrap-rate-limiting");
const bootstrap_capacity_monitor_1 = require("./monitoring/bootstrap-capacity-monitor");
(0, telemetry_1.initializeTelemetry)();
const logger = (0, logging_1.createStructuredLogger)('beat-engine-backend');
const config_1 = require("./config");
const firebase_1 = require("./firebase");
const redis = new ioredis_1.default(config_1.CONFIG.REDIS_URL);
const ConversationService_1 = require("./services/conversation/ConversationService");
const ToolOrchestrator_1 = require("./services/tool/ToolOrchestrator");
const ProviderAwareToolFilter_1 = require("./services/tool/ProviderAwareToolFilter");
const UserToolCacheService_1 = require("./services/tool/UserToolCacheService");
const SessionRegistry_1 = require("./services/SessionRegistry");
const StreamManager_1 = require("./services/stream/StreamManager");
const NangoService_1 = require("./services/NangoService");
const FollowUpService_1 = require("./services/FollowUpService");
const ToolConfigManager_1 = require("./services/tool/ToolConfigManager");
const PlannerService_1 = require("./services/PlannerService");
const action_launcher_service_1 = require("./action-launcher.service");
const RunManager_1 = require("./services/tool/RunManager");
const serverless_1 = require("@neondatabase/serverless");
const BeatEngine_1 = require("./BeatEngine");
const DataDependencyService_1 = require("./services/data/DataDependencyService");
const Resolver_1 = require("./services/data/Resolver");
const session_service_1 = require("./services/session.service");
const PlanExecutorService_1 = require("./services/PlanExecutorService");
const ExecutionDecisionService_1 = require("./services/ExecutionDecisionService");
const router_service_1 = require("./services/router.service");
const prompt_generator_service_1 = require("./services/prompt-generator.service");
const groq_service_1 = require("./services/groq.service");
const response_parser_service_1 = require("./services/response-parser.service");
const document_service_1 = require("./services/document.service");
const artifact_generator_service_1 = require("./services/artifact-generator.service");
const artifacts_1 = __importDefault(require("./routes/artifacts"));
const documents_1 = __importDefault(require("./routes/documents"));
const export_1 = __importDefault(require("./routes/export"));
const interpret_1 = __importDefault(require("./routes/interpret"));
const sessions_1 = __importDefault(require("./routes/sessions"));
const HistoryService_1 = require("./services/HistoryService");
const history_1 = __importDefault(require("./routes/history"));
const StripeService_1 = require("./services/StripeService");
const RevenueCatService_1 = require("./services/RevenueCatService");
const groqClient = new groq_sdk_1.default({ apiKey: config_1.CONFIG.GROQ_API_KEY });
const toolConfigManager = new ToolConfigManager_1.ToolConfigManager();
if (!process.env.DATABASE_URL) {
    logger.error("FATAL: DATABASE_URL environment variable is not set. The application cannot start without it.");
    throw new Error("DATABASE_URL environment variable is not set.");
}
const sql = (0, serverless_1.neon)(process.env.DATABASE_URL);
const userToolCacheService = new UserToolCacheService_1.UserToolCacheService(redis);
const sessionRegistry = new SessionRegistry_1.SessionRegistry(redis);
const providerAwareFilter = new ProviderAwareToolFilter_1.ProviderAwareToolFilter(toolConfigManager, sql, userToolCacheService);
const nangoService = new NangoService_1.NangoService();
const streamManager = new StreamManager_1.StreamManager({ logger });
const dataDependencyService = new DataDependencyService_1.DataDependencyService();
const resolver = new Resolver_1.Resolver(dataDependencyService);
const followUpService = new FollowUpService_1.FollowUpService(groqClient, config_1.CONFIG.MODEL_NAME, config_1.CONFIG.MAX_TOKENS, redis);
const toolOrchestrator = new ToolOrchestrator_1.ToolOrchestrator({
    logger,
    nangoService,
    toolConfigManager,
    dataDependencyService,
    resolver,
    redisClient: redis
});
const plannerService = new PlannerService_1.PlannerService(config_1.CONFIG.GROQ_API_KEY, config_1.CONFIG.MAX_TOKENS, toolConfigManager, providerAwareFilter);
const beatEngine = new BeatEngine_1.BeatEngine(toolConfigManager);
const historyService = new HistoryService_1.HistoryService(redis);
const nangoCircuitBreaker = new error_handling_1.CircuitBreaker(logger, { failureThreshold: 5, timeout: 60000 });
const groqCircuitBreaker = new error_handling_1.CircuitBreaker(logger, { failureThreshold: 5, timeout: 60000 });
const stripeCircuitBreaker = new error_handling_1.CircuitBreaker(logger, { failureThreshold: 5, timeout: 60000 });
const conversationService = new ConversationService_1.ConversationService({
    groqApiKey: config_1.CONFIG.GROQ_API_KEY,
    model: config_1.CONFIG.MODEL_NAME,
    maxTokens: config_1.CONFIG.MAX_TOKENS,
    TOOL_CONFIG_PATH: config_1.CONFIG.TOOL_CONFIG_PATH,
    nangoService: nangoService,
    logger: logger,
    redisClient: redis,
    client: groqClient,
    tools: [],
}, providerAwareFilter);
const actionLauncherService = new action_launcher_service_1.ActionLauncherService(conversationService, toolConfigManager, beatEngine);
const planExecutorService = new PlanExecutorService_1.PlanExecutorService(actionLauncherService, toolOrchestrator, streamManager, toolConfigManager, groqClient, plannerService, followUpService, historyService);
const executionDecisionService = new ExecutionDecisionService_1.ExecutionDecisionService();
const store_1 = require("./cortex/store");
const compiler_1 = require("./cortex/compiler");
const matcher_1 = require("./cortex/matcher");
const runtime_1 = require("./cortex/runtime");
const routes_1 = require("./cortex/routes");
const tools_1 = require("./cortex/tools");
const event_shaper_1 = require("./cortex/event-shaper");
const cortexStore = new store_1.HybridStore(redis, sql);
const cortexCompiler = new compiler_1.Compiler(config_1.CONFIG.GROQ_API_KEY);
const cortexMatcher = new matcher_1.Matcher(cortexStore, config_1.CONFIG.GROQ_API_KEY);
const toolExecutor = new tools_1.CortexToolExecutor(toolOrchestrator);
const cortexRuntime = new runtime_1.Runtime(cortexStore, config_1.CONFIG.GROQ_API_KEY, toolExecutor, logger);
async function processCortexEvent(event) {
    try {
        const written = await cortexStore.writeEvent(event);
        if (!written)
            return;
        const runs = await cortexMatcher.match(event);
        for (const run of runs) {
            cortexRuntime.execute(run).catch(err => {
                logger.error('Run execution failed', { run_id: run.id, error: err.message });
            });
        }
        logger.info('Event processed', { event_id: event.id, source: event.source, event: event.event, runs: runs.length });
    }
    catch (err) {
        logger.error('Event processing error', { error: err.message });
    }
}
const eventShaper = new event_shaper_1.EventShaper(config_1.CONFIG.NANGO_SECRET_KEY, redis, sql, processCortexEvent);
setInterval(() => {
    cortexRuntime.resumeWaitingRuns().catch(err => {
        logger.error('Resume waiting runs failed', { error: err.message });
    });
}, 60000);
const sessionState = storage.create({ dir: 'sessions' });
(async () => {
    await sessionState.init();
    await session_service_1.sessionService.init();
    logger.info('Persistent session storage initialized.');
})();
async function streamText(sessionId, messageId, text) {
    streamManager.sendChunk(sessionId, { type: 'conversational_text_segment', content: { status: 'START_STREAM' }, messageId });
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < text.length; i += 10) {
        const chunk = text.substring(i, Math.min(i + 10, text.length));
        streamManager.sendChunk(sessionId, { type: 'conversational_text_segment', content: { status: 'STREAMING', segment: { segment: chunk, styles: [], type: 'text' } }, messageId });
        await delay(20);
    }
    streamManager.sendChunk(sessionId, { type: 'conversational_text_segment', content: { status: 'END_STREAM' }, messageId, isFinal: true });
    streamManager.sendChunk(sessionId, { type: 'stream_end', isFinal: true, messageId, streamType: 'conversational' });
}
const app = (0, express_1.default)();
app.use(logging_1.traceContextMiddleware);
app.use((0, security_1.securityHeadersMiddleware)());
app.use((0, logging_1.httpLoggingMiddleware)(logger));
app.use(security_1.globalRateLimiter);
app.use((0, security_1.validateTokenExpiry)(logger));
(0, bootstrap_rate_limiting_1.setupBootstrapMiddleware)(app, redis);
app.use((0, cors_1.default)((0, security_1.corsOptionsSecure)()));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
const healthChecks = new Map();
healthChecks.set('database', async () => {
    try {
        const result = await sql `SELECT 1`;
        return !!result;
    }
    catch (err) {
        logger.error('Database health check failed', err);
        return false;
    }
});
healthChecks.set('redis', async () => {
    try {
        await redis.ping();
        return true;
    }
    catch (err) {
        logger.error('Redis health check failed', err);
        return false;
    }
});
app.use((0, health_1.createHealthRouter)(logger, healthChecks));
app.get('/metrics/bootstrap', (req, res) => {
    try {
        const metrics = bootstrap_capacity_monitor_1.bootstrapMonitor.getMetrics();
        res.json({ metrics, timestamp: Date.now() });
    }
    catch (err) {
        logger.error('Failed to get bootstrap metrics', err);
        res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
});
app.get('/bootstrap-status', (req, res) => {
    try {
        const metrics = bootstrap_capacity_monitor_1.bootstrapMonitor.getMetrics();
        const healthStatus = bootstrap_capacity_monitor_1.bootstrapMonitor.getHealthStatus();
        const scaling = bootstrap_capacity_monitor_1.bootstrapMonitor.getScalingRecommendation();
        res.json({
            status: healthStatus,
            metrics,
            scaling,
            timestamp: Date.now(),
            uptime: process.uptime()
        });
    }
    catch (err) {
        logger.error('Failed to get bootstrap status', err);
        res.status(500).json({ error: 'Failed to retrieve status' });
    }
});
app.get('/health/detailed', (req, res) => {
    try {
        const metrics = bootstrap_capacity_monitor_1.bootstrapMonitor.getMetrics();
        const healthStatus = bootstrap_capacity_monitor_1.bootstrapMonitor.getHealthStatus();
        res.json({
            status: 'healthy',
            checks: {
                cpu: { status: metrics.cpu.percent < 85 ? 'ok' : 'warning', value: `${metrics.cpu.percent}%` },
                memory: { status: metrics.memory.percent < 92 ? 'ok' : 'warning', value: `${metrics.memory.percent}%` },
                database: { status: 'ok', connections: metrics.database.active_connections },
                redis: { status: 'ok' },
                uptime: { value: `${Math.floor(process.uptime())}s` }
            },
            metrics,
            timestamp: Date.now()
        });
    }
    catch (err) {
        logger.error('Failed to get detailed health', err);
        res.status(500).json({ error: 'Health check failed' });
    }
});
app.use('/api/artifacts', artifacts_1.default);
app.use('/api/documents', documents_1.default);
app.use('/api/export', export_1.default);
app.use('/api/interpret', interpret_1.default);
app.use('/api/sessions', sessions_1.default);
app.locals.historyService = historyService;
app.use('/history', history_1.default);
app.use('/api/cortex', (0, routes_1.createCortexRouter)(cortexStore, cortexCompiler, cortexRuntime));
const CONNECTION_OWNER_TTL_SECONDS = 60 * 60;
const getConnectionOwnerCacheKey = (connectionId) => `connection-owner:${connectionId}`;
const getDefaultEmailProviderKey = () => toolConfigManager.getToolDefinition('fetch_emails')?.providerConfigKey || 'google-mail-ynxw';
async function registerConnectionForUser(userId, providerKey, connectionId) {
    const normalizedProvider = providerKey?.trim();
    const finalProviderKey = normalizedProvider || getDefaultEmailProviderKey();
    const providerExists = toolConfigManager.getAllTools()
        .map(tool => tool.providerConfigKey)
        .filter(Boolean)
        .includes(finalProviderKey);
    await sql `
        INSERT INTO connections (user_id, provider, connection_id)
        VALUES (${userId}, ${finalProviderKey}, ${connectionId})
        ON CONFLICT (user_id, provider) DO UPDATE SET
            connection_id = EXCLUDED.connection_id,
            enabled = true,
            error_count = 0,
            last_poll_at = NOW()
    `;
    await redis.setex(getConnectionOwnerCacheKey(connectionId), CONNECTION_OWNER_TTL_SECONDS, userId);
    return { providerKey: finalProviderKey, providerExists };
}
app.post('/api/connections', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const { provider, connectionId } = req.body;
        if (!userId || !connectionId) {
            return res.status(400).json({ error: 'Missing required fields: userId and connectionId' });
        }
        const { providerKey, providerExists } = await registerConnectionForUser(userId, provider, connectionId);
        if (!providerExists) {
            logger.warn('Provider key not found in tool config', {
                provider: providerKey,
                connectionId: '***',
                userId,
                availableProviders: toolConfigManager.getAllTools()
                    .map(t => t.providerConfigKey)
                    .filter(Boolean)
            });
        }
        logger.info('Connection registered', {
            userId,
            provider: providerKey,
            connectionId: '***',
            providerValid: providerExists
        });
        res.json({ success: true });
    }
    catch (err) {
        logger.error('Connection registration failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/connections', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const connections = await sql `
      SELECT id, provider, connection_id, enabled, last_poll_at, error_count, created_at
      FROM connections
      WHERE user_id = ${userId}
    `;
        res.json({ connections });
    }
    catch (err) {
        logger.error('Failed to fetch connections', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/webhooks/nango', async (req, res) => {
    try {
        const payload = req.body;
        logger.info('Nango webhook received (202 Accepted - async processing)', {
            type: payload.type,
            connectionId: payload.connectionId,
            model: payload.model,
            syncName: payload.syncName,
            hasResponseResults: !!payload.responseResults,
            responseResultsKeys: payload.responseResults ? Object.keys(payload.responseResults) : [],
            addedCount: payload.responseResults?.added?.length || 0,
            updatedCount: payload.responseResults?.updated?.length || 0,
            deletedCount: payload.responseResults?.deleted?.length || 0,
        });
        res.status(202).json({
            status: 'accepted',
            message: 'Webhook received and queued for processing'
        });
        if (payload.type === 'sync') {
            eventShaper.handleWebhook(payload)
                .then(result => {
                logger.info('Webhook processed successfully (async)', {
                    events_generated: result.processed,
                    connectionId: payload.connectionId,
                    model: payload.model
                });
            })
                .catch(err => {
                logger.error('Webhook processing failed (async)', {
                    error: err.message,
                    stack: err.stack,
                    connectionId: payload.connectionId,
                    model: payload.model,
                    type: err.constructor.name
                });
            });
        }
        else if (payload.type === 'auth') {
            (async () => {
                try {
                    const { connectionId, providerConfigKey } = payload;
                    if (!connectionId || !providerConfigKey) {
                        logger.warn('Auth webhook missing required fields', { payload });
                        return;
                    }
                    const cachedUserId = await redis.get(`connection-owner:${connectionId}`);
                    if (cachedUserId) {
                        logger.info('Auto-registering connection from auth webhook', {
                            userId: cachedUserId,
                            connectionId: connectionId.substring(0, 12) + '...',
                            provider: providerConfigKey
                        });
                        await registerConnectionForUser(cachedUserId, providerConfigKey, connectionId);
                        await userToolCacheService.invalidateUserToolCache(cachedUserId);
                        logger.info('Connection auto-registered successfully from auth webhook', {
                            userId: cachedUserId,
                            provider: providerConfigKey
                        });
                    }
                    else {
                        logger.warn('No cached userId found for connection from auth webhook', {
                            connectionId: connectionId.substring(0, 12) + '...',
                            hint: 'Frontend should call /api/connections POST after OAuth'
                        });
                    }
                }
                catch (err) {
                    logger.error('Failed to auto-register connection from auth webhook', {
                        error: err.message,
                        stack: err.stack
                    });
                }
            })();
        }
        else {
            logger.warn('Received non-sync webhook type', { type: payload.type });
        }
    }
    catch (err) {
        logger.error('Nango webhook error', { error: err.message, stack: err.stack });
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/create-payment-link', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized - No token provided'
            });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await firebase_1.auth.verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;
        const email = decodedToken.email;
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email not found in Firebase token'
            });
        }
        logger.info('Creating payment link', {
            firebaseUid,
            email,
        });
        const paymentUrl = await StripeService_1.stripeService.createPaymentLinkForUser(firebaseUid, email);
        res.status(200).json({
            success: true,
            url: paymentUrl
        });
    }
    catch (error) {
        logger.error('Failed to create payment link', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create payment link'
        });
    }
});
app.post('/api/create-payment-link-public', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }
        logger.info(`🌐 Public payment link request for: ${email}`);
        const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const urlWithEmail = await StripeService_1.stripeService.createPaymentLinkWithMetadata(tempUserId, email, 'landing_page');
        logger.info(`✅ Created public payment link: ${tempUserId}`);
        res.json({ success: true, url: urlWithEmail });
    }
    catch (error) {
        logger.error('Public payment link error', { error: error.message });
        res.status(500).json({ error: 'Failed to create payment link', details: error.message });
    }
});
app.post('/api/link-subscription', async (req, res) => {
    try {
        const { firebaseUid, email, tempUserId } = req.body;
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing authorization token' });
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await firebase_1.auth.verifyIdToken(token);
        if (decodedToken.uid !== firebaseUid) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        logger.info(`🔗 Linking subscription for ${email} to ${firebaseUid}`);
        const revenuecatSecret = process.env.REVENUECAT_SECRET_KEY || process.env.REVENUCAT_API_KEY;
        if (!revenuecatSecret) {
            logger.error('REVENUECAT_SECRET_KEY is not set');
            return res.status(500).json({ error: 'RevenueCat secret key not configured' });
        }
        const transferUrl = `https://api.revenuecat.com/v1/subscribers/${tempUserId}/alias`;
        const transferResp = await fetch(transferUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${revenuecatSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ new_app_user_id: firebaseUid })
        });
        if (!transferResp.ok) {
            const errText = await transferResp.text();
            logger.error('RevenueCat transfer failed', { status: transferResp.status, errText });
            return res.status(500).json({ error: 'Failed to link subscription', details: errText });
        }
        const attrUrl = `https://api.revenuecat.com/v1/subscribers/${firebaseUid}/attributes`;
        await fetch(attrUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${revenuecatSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ attributes: { email: { value: email } } })
        });
        res.json({ success: true });
    }
    catch (error) {
        logger.error('Link subscription error', { error: error.message });
        res.status(500).json({ error: 'Failed to link subscription', details: error.message });
    }
});
app.get('/success', (req, res) => {
    try {
        const email = req.query.email ? `?email=${encodeURIComponent(req.query.email)}` : '';
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Purchase Successful!</title>
        <link rel="stylesheet" href="/success.css">
      </head>
      <body>
        <div id="root"></div>
        <script src="/success.js"></script>
      </body>
      </html>
    `;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    }
    catch (error) {
        logger.error('Success page error', { error: error.message });
        res.status(500).json({ error: 'Failed to load success page' });
    }
});
app.post('/api/webhooks/stripe', express_1.default.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const event = StripeService_1.stripeService.verifyWebhookSignature(body, signature);
        if (!event) {
            logger.warn('Stripe webhook signature verification failed');
            return res.status(401).json({ error: 'Unauthorized' });
        }
        logger.info('Stripe webhook received (audit log only)', {
            eventType: event.type,
            eventId: event.id,
            note: 'Main processing happens in RevenueCat'
        });
        res.status(200).json({ received: true });
    }
    catch (err) {
        logger.error('Stripe webhook error', {
            error: err.message,
            stack: err.stack
        });
        res.status(200).json({ error: 'processed with error' });
    }
});
app.get('/api/subscription', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await firebase_1.auth.verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;
        const isSubscribed = await RevenueCatService_1.revenueCatService.isUserSubscribed(firebaseUid);
        const activeEntitlements = await RevenueCatService_1.revenueCatService.getActiveEntitlements(firebaseUid);
        res.json({
            success: true,
            isSubscribed,
            entitlements: activeEntitlements
        });
    }
    catch (err) {
        logger.error('Failed to get subscription info', { error: err.message });
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});
app.post('/api/debug/force-sync', async (req, res) => {
    try {
        const { provider, connectionId, syncName } = req.body;
        if (!provider || !connectionId || !syncName) {
            return res.status(400).json({
                error: 'Missing required fields: provider, connectionId, syncName',
            });
        }
        if (connectionId.startsWith('test-connection')) {
            logger.info('Skipping Nango API call for test connection', { connectionId });
            return res.json({
                success: true,
                message: `Test sync "${syncName}" acknowledged (no actual sync triggered).`,
            });
        }
        logger.info('Manually triggering sync', { provider, connectionId, syncName });
        await nangoService.triggerSync(provider, connectionId, syncName);
        res.json({
            success: true,
            message: `Sync "${syncName}" triggered successfully. Check webhook endpoint for results.`,
        });
    }
    catch (err) {
        logger.error('Force sync failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});
app.use((req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0');
    if (contentLength > 0) {
        metrics_1.httpRequestSize.observe({ method: req.method, route: req.path }, contentLength);
    }
    const originalSend = res.send;
    res.send = function (data) {
        const responseSize = Buffer.byteLength(JSON.stringify(data));
        metrics_1.httpResponseSize.observe({ method: req.method, route: req.path, status_code: res.statusCode }, responseSize);
        return originalSend.call(this, data);
    };
    const start = Date.now();
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        metrics_1.httpRequestDuration.observe({ method: req.method, route: req.path, status_code: res.statusCode }, duration);
        metrics_1.httpRequestsTotal.inc({ method: req.method, route: req.path, status_code: res.statusCode });
    });
    next();
});
app.use((0, security_1.secureErrorHandler)(logger));
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
actionLauncherService.on('send_chunk', (sessionId, chunk) => {
    streamManager.sendChunk(sessionId, chunk);
});
plannerService.on('send_chunk', (sessionId, chunk) => {
    streamManager.sendChunk(sessionId, chunk);
});
conversationService.on('send_chunk', (sessionId, chunk) => {
    streamManager.sendChunk(sessionId, chunk);
});
async function notifyUserOfToolChanges(userId) {
    try {
        const activeSessions = await sessionRegistry.getActiveSessionsForUser(userId);
        const availableTools = await providerAwareFilter.getAvailableToolsForUser(userId);
        logger.info('Notifying user of tool changes', {
            userId,
            sessionCount: activeSessions.length,
            toolCount: availableTools.length,
        });
        for (const sessionId of activeSessions) {
            streamManager.sendChunk(sessionId, {
                type: 'tools_updated',
                content: { tools: availableTools }
            });
        }
    }
    catch (error) {
        logger.error('Error notifying user of tool changes', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
wss.on('connection', (ws, req) => {
    const sessionId = req.url?.slice(1) || (0, uuid_1.v4)();
    streamManager.addConnection(sessionId, ws);
    logger.info('Client connected', { sessionId });
    streamManager.sendChunk(sessionId, { type: 'connection_ack', content: { sessionId } });
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'init') {
                let userId;
                if (data.idToken) {
                    const decodedToken = await firebase_1.auth.verifyIdToken(data.idToken);
                    userId = decodedToken.uid;
                    await sessionState.setItem(sessionId, { userId });
                    await sessionRegistry.registerUserSession(userId, sessionId);
                    streamManager.sendChunk(sessionId, { type: 'auth_success', content: { userId } });
                    logger.info('Client authenticated', { userId, sessionId });
                    try {
                        const availableTools = await providerAwareFilter.getAvailableToolsForUser(userId);
                        streamManager.sendChunk(sessionId, {
                            type: 'session_init',
                            content: {
                                sessionId: sessionId,
                                tools: availableTools,
                            }
                        });
                        logger.info('Sent provider-aware tools to client', { userId, toolCount: availableTools.length });
                    }
                    catch (toolError) {
                        logger.error('Error sending provider-aware tools', { userId, error: toolError.message });
                    }
                    try {
                        const activeConnectionId = await redis.get(`active-connection:${userId}`);
                        if (activeConnectionId) {
                            const emailTool = toolConfigManager.getToolDefinition('fetch_emails');
                            const gmailProviderKey = emailTool?.providerConfigKey || 'google-mail-ynxw';
                            logger.info('Warming Gmail connection post-auth', {
                                userId,
                                connectionId: '***',
                                providerKey: gmailProviderKey
                            });
                            await nangoService.warmConnection(gmailProviderKey, activeConnectionId);
                        }
                    }
                    catch (warmError) {
                        logger.warn('Post-auth connection warming failed', { userId, error: warmError.message });
                    }
                }
                else {
                    userId = `unauthenticated-user-${(0, uuid_1.v4)()}`;
                    await sessionState.setItem(sessionId, { userId });
                    await sessionRegistry.registerUserSession(userId, sessionId);
                    streamManager.sendChunk(sessionId, { type: 'auth_success', content: { userId } });
                    logger.info('Unauthenticated session created', { userId, sessionId });
                    streamManager.sendChunk(sessionId, {
                        type: 'session_init',
                        content: {
                            sessionId: sessionId,
                            tools: [],
                        }
                    });
                }
                return;
            }
            const state = (await sessionState.getItem(sessionId));
            if (!state)
                throw new Error('Not authenticated');
            const { userId } = state;
            if (data.type === 'execute_action' && data.content) {
                const actionPayload = data.content;
                const currentRun = state.activeRun;
                if (!currentRun) {
                    logger.error('Cannot execute action without an active run.', { sessionId });
                    streamManager.sendChunk(sessionId, { type: 'error', content: 'No active run found to execute action.' });
                    return;
                }
                const actionId = actionPayload.actionId;
                const step = currentRun.toolExecutionPlan.find(s => s.toolCall.id === actionId);
                if (!step) {
                    logger.error('Could not find matching step in run for action', { sessionId, actionId });
                    streamManager.sendChunk(sessionId, { type: 'error', content: 'Internal error: Could not match action to run step.' });
                    return;
                }
                streamManager.sendChunk(sessionId, {
                    type: 'action_status',
                    content: { actionId, status: 'starting', message: `Starting ${actionPayload.toolName}...` },
                    messageId: actionId,
                });
                const completedAction = await actionLauncherService.executeAction(sessionId, userId, actionPayload, toolOrchestrator, currentRun.planId, step.stepId);
                const stepIndex = currentRun.toolExecutionPlan.findIndex(s => s.stepId === step.stepId);
                if (stepIndex !== -1) {
                    currentRun.toolExecutionPlan[stepIndex].status = completedAction.status;
                    currentRun.toolExecutionPlan[stepIndex].result = { status: completedAction.status === 'completed' ? 'success' : 'failed', toolName: completedAction.toolName, data: completedAction.result, error: completedAction.error };
                    currentRun.toolExecutionPlan[stepIndex].finishedAt = new Date().toISOString();
                }
                const completedRun = await planExecutorService.executePlan(currentRun, userId);
                state.activeRun = completedRun;
                await sessionState.setItem(sessionId, state);
                if (completedRun.status === 'completed' && !completedRun.assistantResponse) {
                    logger.info('Execute action: Plan completed, generating final summary', {
                        sessionId,
                        runId: completedRun.id,
                        planLength: completedRun.toolExecutionPlan.length
                    });
                    completedRun.toolExecutionPlan.forEach(step => {
                        if (step.result) {
                            logger.info('Adding tool result to history', {
                                stepId: step.stepId,
                                toolName: step.toolCall.name,
                                status: step.status
                            });
                            const resultData = step.status === 'failed'
                                ? {
                                    status: 'failed',
                                    error: step.result.error || 'Unknown error',
                                    errorDetails: step.result.errorDetails,
                                    ...step.result.data
                                }
                                : step.result.data;
                            conversationService.addToolResultMessageToHistory(sessionId, step.toolCall.id, step.toolCall.name, resultData);
                        }
                    });
                    logger.info('Requesting final summary from LLM', { sessionId });
                    const finalResponseResult = await conversationService.processMessageAndAggregateResults(null, sessionId, (0, uuid_1.v4)(), userId);
                    logger.info('Final response result received', {
                        sessionId,
                        hasResponse: !!finalResponseResult.conversationalResponse,
                        responseLength: finalResponseResult.conversationalResponse?.length || 0
                    });
                    if (finalResponseResult.conversationalResponse?.trim()) {
                        await streamText(sessionId, (0, uuid_1.v4)(), finalResponseResult.conversationalResponse);
                        try {
                            await historyService.recordAssistantMessage(userId, sessionId, finalResponseResult.conversationalResponse);
                            logger.info('Final response recorded in history', { sessionId });
                        }
                        catch (error) {
                            logger.warn('Failed to record assistant message', { error: error.message });
                        }
                        completedRun.assistantResponse = finalResponseResult.conversationalResponse;
                        state.activeRun = completedRun;
                        await sessionState.setItem(sessionId, state);
                    }
                }
            }
            if (data.type === 'update_parameter' && data.content) {
                actionLauncherService.updateParameterValue(sessionId, data.content);
                return;
            }
            if (data.type === 'update_active_connection' && data.content) {
                const { connectionId, provider, providerConfigKey } = data.content;
                if (!userId || !connectionId)
                    return;
                await redis.set(`active-connection:${userId}`, connectionId);
                logger.info('Successfully set active Nango connection for user', { userId });
                await userToolCacheService.invalidateUserToolCache(userId);
                const availableTools = await providerAwareFilter.getAvailableToolsForUser(userId);
                let providerKeyToWarm = provider ?? providerConfigKey;
                try {
                    const registration = await registerConnectionForUser(userId, providerKeyToWarm, connectionId);
                    providerKeyToWarm = registration.providerKey;
                    if (!registration.providerExists) {
                        logger.warn('Active connection uses unknown provider key', {
                            userId,
                            provider: providerKeyToWarm,
                            connectionId: '***'
                        });
                    }
                }
                catch (registrationError) {
                    providerKeyToWarm = getDefaultEmailProviderKey();
                    logger.error('Failed to persist active connection', {
                        userId,
                        connectionId: '***',
                        error: registrationError.message
                    });
                }
                try {
                    logger.info('Warming active connection', {
                        userId,
                        connectionId: '***',
                        providerKey: providerKeyToWarm
                    });
                    const warmSuccess = await nangoService.warmConnection(providerKeyToWarm, connectionId);
                    streamManager.sendChunk(sessionId, {
                        type: 'tools_updated',
                        content: {
                            tools: availableTools,
                            warmed: warmSuccess
                        }
                    });
                    logger.info('Connection updated and tools refreshed', {
                        userId,
                        toolCount: availableTools.length,
                        warmed: warmSuccess
                    });
                    await notifyUserOfToolChanges(userId);
                }
                catch (error) {
                    logger.error('Connection warming on update failed', {
                        userId,
                        connectionId: '***',
                        providerKey: providerKeyToWarm,
                        error: error.message
                    });
                    streamManager.sendChunk(sessionId, {
                        type: 'tools_updated',
                        content: {
                            tools: availableTools,
                            warmed: false
                        }
                    });
                }
                return;
            }
            if (data.type === 'rerun_plan' && data.content && data.content.plan) {
                const savedPlan = data.content.plan;
                const messageId = (0, uuid_1.v4)();
                logger.info('Rerunning saved plan', { sessionId, userId, messageId, planSize: savedPlan.length });
                actionLauncherService.clearActions(sessionId);
                const run = RunManager_1.RunManager.createRun({
                    sessionId,
                    userId,
                    userInput: `Rerun of a saved plan with ${savedPlan.length} steps.`,
                    toolExecutionPlan: []
                });
                state.activeRun = run;
                await sessionState.setItem(sessionId, state);
                streamManager.sendChunk(sessionId, { type: 'run_updated', content: run });
                const newActionPlan = savedPlan.map(step => ({
                    id: (0, uuid_1.v4)(),
                    tool: step.toolName,
                    intent: step.description,
                    arguments: step.arguments || {},
                    status: 'ready',
                }));
                const enrichedPlan = newActionPlan.map((step) => {
                    const toolDef = toolConfigManager.getToolDefinition(step.tool);
                    const toolDisplayName = toolDef?.display_name || toolDef?.displayName || toolDef?.name || step.tool.replace(/_/g, ' ').split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    const parameters = [];
                    if (toolDef?.parameters?.properties) {
                        const props = toolDef.parameters.properties;
                        const required = toolDef.parameters.required || [];
                        Object.keys(props).forEach((paramName) => {
                            const prop = props[paramName];
                            parameters.push({
                                name: paramName,
                                type: Array.isArray(prop.type) ? prop.type[0] : (prop.type || 'string'),
                                description: prop.description || '',
                                required: required.includes(paramName),
                                hint: prop.hint || prop.prompt || null,
                                enumValues: prop.enum || null,
                                currentValue: step.arguments?.[paramName] || null
                            });
                        });
                    }
                    return {
                        id: step.id,
                        messageId: messageId,
                        toolName: step.tool,
                        toolDisplayName,
                        description: step.intent,
                        status: step.status,
                        arguments: step.arguments || {},
                        parameters,
                        missingParameters: [],
                        error: null,
                        result: null
                    };
                });
                streamManager.sendChunk(sessionId, {
                    type: 'plan_generated',
                    content: {
                        messageId,
                        planOverview: enrichedPlan,
                        analysis: `Rerunning saved plan with ${enrichedPlan.length} actions.`
                    },
                    messageId,
                    isFinal: true,
                });
                try {
                    const planTitle = `Rerun: ${savedPlan.length} actions`;
                    const actions = savedPlan.map((step) => ({
                        toolName: step.toolName,
                        description: step.description
                    }));
                    const historyId = await historyService.recordPlanCreation(userId, sessionId, run.id, planTitle, actions);
                    run.historyId = historyId;
                }
                catch (error) {
                    logger.warn('Failed to record rerun in history', { error: error.message });
                }
                await actionLauncherService.processActionPlan(newActionPlan, sessionId, userId, messageId, toolOrchestrator, run);
                run.toolExecutionPlan = newActionPlan.map((step) => ({
                    stepId: step.id,
                    toolCall: {
                        id: step.id,
                        name: step.tool,
                        arguments: step.arguments,
                        sessionId,
                        userId,
                    },
                    status: 'pending',
                    startedAt: new Date().toISOString(),
                }));
                await sessionState.setItem(sessionId, state);
                const actions = actionLauncherService.getActiveActions(sessionId);
                const planAnalysis = executionDecisionService.analyzePlan(actions.map(a => ({
                    name: a.toolName,
                    status: a.status,
                    arguments: a.arguments || a.parameters
                })));
                const decision = executionDecisionService.shouldAutoExecute(planAnalysis);
                logger.info('Rerun execution decision', {
                    sessionId,
                    decision,
                    actionCount: actions.length
                });
                if (decision.shouldAutoExecute) {
                    logger.info('Auto-executing rerun plan', {
                        sessionId,
                        runId: run.id,
                        reason: decision.reason
                    });
                    await planExecutorService.executePlan(run, userId);
                    if (run.status === 'completed') {
                        logger.info('Rerun plan auto-execution complete, generating final response.', { sessionId });
                        run.toolExecutionPlan.forEach(step => {
                            if (step.status === 'completed' && step.result) {
                                conversationService.addToolResultMessageToHistory(sessionId, step.toolCall.id, step.toolCall.name, step.result.data);
                            }
                        });
                        const finalResponseResult = await conversationService.processMessageAndAggregateResults(null, sessionId, (0, uuid_1.v4)());
                        if (finalResponseResult.conversationalResponse?.trim()) {
                            await streamText(sessionId, (0, uuid_1.v4)(), finalResponseResult.conversationalResponse);
                        }
                    }
                }
                else {
                    logger.info('Rerun plan requires user input before execution.', { sessionId });
                }
                return;
            }
            if (data.type === 'content' && typeof data.content === 'string') {
                const messageId = (0, uuid_1.v4)();
                logger.info('Processing user message', { sessionId, userId, messageId });
                try {
                    await historyService.recordUserMessage(userId, sessionId, data.content);
                }
                catch (error) {
                    logger.warn('Failed to record user message in history', { error: error.message });
                }
                const processedResult = await conversationService.processMessageAndAggregateResults(data.content, sessionId, messageId, userId);
                const { aggregatedToolCalls, conversationalResponse } = processedResult;
                if (conversationalResponse?.trim()) {
                    await streamText(sessionId, messageId, conversationalResponse);
                }
                const isPlanRequest = aggregatedToolCalls.some(tool => tool.name === 'planParallelActions');
                const executableToolCount = aggregatedToolCalls.filter(t => t.name !== 'planParallelActions').length;
                if (isPlanRequest || executableToolCount > 1) {
                    logger.info(`Complex request identified. Routing to PlannerService.`, { sessionId, isPlanRequest, executableToolCount });
                    const run = RunManager_1.RunManager.createRun({ sessionId, userId, userInput: data.content, toolExecutionPlan: [] });
                    state.activeRun = run;
                    await sessionState.setItem(sessionId, state);
                    streamManager.sendChunk(sessionId, { type: 'run_updated', content: run });
                    const toolsForPlanning = aggregatedToolCalls.filter(t => t.name !== 'planParallelActions');
                    const actionPlan = await plannerService.generatePlanWithStepAnnouncements(data.content, toolsForPlanning, sessionId, messageId, userId);
                    if (actionPlan && actionPlan.length > 0) {
                        await actionLauncherService.processActionPlan(actionPlan, sessionId, userId, messageId, toolOrchestrator, run);
                        try {
                            const planTitle = data.content.substring(0, 100);
                            const actions = actionPlan.map(step => ({
                                toolName: step.tool,
                                description: step.intent
                            }));
                            const historyId = await historyService.recordPlanCreation(userId, sessionId, run.id, planTitle, actions);
                            run.historyId = historyId;
                            logger.info('Plan recorded in history', { sessionId, historyId, planId: run.id });
                        }
                        catch (error) {
                            logger.warn('Failed to record plan in history', { error: error.message });
                        }
                        const actions = actionLauncherService.getActiveActions(sessionId);
                        const planAnalysis = executionDecisionService.analyzePlan(actions.map(a => ({
                            name: a.toolName,
                            status: a.status,
                            arguments: a.arguments || a.parameters
                        })));
                        const decision = executionDecisionService.shouldAutoExecute(planAnalysis);
                        logger.info('Multi-step plan execution decision', {
                            sessionId,
                            decision,
                            actionCount: actions.length
                        });
                        if (decision.shouldAutoExecute) {
                            logger.info('Auto-executing multi-step plan', {
                                sessionId,
                                runId: run.id,
                                reason: decision.reason
                            });
                            const completedRun = await planExecutorService.executePlan(run, userId);
                            state.activeRun = completedRun;
                            await sessionState.setItem(sessionId, state);
                        }
                        else {
                            logger.info('Plan requires user input before execution.', { sessionId });
                        }
                        const enrichedPlan = actionPlan.map((step) => {
                            const toolDef = toolConfigManager.getToolDefinition(step.tool);
                            const toolDisplayName = toolDef?.display_name || toolDef?.name || step.tool;
                            const parameters = [];
                            if (toolDef?.parameters?.properties) {
                                const props = toolDef.parameters.properties;
                                const required = toolDef.parameters.required || [];
                                Object.keys(props).forEach((paramName) => {
                                    const prop = props[paramName];
                                    parameters.push({
                                        name: paramName, type: prop.type || 'string', description: prop.description || '',
                                        required: required.includes(paramName), hint: prop.hint || null,
                                        enumValues: prop.enum || null, currentValue: step.arguments?.[paramName] || null
                                    });
                                });
                            }
                            return {
                                id: step.id, messageId, toolName: step.tool, toolDisplayName,
                                description: step.intent, status: step.status, arguments: step.arguments || {},
                                parameters, missingParameters: [], error: null, result: null
                            };
                        });
                        streamManager.sendChunk(sessionId, {
                            type: 'plan_generated',
                            content: { messageId, planOverview: enrichedPlan, analysis: `Plan generated with ${enrichedPlan.length} actions.` },
                            messageId, isFinal: true,
                        });
                        run.toolExecutionPlan = actionPlan.map((step) => ({
                            stepId: step.id,
                            toolCall: { id: step.id, name: step.tool, arguments: step.arguments, sessionId, userId },
                            status: 'pending', startedAt: new Date().toISOString(),
                        }));
                        await sessionState.setItem(sessionId, state);
                    }
                    else if (!conversationalResponse) {
                        await streamText(sessionId, messageId, "I was unable to formulate a plan for your request.");
                    }
                }
                else if (executableToolCount === 1) {
                    const singleToolCall = aggregatedToolCalls.find(t => t.name !== 'planParallelActions');
                    logger.info(`Single tool call '${singleToolCall.name}' identified. Bypassing planner.`, { sessionId });
                    const run = RunManager_1.RunManager.createRun({ sessionId, userId, userInput: data.content, toolExecutionPlan: [] });
                    state.activeRun = run;
                    await sessionState.setItem(sessionId, state);
                    streamManager.sendChunk(sessionId, { type: 'run_updated', content: run });
                    const singleStepPlan = [{
                            id: singleToolCall.id || (0, uuid_1.v4)(),
                            intent: `Execute the ${singleToolCall.name} tool.`,
                            tool: singleToolCall.name,
                            arguments: singleToolCall.arguments,
                            status: 'ready',
                        }];
                    await plannerService.streamSingleActionAnnouncement(singleStepPlan[0], sessionId);
                    run.toolExecutionPlan = singleStepPlan.map((step) => ({
                        stepId: step.id,
                        toolCall: {
                            id: step.id,
                            name: step.tool,
                            arguments: step.arguments,
                            sessionId,
                            userId,
                        },
                        status: 'pending',
                        startedAt: new Date().toISOString(),
                    }));
                    await sessionState.setItem(sessionId, state);
                    await actionLauncherService.processActionPlan(singleStepPlan, sessionId, userId, messageId, toolOrchestrator, run);
                    const actions = actionLauncherService.getActiveActions(sessionId);
                    const planAnalysis = executionDecisionService.analyzePlan(actions.map(a => ({
                        name: a.toolName,
                        status: a.status,
                        arguments: a.arguments || a.parameters
                    })));
                    const decision = executionDecisionService.shouldAutoExecute(planAnalysis);
                    logger.info('Single-step plan execution decision', {
                        sessionId,
                        decision,
                        actionCount: actions.length
                    });
                    const enrichedPlan = singleStepPlan.map((step) => {
                        const toolDef = toolConfigManager.getToolDefinition(step.tool);
                        const toolDisplayName = toolDef?.display_name || toolDef?.name || step.tool;
                        const parameters = [];
                        if (toolDef?.parameters?.properties) {
                            const props = toolDef.parameters.properties;
                            const required = toolDef.parameters.required || [];
                            Object.keys(props).forEach((paramName) => {
                                const prop = props[paramName];
                                parameters.push({
                                    name: paramName, type: prop.type || 'string', description: prop.description || '',
                                    required: required.includes(paramName), hint: prop.hint || null,
                                    enumValues: prop.enum || null, currentValue: step.arguments?.[paramName] || null
                                });
                            });
                        }
                        const activeAction = actions.find(a => a.id === step.id);
                        return {
                            id: step.id, messageId, toolName: step.tool, toolDisplayName,
                            description: activeAction?.description || step.intent,
                            status: activeAction?.status || step.status,
                            arguments: activeAction?.arguments || step.arguments || {},
                            parameters: activeAction?.parameters || parameters,
                            missingParameters: activeAction?.missingParameters || [],
                            error: null,
                            result: null
                        };
                    });
                    streamManager.sendChunk(sessionId, {
                        type: 'plan_generated',
                        content: { messageId, planOverview: enrichedPlan, analysis: `Preparing to execute action.` },
                        messageId, isFinal: true,
                    });
                    if (decision.shouldAutoExecute) {
                        logger.info('Auto-executing single action', {
                            sessionId,
                            runId: run.id,
                            reason: decision.reason
                        });
                        const completedRunAfterExec = await planExecutorService.executePlan(run, userId);
                        state.activeRun = completedRunAfterExec;
                        await sessionState.setItem(sessionId, state);
                    }
                    else if (decision.needsUserInput) {
                        logger.info('Single action requires user input before execution', {
                            sessionId,
                            reason: decision.reason
                        });
                    }
                    else if (decision.needsConfirmation) {
                        logger.info('Single action requires user confirmation', {
                            sessionId,
                            reason: decision.reason
                        });
                        streamManager.sendChunk(sessionId, {
                            type: 'action_confirmation_required',
                            plan_id: run.id,
                            actions: enrichedPlan,
                            message: decision.reason,
                            showExecuteButton: true,
                            autoExecute: false
                        });
                    }
                }
                const finalRunState = (await sessionState.getItem(sessionId))?.activeRun;
                if (finalRunState && finalRunState.status === 'completed' && !finalRunState.assistantResponse) {
                    logger.info('Auto-execution complete, generating final context-aware response.', {
                        sessionId,
                        runId: finalRunState.id,
                        planLength: finalRunState.toolExecutionPlan.length
                    });
                    finalRunState.toolExecutionPlan.forEach(step => {
                        if (step.result) {
                            logger.info('Adding tool result to history', {
                                stepId: step.stepId,
                                toolName: step.toolCall.name,
                                status: step.status
                            });
                            const resultData = step.status === 'failed'
                                ? {
                                    status: 'failed',
                                    error: step.result.error || 'Unknown error',
                                    errorDetails: step.result.errorDetails,
                                    ...step.result.data
                                }
                                : step.result.data;
                            conversationService.addToolResultMessageToHistory(sessionId, step.toolCall.id, step.toolCall.name, resultData);
                        }
                    });
                    logger.info('Requesting final summary from LLM', { sessionId });
                    let finalResponseResult = await conversationService.processMessageAndAggregateResults(null, sessionId, (0, uuid_1.v4)(), userId);
                    logger.info('Final response result received', {
                        sessionId,
                        hasResponse: !!finalResponseResult.conversationalResponse,
                        responseLength: finalResponseResult.conversationalResponse?.length || 0
                    });
                    if (!finalResponseResult.conversationalResponse?.trim()) {
                        logger.warn('First summary attempt returned empty, retrying with explicit prompt', {
                            sessionId,
                            runId: finalRunState.id
                        });
                        finalResponseResult = await conversationService.processMessageAndAggregateResults("Please provide a warm, conversational summary of what you just accomplished based on the tool results above.", sessionId, (0, uuid_1.v4)(), userId);
                        logger.info('Retry response result received', {
                            sessionId,
                            hasResponse: !!finalResponseResult.conversationalResponse,
                            responseLength: finalResponseResult.conversationalResponse?.length || 0
                        });
                    }
                    if (finalResponseResult.conversationalResponse?.trim()) {
                        await streamText(sessionId, (0, uuid_1.v4)(), finalResponseResult.conversationalResponse);
                        try {
                            await historyService.recordAssistantMessage(userId, sessionId, finalResponseResult.conversationalResponse);
                            logger.info('Final response recorded in history', { sessionId });
                        }
                        catch (error) {
                            logger.warn('Failed to record assistant message', { error: error.message });
                        }
                        finalRunState.assistantResponse = finalResponseResult.conversationalResponse;
                        await sessionState.setItem(sessionId, { userId, activeRun: finalRunState });
                        logger.info('Run state updated with assistant response', { sessionId });
                    }
                    else {
                        logger.warn('No final conversational response generated after tool execution, using fallback', {
                            sessionId,
                            runId: finalRunState.id
                        });
                        const fallbackMessage = "The actions have been completed successfully.";
                        await streamText(sessionId, (0, uuid_1.v4)(), fallbackMessage);
                        try {
                            await historyService.recordAssistantMessage(userId, sessionId, fallbackMessage);
                        }
                        catch (error) {
                            logger.warn('Failed to record fallback message', { error: error.message });
                        }
                        finalRunState.assistantResponse = fallbackMessage;
                        await sessionState.setItem(sessionId, { userId, activeRun: finalRunState });
                    }
                }
                else if (!conversationalResponse && executableToolCount === 0 && !isPlanRequest) {
                    logger.warn('No tools or conversational response generated for user message.', {
                        sessionId,
                        userMessage: data.content,
                        hasFinalRunState: !!finalRunState,
                        finalRunStatus: finalRunState?.status,
                        hasAssistantResponse: !!finalRunState?.assistantResponse
                    });
                    await streamText(sessionId, messageId, "I'm not sure how to help with that. Could you rephrase or provide more details?");
                }
                return;
            }
            if (data.type === 'interpret') {
                const { query, sessionId: incomingSessionId, documentIds, enableArtifacts, searchSettings } = data.content || {};
                const wsMessageId = (0, uuid_1.v4)();
                const sessionIdForWS = incomingSessionId || (0, uuid_1.v4)();
                streamManager.sendChunk(sessionIdForWS, { type: 'interpret_started', messageId: wsMessageId });
                try {
                    const sessionCtx = incomingSessionId ? await sessionState.getItem(incomingSessionId) : null;
                    let documentContext = [];
                    if (Array.isArray(documentIds) && documentIds.length > 0) {
                        documentContext = await document_service_1.documentService.getDocuments(documentIds);
                    }
                    const { mode, entities } = await router_service_1.routerService.detectIntent(query);
                    const groqPrompt = prompt_generator_service_1.promptGeneratorService.generatePrompt(mode, query, entities, {
                        sessionContext: null,
                        documentContext,
                        enableArtifacts,
                    });
                    const groqResponse = await groq_service_1.groqService.executeSearch(groqPrompt, { searchSettings });
                    const interpretiveResponse = response_parser_service_1.responseParserService.parseGroqResponse(groqResponse.content, mode, groqResponse);
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'hero', data: interpretiveResponse.hero } });
                    for (const seg of interpretiveResponse.segments) {
                        streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'segment', data: seg } });
                    }
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'sources', data: interpretiveResponse.sources } });
                    if (enableArtifacts) {
                        const should = (() => {
                            const q = String(query || '').toLowerCase();
                            return ['generate', 'script', 'analyze', 'visualize', 'plot', 'chart', 'calculate'].some(k => q.includes(k));
                        })();
                        if (should) {
                            const artifact = await artifact_generator_service_1.artifactGeneratorService.generateCodeArtifact({
                                prompt: query,
                                language: 'python',
                                context: interpretiveResponse,
                            });
                            interpretiveResponse.artifact = artifact;
                            streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'artifact', data: artifact } });
                        }
                    }
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_complete', messageId: wsMessageId, content: interpretiveResponse, isFinal: true });
                }
                catch (err) {
                    streamManager.sendChunk(sessionIdForWS, { type: 'error', messageId: wsMessageId, content: { code: 'INTERPRET_ERROR', message: err?.message || 'Unknown error' }, isFinal: true });
                }
                return;
            }
            if (data.type === 'interpret_stream' && data.content) {
                const { query, sessionId: incomingSessionId, documentIds, enableArtifacts, searchSettings } = data.content || {};
                if (!query || typeof query !== 'string') {
                    streamManager.sendChunk(sessionId, { type: 'interpret_event', event: 'error', data: { message: 'Query is required' } });
                    return;
                }
                const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
                const startTime = Date.now();
                const send = (event, dataObj) => {
                    streamManager.sendChunk(sessionId, { type: 'interpret_event', event, data: dataObj });
                };
                try {
                    send('start', { requestId, status: 'loading' });
                    const sessionContext = null;
                    const docCtx = Array.isArray(documentIds) && documentIds.length
                        ? await document_service_1.documentService.getDocuments(documentIds)
                        : [];
                    const { mode, entities } = await router_service_1.routerService.detectIntent(query);
                    const groqPrompt = prompt_generator_service_1.promptGeneratorService.generatePrompt(mode, query, entities, {
                        sessionContext,
                        documentContext: docCtx,
                        enableArtifacts,
                    });
                    let combinedContent = '';
                    let reasoning = '';
                    let model = '';
                    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                    try {
                        const stream = groq_service_1.groqService.executeSearchStream(groqPrompt, { searchSettings });
                        for await (const chunk of stream) {
                            if (chunk.model)
                                model = chunk.model;
                            if ('usage' in chunk && chunk.usage) {
                                usage = { ...usage, ...chunk.usage };
                            }
                            const choice = chunk.choices?.[0];
                            const delta = choice?.delta ?? {};
                            if (typeof delta?.content === 'string' && delta.content.length) {
                                combinedContent += delta.content;
                                send('token', { chunk: delta.content });
                            }
                            if (typeof delta?.reasoning === 'string' && delta.reasoning.length) {
                                reasoning += delta.reasoning;
                                send('reasoning', { text: delta.reasoning });
                            }
                        }
                    }
                    catch (streamErr) {
                        const resp = await groq_service_1.groqService.executeSearch(groqPrompt, { searchSettings });
                        combinedContent = resp.content;
                        model = resp.model;
                        usage = resp.usage;
                        reasoning = resp.reasoning || '';
                    }
                    let groqResponse = { content: combinedContent, model, usage, reasoning };
                    let interpretiveResponse;
                    try {
                        interpretiveResponse = response_parser_service_1.responseParserService.parseGroqResponse(combinedContent, mode, groqResponse);
                    }
                    catch (parseError) {
                        send('warning', { type: 'parse_error', message: parseError?.message || 'Failed to parse Groq JSON' });
                        interpretiveResponse = response_parser_service_1.responseParserService.buildFallbackResponse(combinedContent, mode, groqResponse, parseError?.message || 'Failed to parse Groq JSON');
                    }
                    interpretiveResponse.metadata.processingTimeMs = Date.now() - startTime;
                    if (interpretiveResponse.hero?.headline) {
                        send('title_generated', { title: interpretiveResponse.hero.headline });
                    }
                    if (interpretiveResponse.hero?.subheadline) {
                        send('subtitle_generated', { subtitle: interpretiveResponse.hero.subheadline });
                    }
                    if (interpretiveResponse.hero?.imageUrl) {
                        send('hero_image_set', { hero: interpretiveResponse.hero });
                    }
                    for (const segment of interpretiveResponse.segments || []) {
                        send('segment_added', { segment });
                    }
                    for (const source of interpretiveResponse.sources || []) {
                        send('source_added', { source });
                    }
                    const imageSegments = (interpretiveResponse.segments || []).filter(s => s.type === 'image');
                    for (const imageSegment of imageSegments) {
                        send('image_added', { image: imageSegment });
                    }
                    if (Array.isArray(interpretiveResponse.hero?.imageCandidates)) {
                        for (const imageCandidate of interpretiveResponse.hero.imageCandidates) {
                            send('image_added', { image: imageCandidate });
                        }
                    }
                    const imageCount = imageSegments.length + (interpretiveResponse.hero?.imageCandidates?.length || 0);
                    send('metadata_update', {
                        metadata: {
                            segmentCount: interpretiveResponse.segments?.length || 0,
                            sourceCount: interpretiveResponse.sources?.length || 0,
                            imageCount,
                            processingTimeMs: interpretiveResponse.metadata.processingTimeMs
                        }
                    });
                    const enrichmentDefs = [
                        {
                            key: 'cultural',
                            searchSettings: { include_domains: ['*.museum', '*.gallery', '*.art', 'cosmos.co', 'www.metmuseum.org'] }
                        },
                        {
                            key: 'social',
                            searchSettings: { include_domains: ['*.substack.com', 'www.reddit.com', 'www.threads.net', 'www.tumblr.com'] }
                        },
                        {
                            key: 'visual',
                            searchSettings: { include_domains: ['cosmos.co', '*.gallery', 'www.metmuseum.org', 'www.moma.org', 'www.wikiart.org'] }
                        },
                    ];
                    for (const def of enrichmentDefs) {
                        send('enrichment_start', { key: def.key });
                        try {
                            const enrichPrompt = prompt_generator_service_1.promptGeneratorService.generateEnrichmentPrompt(def.key, query, entities);
                            const resp = await groq_service_1.groqService.executeSearch(enrichPrompt, { searchSettings: def.searchSettings });
                            const parsed = response_parser_service_1.responseParserService.parseEnrichmentResponse(resp.content);
                            let newSourcesCount = 0;
                            let newSegmentsCount = 0;
                            const localToGlobal = new Map();
                            parsed.sources.forEach((s, idx) => {
                                const exIndex = interpretiveResponse.sources.findIndex((e) => e.url === s.url);
                                if (exIndex >= 0) {
                                    localToGlobal.set(idx + 1, exIndex + 1);
                                }
                                else {
                                    const newSource = { ...s, index: interpretiveResponse.sources.length + 1 };
                                    interpretiveResponse.sources.push(newSource);
                                    localToGlobal.set(idx + 1, interpretiveResponse.sources.length);
                                    send('source_added', { source: newSource });
                                    newSourcesCount++;
                                }
                            });
                            parsed.segments.forEach((seg) => {
                                if (seg.type === 'context' && Array.isArray(seg.sourceIndices)) {
                                    seg.sourceIndices = seg.sourceIndices.map((i) => localToGlobal.get(i) ?? i);
                                }
                                if (seg.type === 'quote' && typeof seg.sourceIndex === 'number') {
                                    seg.sourceIndex = localToGlobal.get(seg.sourceIndex) ?? seg.sourceIndex;
                                }
                                interpretiveResponse.segments.push(seg);
                                send('segment_added', { segment: seg });
                                newSegmentsCount++;
                                if (seg.type === 'image') {
                                    send('image_added', { image: seg });
                                }
                            });
                            if (Array.isArray(parsed.imageCandidates)) {
                                for (const imageCandidate of parsed.imageCandidates) {
                                    send('image_added', { image: imageCandidate });
                                }
                            }
                            send('enrichment_complete', { key: def.key, segmentsAdded: newSegmentsCount, sourcesAdded: newSourcesCount });
                        }
                        catch (enrichErr) {
                            send('enrichment_error', { key: def.key, message: enrichErr?.message || 'enrichment failed' });
                        }
                    }
                    interpretiveResponse.sources = interpretiveResponse.sources
                        .filter((s, i, self) => self.findIndex((x) => x.url === s.url) === i)
                        .map((s, i) => ({ ...s, index: i + 1 }));
                    interpretiveResponse.metadata.segmentCount = interpretiveResponse.segments.length;
                    interpretiveResponse.metadata.sourceCount = interpretiveResponse.sources.length;
                    if (enableArtifacts) {
                        const lower = query.toLowerCase();
                        const should = ['write code', 'generate script', 'create function', 'analyze data', 'visualize', 'plot', 'chart', 'calculate']
                            .some(k => lower.includes(k));
                        if (should) {
                            const artifact = await artifact_generator_service_1.artifactGeneratorService.generateCodeArtifact({
                                prompt: query,
                                language: 'python',
                                context: interpretiveResponse,
                            });
                            interpretiveResponse.artifact = artifact;
                            send('artifact_generated', { hasArtifact: true, artifact });
                        }
                    }
                    const finalImageCount = (interpretiveResponse.segments || []).filter(s => s.type === 'image').length +
                        (interpretiveResponse.hero?.imageCandidates?.length || 0);
                    send('metadata_update', {
                        metadata: {
                            segmentCount: interpretiveResponse.metadata.segmentCount,
                            sourceCount: interpretiveResponse.metadata.sourceCount,
                            imageCount: finalImageCount,
                            processingTimeMs: Date.now() - startTime,
                            groqModel: interpretiveResponse.metadata.groqModel,
                            groqTokens: interpretiveResponse.metadata.groqTokens
                        }
                    });
                    send('complete', {
                        requestId,
                        status: 'complete',
                        responseId: interpretiveResponse.id,
                        timestamp: interpretiveResponse.timestamp
                    });
                }
                catch (err) {
                    send('error', { requestId, status: 'error', message: err?.message || 'Unknown error' });
                }
                return;
            }
            if (data.type === 'interpret') {
                const { query, sessionId: incomingSessionId, documentIds, enableArtifacts, searchSettings } = data.content || {};
                const wsMessageId = (0, uuid_1.v4)();
                const sessionIdForWS = incomingSessionId || (0, uuid_1.v4)();
                streamManager.sendChunk(sessionIdForWS, { type: 'interpret_started', messageId: wsMessageId });
                try {
                    const sessionCtx = incomingSessionId ? await sessionState.getItem(incomingSessionId) : null;
                    let documentContext = [];
                    if (Array.isArray(documentIds) && documentIds.length > 0) {
                        documentContext = await document_service_1.documentService.getDocuments(documentIds);
                    }
                    const { mode, entities } = await router_service_1.routerService.detectIntent(query);
                    const groqPrompt = prompt_generator_service_1.promptGeneratorService.generatePrompt(mode, query, entities, {
                        sessionContext: null,
                        documentContext,
                        enableArtifacts,
                    });
                    const groqResponse = await groq_service_1.groqService.executeSearch(groqPrompt, { searchSettings });
                    const interpretiveResponse = response_parser_service_1.responseParserService.parseGroqResponse(groqResponse.content, mode, groqResponse);
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'hero', data: interpretiveResponse.hero } });
                    for (const seg of interpretiveResponse.segments) {
                        streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'segment', data: seg } });
                    }
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'sources', data: interpretiveResponse.sources } });
                    if (enableArtifacts) {
                        const should = (() => {
                            const q = String(query || '').toLowerCase();
                            return ['generate', 'script', 'analyze', 'visualize', 'plot', 'chart', 'calculate'].some(k => q.includes(k));
                        })();
                        if (should) {
                            const artifact = await artifact_generator_service_1.artifactGeneratorService.generateCodeArtifact({
                                prompt: query,
                                language: 'python',
                                context: interpretiveResponse,
                            });
                            interpretiveResponse.artifact = artifact;
                            streamManager.sendChunk(sessionIdForWS, { type: 'interpret_segment', messageId: wsMessageId, content: { kind: 'artifact', data: artifact } });
                        }
                    }
                    streamManager.sendChunk(sessionIdForWS, { type: 'interpret_complete', messageId: wsMessageId, content: interpretiveResponse, isFinal: true });
                }
                catch (err) {
                    streamManager.sendChunk(sessionIdForWS, { type: 'error', messageId: wsMessageId, content: { code: 'INTERPRET_ERROR', message: err?.message || 'Unknown error' }, isFinal: true });
                }
                return;
            }
        }
        catch (error) {
            logger.error('Fatal error in WebSocket handler', { error: error.message, stack: error.stack, sessionId });
            if (ws.readyState === ws.OPEN) {
                streamManager.sendChunk(sessionId, { type: 'error', content: `Server Error: ${error.message}` });
            }
        }
    });
    ws.on('close', async () => {
        logger.info('Client disconnected', { sessionId });
        const state = (await sessionState.getItem(sessionId));
        if (state?.userId) {
            await sessionRegistry.unregisterUserSession(state.userId, sessionId);
            logger.info('Session unregistered from registry', { userId: state.userId, sessionId });
        }
        streamManager.removeConnection(sessionId);
        await sessionState.removeItem(sessionId);
    });
});
const PORT = process.env.PORT || 8080;
setInterval(() => {
    const memUsage = process.memoryUsage();
    const { memoryUsageBytes } = require('./monitoring/metrics');
    if (memoryUsageBytes && typeof memoryUsageBytes.set === 'function') {
        memoryUsageBytes.set({ type: 'heapUsed' }, memUsage.heapUsed);
        memoryUsageBytes.set({ type: 'heapTotal' }, memUsage.heapTotal);
        memoryUsageBytes.set({ type: 'external' }, memUsage.external);
        memoryUsageBytes.set({ type: 'rss' }, memUsage.rss);
    }
    if (metrics_1.uptime && typeof metrics_1.uptime.set === 'function') {
        metrics_1.uptime.set(process.uptime());
    }
}, 30000);
server.listen(PORT, () => console.log(`🚀 Server is listening on port ${PORT}`));
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});
