/**
 * Adapters - Implementation Bridges for External Services
 * 
 * This module provides adapter implementations that bridge ASO's
 * internal interfaces to external vendor SDKs and APIs.
 * 
 * ## Architecture
 * 
 * ```
 * ┌─────────────────────┐
 * │   ASO Core Services │
 * └──────────┬──────────┘
 *            │ uses interfaces
 *            ▼
 * ┌─────────────────────┐
 * │     Interfaces      │
 * │ ILLMClient, etc.    │
 * └──────────┬──────────┘
 *            │ implemented by
 *            ▼
 * ┌─────────────────────────────┐
 * │         Adapters            │ <-- This module
 * │ GroqLLMClient               │
 * │ NangoProviderAdapter        │
 * │ ProviderGateway (unified)   │
 * └──────────┬──────────────────┘
 *            │ wraps
 *            ▼
 * ┌─────────────────────┐
 * │   External SDKs     │
 * │ Groq SDK, Nango SDK │
 * └─────────────────────┘
 * ```
 * 
 * ## Available Adapters
 * 
 * ### LLM Adapters
 * - `GroqLLMClient` - Groq cloud LLM (default)
 * 
 * ### Provider Adapters
 * - `NangoProviderAdapter` - OAuth/API adapter for single provider
 * - `ProviderGateway` - Unified gateway managing all adapters
 *   - Gmail, Google Calendar
 *   - Salesforce (Leads, Opportunities, etc.)
 *   - Slack, Notion, Outlook
 * 
 * @package @aso/adapters
 */

// LLM Adapters
export * from './llm';

// Provider Adapters (OAuth + API)
export * from './providers';

// Unified Provider Gateway
export * from './ProviderGateway';
