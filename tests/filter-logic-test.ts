/**
 * Test suite for enhanced filtering capabilities
 * Tests logic expressions, offset pagination, field projection, and between operator
 */

import winston from 'winston';
import { ToolOrchestrator } from '../src/services/tool/ToolOrchestrator';
import { NangoService } from '../src/services/NangoService';
import { ToolConfigManager } from '../src/services/tool/ToolConfigManager';

// Create minimal dependencies for ToolOrchestrator
const logger = winston.createLogger({
    level: 'error',
    silent: true,
    transports: []
});

const mockNangoService = {} as NangoService;
const mockToolConfigManager = {} as ToolConfigManager;

// Create a test orchestrator instance
function createTestOrchestrator() {
    return new ToolOrchestrator({
        logger,
        nangoService: mockNangoService,
        toolConfigManager: mockToolConfigManager
    });
}

// Mock data representing Salesforce Leads
const mockLeads = [
    { Id: '001', FirstName: 'John', LastName: 'Doe', Email: 'john@example.com', Company: 'TechCorp', Rating: 'Hot', LeadSource: 'Web', Status: 'Open', CreatedDate: '2026-01-15T10:00:00Z' },
    { Id: '002', FirstName: 'Jane', LastName: 'Smith', Email: 'jane@example.com', Company: 'WebInc', Rating: 'Warm', LeadSource: 'Referral', Status: 'Working', CreatedDate: '2026-01-16T11:00:00Z' },
    { Id: '003', FirstName: 'Bob', LastName: 'Johnson', Email: 'bob@example.com', Company: 'DataSys', Rating: 'Hot', LeadSource: 'Web', Status: 'Qualified', CreatedDate: '2026-01-17T12:00:00Z' },
    { Id: '004', FirstName: 'Alice', LastName: 'Williams', Email: 'alice@example.com', Company: 'CloudNet', Rating: 'Cold', LeadSource: 'Cold Call', Status: 'Open', CreatedDate: '2026-01-18T13:00:00Z' },
    { Id: '005', FirstName: 'Charlie', LastName: 'Brown', Email: 'charlie@example.com', Company: 'WebTech', Rating: 'Warm', LeadSource: 'Web', Status: 'Working', CreatedDate: '2026-01-19T14:00:00Z' },
];

// Test 1: Complex logic expression "(1 OR 2) AND 3"
// Should find leads that are (Hot OR Warm) AND from Web
async function testComplexLogic() {
    console.log('\n=== TEST 1: Complex Logic Expression ===');
    console.log('Query: (Rating = Hot OR Rating = Warm) AND LeadSource = Web\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            logic: '(1 OR 2) AND 3',
            conditions: [
                { field: 'Rating', operator: 'equals', value: 'Hot' },      // Condition 1
                { field: 'Rating', operator: 'equals', value: 'Warm' },     // Condition 2
                { field: 'LeadSource', operator: 'equals', value: 'Web' }   // Condition 3
            ]
        }
    };

    // Mock the private applyFilters method access
    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads found`);
    filtered.forEach((lead: any) => {
        console.log(`  - ${lead.FirstName} ${lead.LastName} (Rating: ${lead.Rating}, Source: ${lead.LeadSource})`);
    });
    console.log('\nExpected: John Doe (Hot, Web), Bob Johnson (Hot, Web), Charlie Brown (Warm, Web)');
    console.log(`✓ Test ${filtered.length === 3 ? 'PASSED' : 'FAILED'}`);
}

// Test 2: Offset pagination
// Should skip first 2 records and return next 2
async function testOffsetPagination() {
    console.log('\n=== TEST 2: Offset Pagination ===');
    console.log('Query: All leads, skip first 2, return 2 records\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            orderBy: [{ field: 'CreatedDate', direction: 'ASC' }],
            offset: 2,
            limit: 2
        }
    };

    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads (offset=2, limit=2)`);
    filtered.forEach((lead: any) => {
        console.log(`  - ${lead.FirstName} ${lead.LastName} (Created: ${lead.CreatedDate})`);
    });
    console.log('\nExpected: Bob Johnson, Alice Williams (records 3-4)');
    console.log(`✓ Test ${filtered.length === 2 && filtered[0].Id === '003' ? 'PASSED' : 'FAILED'}`);
}

// Test 3: Field projection (includeFields)
// Should return only specified fields
async function testFieldProjection() {
    console.log('\n=== TEST 3: Field Projection (includeFields) ===');
    console.log('Query: Return only Id, FirstName, LastName, Email fields\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            includeFields: ['Id', 'FirstName', 'LastName', 'Email'],
            limit: 2
        }
    };

    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads`);
    filtered.forEach((lead: any) => {
        const fields = Object.keys(lead);
        console.log(`  - ${lead.FirstName} ${lead.LastName}: Fields: ${fields.join(', ')}`);
        console.log(`    Has Company? ${lead.Company ? 'YES (UNEXPECTED)' : 'NO (CORRECT)'}`);
    });
    console.log('\nExpected: Only Id, FirstName, LastName, Email fields present');
    const allFieldsCorrect = filtered.every((lead: any) => {
        const fields = Object.keys(lead);
        return fields.length === 4 && fields.includes('Id') && fields.includes('Email') && !fields.includes('Company');
    });
    console.log(`✓ Test ${allFieldsCorrect ? 'PASSED' : 'FAILED'}`);
}

// Test 4: Between operator (already implemented, testing it)
// Should find leads created between two dates
async function testBetweenOperator() {
    console.log('\n=== TEST 4: Between Operator ===');
    console.log('Query: CreatedDate BETWEEN 2026-01-16 AND 2026-01-18\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            conditions: [
                { 
                    field: 'CreatedDate', 
                    operator: 'between', 
                    values: ['2026-01-16T00:00:00Z', '2026-01-18T23:59:59Z'] 
                }
            ]
        }
    };

    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads`);
    filtered.forEach((lead: any) => {
        console.log(`  - ${lead.FirstName} ${lead.LastName} (Created: ${lead.CreatedDate})`);
    });
    console.log('\nExpected: Jane Smith (Jan 16), Bob Johnson (Jan 17), Alice Williams (Jan 18)');
    console.log(`✓ Test ${filtered.length === 3 ? 'PASSED' : 'FAILED'}`);
}

// Test 5: Complex nested logic "1 AND (2 OR (3 AND 4))"
// Should demonstrate deep nesting capabilities
async function testNestedLogic() {
    console.log('\n=== TEST 5: Nested Logic Expression ===');
    console.log('Query: Status = Working AND (Rating = Hot OR (LeadSource = Web AND Rating = Warm))\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            logic: '1 AND (2 OR (3 AND 4))',
            conditions: [
                { field: 'Status', operator: 'equals', value: 'Working' },      // 1
                { field: 'Rating', operator: 'equals', value: 'Hot' },          // 2
                { field: 'LeadSource', operator: 'equals', value: 'Web' },      // 3
                { field: 'Rating', operator: 'equals', value: 'Warm' }          // 4
            ]
        }
    };

    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads`);
    filtered.forEach((lead: any) => {
        console.log(`  - ${lead.FirstName} ${lead.LastName} (Status: ${lead.Status}, Rating: ${lead.Rating}, Source: ${lead.LeadSource})`);
    });
    console.log('\nExpected: Charlie Brown (Working + Warm + Web)');
    console.log(`✓ Test ${filtered.length === 1 && filtered[0].FirstName === 'Charlie' ? 'PASSED' : 'FAILED'}`);
}

// Test 6: Exclude fields
// Should return all fields except specified ones
async function testExcludeFields() {
    console.log('\n=== TEST 6: Field Projection (excludeFields) ===');
    console.log('Query: Exclude Company, Rating, Status fields\n');
    
    const args = {
        operation: 'fetch',
        entityType: 'Lead',
        filters: {
            excludeFields: ['Company', 'Rating', 'Status'],
            limit: 2
        }
    };

    const orchestrator = createTestOrchestrator();
    const filtered = (orchestrator as any).applyFilters(mockLeads, args, 'salesforce-ybzg', 'fetch_entity');
    
    console.log(`Results: ${filtered.length} leads`);
    filtered.forEach((lead: any) => {
        const fields = Object.keys(lead);
        console.log(`  - ${lead.FirstName} ${lead.LastName}: ${fields.length} fields`);
        console.log(`    Excluded fields present? ${lead.Company || lead.Rating || lead.Status ? 'YES (FAILED)' : 'NO (CORRECT)'}`);
    });
    console.log('\nExpected: All fields except Company, Rating, Status');
    const noExcludedFields = filtered.every((lead: any) => 
        !('Company' in lead) && !('Rating' in lead) && !('Status' in lead)
    );
    console.log(`✓ Test ${noExcludedFields ? 'PASSED' : 'FAILED'}`);
}

// Run all tests
async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ENHANCED FILTER CAPABILITIES TEST SUITE                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    await testComplexLogic();
    await testOffsetPagination();
    await testFieldProjection();
    await testBetweenOperator();
    await testNestedLogic();
    await testExcludeFields();
    
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     ALL TESTS COMPLETED                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Execute tests
runAllTests().catch(console.error);
