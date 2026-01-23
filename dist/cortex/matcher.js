"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Matcher = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
class Matcher {
    constructor(store, groqApiKey) {
        this.store = store;
        this.groq = new groq_sdk_1.default({ apiKey: groqApiKey });
    }
    async match(event) {
        const units = await this.store.getUnitsByTrigger(event.source, event.event);
        if (units.length === 0)
            return [];
        const runs = [];
        for (const unit of units) {
            if (unit.status !== 'active')
                continue;
            const pass = await this.evaluate(unit, event);
            if (pass) {
                const run = this.createRun(unit, event);
                await this.store.saveRun(run, event.payload);
                runs.push(run);
            }
        }
        return runs;
    }
    async evaluate(unit, event) {
        if (unit.when.type === 'event' && unit.when.filter) {
            if (!this.evalExpr(unit.when.filter, event.payload)) {
                return false;
            }
        }
        for (const cond of unit.if) {
            const pass = await this.evalCondition(cond, event);
            if (!pass)
                return false;
        }
        return true;
    }
    evalExpr(expr, payload) {
        try {
            const fn = new Function('payload', `"use strict"; try { return Boolean(${expr}); } catch { return false; }`);
            return fn(payload);
        }
        catch {
            return false;
        }
    }
    async evalCondition(cond, event) {
        switch (cond.type) {
            case 'eval':
                return this.evalExpr(cond.expr, event.payload);
            case 'semantic':
                return this.evalSemantic(cond, event);
            default:
                return true;
        }
    }
    async evalSemantic(cond, event) {
        const inputTemplate = cond.input || '{{payload.body_text}}';
        const input = this.resolveTemplate(inputTemplate, { payload: event.payload });
        const prompts = {
            detect_urgency: 'Is this message urgent? Reply with only "urgent" or "normal".',
            detect_sentiment: 'What is the sentiment? Reply with only "positive", "negative", or "neutral".',
            is_question: 'Is this a question? Reply with only "yes" or "no".',
            is_request: 'Is this a request for action? Reply with only "yes" or "no".',
        };
        const promptKey = cond.prompt || 'custom';
        const systemPrompt = prompts[promptKey] || cond.prompt || 'Classify this. Reply with one word only.';
        const response = await this.groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: input.slice(0, 2000) },
            ],
            temperature: 0,
            max_tokens: 10,
        });
        const result = response.choices[0]?.message?.content?.trim().toLowerCase() || '';
        const expected = Array.isArray(cond.expect) ? cond.expect : [cond.expect];
        return expected.some(e => result.includes(e.toLowerCase()));
    }
    resolveTemplate(template, ctx) {
        return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
            const parts = path.split('.');
            let val = ctx;
            for (const p of parts)
                val = val?.[p];
            return typeof val === 'string' ? val : JSON.stringify(val) || '';
        });
    }
    createRun(unit, event) {
        return {
            id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            unit_id: unit.id,
            event_id: event.id,
            user_id: event.user_id,
            status: 'pending',
            step: 0,
            context: { payload: event.payload },
            started_at: new Date().toISOString(),
        };
    }
}
exports.Matcher = Matcher;
