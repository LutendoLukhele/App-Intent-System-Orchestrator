import { ToolOrchestrator } from './src/services/tool/ToolOrchestrator';

// Test that resolveModel now handles both arg structures
class TestResolveModel {
    // Mock the resolveModel method logic (copied from ToolOrchestrator)
    private resolveModel(toolName: string, toolConfig: any, args: any): string | null {
        // First check if tool config has explicit cache_model
        if (toolConfig?.cache_model) {
            return toolConfig.cache_model;
        }

        // Extract entityType from args (could be at args.entityType or args.input.entityType)
        const entityType = args.entityType || args.input?.entityType;

        // For Salesforce entity tools, derive from entityType
        if (toolName === 'fetch_entity' && entityType) {
            const entityTypeMap: Record<string, string> = {
                'Lead': 'SalesforceLead',
                'Contact': 'SalesforceContact',
                'Account': 'SalesforceAccount',
                'Deal': 'SalesforceOpportunity',
                'Opportunity': 'SalesforceOpportunity',
                'Case': 'SalesforceCase',
                'Article': 'SalesforceArticle',
            };
            return entityTypeMap[entityType] || null;
        }

        // Default mappings for common tools
        const defaultModels: Record<string, string> = {
            'fetch_emails': 'GmailThread',
            'fetch_calendar_events': 'CalendarEvent',
            'fetch_notion_page': 'NotionPage',
        };

        return defaultModels[toolName] || null;
    }

    test() {
        console.log('Testing resolveModel with different argument structures...\n');

        // Test 1: Old structure (if used)
        const args1 = { entityType: 'Account', filters: { conditions: [] } };
        const result1 = this.resolveModel('fetch_entity', {}, args1);
        console.log('Test 1 - Direct entityType:');
        console.log(`  Input: ${JSON.stringify(args1)}`);
        console.log(`  Result: ${result1}`);
        console.log(`  ✅ PASS: ${result1 === 'SalesforceAccount'}\n`);

        // Test 2: New structure (input nested)
        const args2 = { input: { entityType: 'Account', filters: { conditions: [] }, operation: 'fetch' } };
        const result2 = this.resolveModel('fetch_entity', {}, args2);
        console.log('Test 2 - Nested input.entityType:');
        console.log(`  Input: ${JSON.stringify(args2)}`);
        console.log(`  Result: ${result2}`);
        console.log(`  ✅ PASS: ${result2 === 'SalesforceAccount'}\n`);

        // Test 3: Different entity type
        const args3 = { input: { entityType: 'Contact', filters: { conditions: [] }, operation: 'fetch' } };
        const result3 = this.resolveModel('fetch_entity', {}, args3);
        console.log('Test 3 - Different entity type (Contact):');
        console.log(`  Input: ${JSON.stringify(args3)}`);
        console.log(`  Result: ${result3}`);
        console.log(`  ✅ PASS: ${result3 === 'SalesforceContact'}\n`);

        // Test 4: Lead entity
        const args4 = { input: { entityType: 'Lead' } };
        const result4 = this.resolveModel('fetch_entity', {}, args4);
        console.log('Test 4 - Lead entity:');
        console.log(`  Input: ${JSON.stringify(args4)}`);
        console.log(`  Result: ${result4}`);
        console.log(`  ✅ PASS: ${result4 === 'SalesforceLead'}\n`);

        // Test 5: Gmail (non-Salesforce)
        const args5 = {};
        const result5 = this.resolveModel('fetch_emails', {}, args5);
        console.log('Test 5 - Gmail tool:');
        console.log(`  Input: ${JSON.stringify(args5)}`);
        console.log(`  Result: ${result5}`);
        console.log(`  ✅ PASS: ${result5 === 'GmailThread'}\n`);

        console.log('All tests completed!');
    }
}

const tester = new TestResolveModel();
tester.test();
