import { ToolConfig, ToolConfigManager } from './ToolConfigManager';
import { NeonQueryFunction } from '@neondatabase/serverless';
import { UserToolCacheService } from './UserToolCacheService';
import { getCanonicalProviderChain } from './providerAliases';
import { IToolFilter, ToolAvailability } from '@aso/interfaces';

/**
 * Service for filtering tools based on user's actual provider configurations
 * This reduces token usage by only including tools the user can actually execute
 * Now with Redis caching for improved performance
 * 
 * Implements IToolFilter interface for ASO decoupling
 */
export class ProviderAwareToolFilter implements IToolFilter {
  constructor(
    private toolConfigManager: ToolConfigManager,
    private sql: NeonQueryFunction<false, false>,
    private cacheService?: UserToolCacheService
  ) {}

  /**
   * Gets only tools that the user can actually execute
   * based on their configured providers in the database
   * Now with Redis caching for improved performance
   *
   * @param userId - The user's ID to check provider configurations for
   * @returns Array of tools that have active provider connections
   */
  async getAvailableToolsForUser(userId: string): Promise<ToolConfig[]> {
    try {
      // Check cache first if cache service is available
      if (this.cacheService) {
        const cachedTools = await this.cacheService.getCachedAvailableTools(userId);
        if (cachedTools) {
          console.log(`[ProviderAwareToolFilter] Using cached tools for user ${userId}`);
          return cachedTools;
        }
      }

      // Cache miss or no cache service - query database
      console.log(`[ProviderAwareToolFilter] Fetching tools from database for user ${userId}`);

      // Query database for user's active providers
      const userProviders = await this.sql`
        SELECT DISTINCT provider
        FROM connections
        WHERE user_id = ${userId}
      `;

      const activeProviders = new Set<string>();
      userProviders.forEach(row => {
        const providerKey = row.provider as string;
        getCanonicalProviderChain(providerKey).forEach(key => activeProviders.add(key));
      });

      // Get all tools from ToolConfigManager
      const allTools = this.toolConfigManager.getAllTools();

      // Filter to only tools whose providers are active
      const availableTools = allTools.filter(tool => {
        if (!tool.providerConfigKey) return false;

        const normalizedToolKey = tool.providerConfigKey.trim().toLowerCase();
        return activeProviders.has(normalizedToolKey);
      });

      console.log(`[ProviderAwareToolFilter] User ${userId} has ${activeProviders.size} active providers`);
      console.log(`[ProviderAwareToolFilter] Filtered ${allTools.length} tools down to ${availableTools.length} available tools`);

      // Cache the result if cache service is available
      if (this.cacheService) {
        await this.cacheService.setCachedAvailableTools(userId, availableTools);
      }

      return availableTools;
    } catch (error) {
      console.error('[ProviderAwareToolFilter] Error getting available tools:', error);
      // Fallback to empty array on error to prevent showing unavailable tools
      return [];
    }
  }

  /**
   * Gets tools filtered by both categories and user's active providers
   * This is the main method to use for category-based tool selection
   *
   * @param userId - The user's ID to check provider configurations for
   * @param categories - Array of category names to filter by (e.g., ['Email', 'Calendar'])
   * @returns Array of tools matching the categories that the user can execute
   */
  async getToolsByCategoriesForUser(
    userId: string,
    categories: string[]
  ): Promise<ToolConfig[]> {
    // First get only tools the user has providers for
    const availableTools = await this.getAvailableToolsForUser(userId);

    // Then filter by requested categories
    const filteredTools = availableTools.filter(tool =>
      categories.includes(tool.category)
    );

    console.log(`[ProviderAwareToolFilter] Filtered to ${filteredTools.length} tools for categories: ${categories.join(', ')}`);

    return filteredTools;
  }

  /**
   * Gets the list of active providers for a user
   * Useful for debugging and understanding what providers are available
   *
   * @param userId - The user's ID
   * @returns Set of active provider keys
   */
  async getActiveProvidersForUser(userId: string): Promise<Set<string>> {
    try {
      const userProviders = await this.sql`
        SELECT DISTINCT provider
        FROM connections
        WHERE user_id = ${userId}
      `;

      const providers = new Set<string>();
      userProviders.forEach(row => {
        const providerKey = row.provider as string;
        getCanonicalProviderChain(providerKey).forEach(key => providers.add(key));
      });

      return providers;
    } catch (error) {
      console.error('[ProviderAwareToolFilter] Error getting active providers:', error);
      return new Set();
    }
  }

  /**
   * Checks if a specific tool is available for a user
   *
   * @param userId - The user's ID
   * @param toolName - The name of the tool to check
   * @returns True if the tool is available, false otherwise
   */
  async isToolAvailableForUser(userId: string, toolName: string): Promise<boolean> {
    const availableTools = await this.getAvailableToolsForUser(userId);
    return availableTools.some(tool => tool.name === toolName);
  }

  /**
   * Generates a human-readable summary of user's available integrations
   * for inclusion in LLM system prompts
   *
   * @param userId - The user's ID
   * @returns Formatted string describing available providers and their capabilities
   */
  async getProviderContextForPrompt(userId: string): Promise<string> {
    try {
      const activeProviders = await this.getActiveProvidersForUser(userId);

      if (activeProviders.size === 0) {
        return "No integrations configured. User cannot use any tools requiring external services.";
      }

      // Map provider keys to friendly names and capabilities
        const SALESFORCE_ALIASES = ['salesforce-ybzg', 'salesforce-2', 'salesforce'];
        const providerDescriptions: Record<string, string> = {
          'google-mail': '✓ Gmail - Email operations (fetch, send)',
          'google-mail-ynxw': '✓ Gmail - Email operations (fetch, send)',
          'google-calendar': '✓ Google Calendar - Calendar events (fetch, create, update)',
          'outlook': '✓ Microsoft Outlook - Email, calendar events, and contacts',
          'salesforce-ybzg': '✓ Salesforce - CRM operations (accounts, contacts, leads, deals, cases)',
          'notion': '✓ Notion - Page and database operations',
        };

      const descriptions: string[] = [];
      const providerArray = Array.from(activeProviders).sort();

      for (const provider of providerArray) {
        const description = providerDescriptions[provider];
        if (description) {
          descriptions.push(description);
        } else {
          descriptions.push(`✓ ${provider} - Integration available`);
        }
      }

      // Add guidance based on what's available
      let guidance = '\n\nIMPORTANT TOOL SELECTION RULES:\n';

      // Calendar-specific guidance
      const hasGoogleCalendar = activeProviders.has('google-calendar');
      const hasOutlook = activeProviders.has('outlook');

      if (hasGoogleCalendar && hasOutlook) {
        guidance += '- For CALENDAR operations: User has both Google Calendar and Outlook. Ask which one to use, or default to Google Calendar.\n';
      } else if (hasGoogleCalendar) {
        guidance += '- For CALENDAR operations: Use Google Calendar tools only (fetch_calendar_events, create_calendar_event, update_calendar_event).\n';
      } else if (hasOutlook) {
        guidance += '- For CALENDAR operations: Use Outlook tools only (create_outlook_entity, fetch_outlook_entity with entityType="Event").\n';
      }

      // Email-specific guidance
      const hasGmail = activeProviders.has('google-mail') || activeProviders.has('google-mail-ynxw');
      if (hasGmail && hasOutlook) {
        guidance += '- For EMAIL operations: User has both Gmail and Outlook. Ask which one to use, or default to Gmail.\n';
      } else if (hasGmail) {
        guidance += '- For EMAIL operations: Use Gmail tools only (fetch_emails, send_email).\n';
      } else if (hasOutlook) {
        guidance += '- For EMAIL operations: Use Outlook tools only (create_outlook_entity, fetch_outlook_entity with entityType="Message").\n';
      }

        const hasSalesforce = SALESFORCE_ALIASES.some(alias => activeProviders.has(alias));
        if (hasSalesforce) {
          guidance += '- For CRM operations: Use Salesforce tools (fetch_entity, create_entity, update_entity).\n';
      }

      // Notion guidance
      if (activeProviders.has('notion')) {
        guidance += '- For NOTE/DOCUMENT operations: Use Notion tools (fetch_notion_page, create_notion_page, update_notion_page).\n';
      }

      return `USER'S CONFIGURED INTEGRATIONS:\n${descriptions.join('\n')}${guidance}`;

    } catch (error) {
      console.error('[ProviderAwareToolFilter] Error getting provider context:', error);
      return "Unable to determine user's integrations. Proceed with caution.";
    }
  }

  // ============================================================
  // IToolFilter Interface Implementation
  // ============================================================

  /**
   * Check if a specific tool is available for user (IToolFilter interface)
   * Returns full ToolAvailability object
   */
  async isToolAvailable(userId: string, toolName: string): Promise<ToolAvailability> {
    const availableTools = await this.getAvailableToolsForUser(userId);
    const isAvailable = availableTools.some(tool => tool.name === toolName);
    const toolDef = this.toolConfigManager.getToolDefinition(toolName);
    
    if (!toolDef) {
      return {
        tool: { name: toolName, description: 'Unknown tool', category: 'Unknown' },
        available: false,
        reason: 'Tool not found in configuration'
      };
    }

    return {
      tool: toolDef,
      available: isAvailable,
      reason: isAvailable 
        ? undefined 
        : toolDef.providerConfigKey 
          ? `Provider '${toolDef.providerConfigKey}' not connected`
          : 'No provider configured for this tool'
    };
  }

  /**
   * Get all tools with availability status (IToolFilter interface)
   */
  async getAllToolsWithAvailability(userId: string): Promise<ToolAvailability[]> {
    const allTools = this.toolConfigManager.getAllTools();
    const availableTools = await this.getAvailableToolsForUser(userId);
    const availableNames = new Set(availableTools.map(t => t.name));

    return allTools.map(tool => ({
      tool,
      available: availableNames.has(tool.name),
      reason: availableNames.has(tool.name) 
        ? undefined 
        : tool.providerConfigKey 
          ? `Provider '${tool.providerConfigKey}' not connected`
          : 'No provider configured for this tool'
    }));
  }

  /**
   * Get set of connected providers (IToolFilter interface)
   */
  async getConnectedProviders(userId: string): Promise<Set<string>> {
    return this.getActiveProvidersForUser(userId);
  }

  /**
   * Invalidate cache for user (IToolFilter interface)
   */
  async invalidateCache(userId: string): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.invalidateUserToolCache(userId);
      console.log(`[ProviderAwareToolFilter] Cache invalidated for user ${userId}`);
    }
  }
}