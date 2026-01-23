// =============================================================================
// cortex/test-compiler.ts — Test intent-first compilation
// =============================================================================

import { Compiler } from './compiler';
import { Unit } from './types';

async function testCompiler() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable not set');
  }

  const compiler = new Compiler(apiKey);
  const userId = 'test-user-123';

  const testCases = [
    {
      name: 'Big deal alerts',
      input: { when: 'a new deal lands in Salesforce and it\'s over $5k', then: 'remind me to review it and prep a summary' },
    },
    {
      name: 'Lead follow-up sequence',
      input: { when: 'a lead hasn\'t replied in 48 hours', then: 'follow up with a softer message' },
    },
    {
      name: 'Upset customer alerts',
      input: { when: 'I receive an email', if: 'the sender sounds upset or confused', then: 'notify me on Slack' },
    },
    {
      name: 'Stalled deal rescue',
      input: { when: 'a deal stage changes to stalled', then: 'send me a summary and draft a re-engagement email' },
    },
  ];

  console.log('🚀 Testing Intent-First Compiler\n');

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✨ Test: ${testCase.name}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`📝 Input: "${testCase.input}"\n`);

    try {
      const unit: Unit = await compiler.compile(testCase.input, userId);

      console.log(`✅ Compiled Successfully!\n`);
      console.log(`📋 Unit Details:`);
      console.log(`   ID: ${unit.id}`);
      console.log(`   Name: ${unit.name}`);
      console.log(`   Status: ${unit.status}\n`);

      console.log(`🎯 Trigger:`);
      console.log(`   Type: ${unit.when.type}`);
      if (unit.when.type === 'event') {
        console.log(`   Source: ${(unit.when as any).source}`);
        console.log(`   Event: ${(unit.when as any).event}`);
        if ((unit.when as any).filter) {
          console.log(`   Filter: ${(unit.when as any).filter}`);
        }
      } else if (unit.when.type === 'schedule') {
        console.log(`   Cron: ${(unit.when as any).cron}`);
      }

      if (unit.if.length > 0) {
        console.log(`\n📋 Conditions (${unit.if.length}):`);
        unit.if.forEach((cond: any, i: number) => {
          if (cond.type === 'eval') {
            console.log(`   ${i + 1}. Eval: ${cond.expr}`);
          } else if (cond.type === 'semantic') {
            console.log(`   ${i + 1}. Semantic (${cond.prompt}): expect "${cond.expect}"`);
          }
        });
      }

      console.log(`\n⚡ Actions (${unit.then.length}):`);
      unit.then.forEach((action: any, i: number) => {
        console.log(`   ${i + 1}. ${action.type}${action.prompt ? ` (${action.prompt})` : ''}${action.store_as ? ` → ${action.store_as}` : ''}`);
        if (action.type === 'wait') {
          console.log(`      Duration: ${action.duration}`);
        } else if (action.type === 'notify') {
          console.log(`      Message: ${action.message.substring(0, 50)}...`);
        }
      });
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🎉 Test Complete\n');
}

// Run if this is the main module
if (require.main === module) {
  testCompiler().catch(console.error);
}

export { testCompiler };
