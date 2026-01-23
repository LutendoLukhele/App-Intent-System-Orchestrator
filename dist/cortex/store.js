"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridStore = void 0;
class HybridStore {
    constructor(redis, sql) {
        this.redis = redis;
        this.sql = sql;
    }
    async writeEvent(event) {
        const dedupe = event.meta?.dedupe_key;
        if (dedupe) {
            const exists = await this.redis.exists(`dedupe:${dedupe}`);
            if (exists)
                return false;
            await this.redis.set(`dedupe:${dedupe}`, '1', 'EX', 86400 * 7);
        }
        await this.redis.set(`event:${event.id}`, JSON.stringify(event), 'EX', 86400 * 7);
        await this.redis.publish(`events:${event.user_id}`, JSON.stringify(event));
        return true;
    }
    async getEvent(eventId) {
        const data = await this.redis.get(`event:${eventId}`);
        return data ? JSON.parse(data) : null;
    }
    async saveUnit(unit) {
        await this.sql `
      INSERT INTO units (id, owner_id, name, raw_when, raw_if, raw_then, compiled_when, compiled_if, compiled_then, status, trigger_source, trigger_event, created_at, updated_at)
      VALUES (
        ${unit.id}, ${unit.owner}, ${unit.name},
        ${unit.raw.when}, ${unit.raw.if || null}, ${unit.raw.then},
        ${JSON.stringify(unit.when)}, ${JSON.stringify(unit.if)}, ${JSON.stringify(unit.then)},
        ${unit.status},
        ${unit.when.type === 'event' ? unit.when.source : null},
        ${unit.when.type === 'event' ? unit.when.event : null},
        ${unit.created_at}, ${unit.updated_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        raw_when = EXCLUDED.raw_when, raw_if = EXCLUDED.raw_if, raw_then = EXCLUDED.raw_then,
        compiled_when = EXCLUDED.compiled_when, compiled_if = EXCLUDED.compiled_if, compiled_then = EXCLUDED.compiled_then,
        status = EXCLUDED.status, trigger_source = EXCLUDED.trigger_source, trigger_event = EXCLUDED.trigger_event,
        updated_at = NOW()
    `;
    }
    async getUnit(unitId) {
        const rows = await this.sql `SELECT * FROM units WHERE id = ${unitId}`;
        return rows[0] ? this.rowToUnit(rows[0]) : null;
    }
    async getUnitsByTrigger(source, event) {
        const rows = await this.sql `
      SELECT * FROM units 
      WHERE trigger_source = ${source} AND trigger_event = ${event} AND status = 'active'
    `;
        return rows.map(r => this.rowToUnit(r));
    }
    async getUserUnits(userId) {
        const rows = await this.sql `SELECT * FROM units WHERE owner_id = ${userId} ORDER BY created_at DESC`;
        return rows.map(r => this.rowToUnit(r));
    }
    async updateUnitStatus(unitId, status) {
        await this.sql `UPDATE units SET status = ${status}, updated_at = NOW() WHERE id = ${unitId}`;
    }
    async deleteUnit(unitId) {
        await this.sql `DELETE FROM units WHERE id = ${unitId}`;
    }
    rowToUnit(row) {
        return {
            id: row.id,
            owner: row.owner_id,
            name: row.name,
            raw: { when: row.raw_when, if: row.raw_if, then: row.raw_then },
            when: row.compiled_when,
            if: row.compiled_if || [],
            then: row.compiled_then,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    async saveRun(run, eventPayload) {
        await this.sql `
      INSERT INTO runs (id, unit_id, event_id, user_id, status, current_step, context, started_at, completed_at, resume_at, error, original_event_payload)
      VALUES (${run.id}, ${run.unit_id}, ${run.event_id}, ${run.user_id}, ${run.status}, ${run.step}, ${JSON.stringify(run.context)}, ${run.started_at}, ${run.completed_at || null}, ${run.resume_at || null}, ${run.error || null}, ${eventPayload ? JSON.stringify(eventPayload) : null})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status, current_step = EXCLUDED.current_step, context = EXCLUDED.context,
        completed_at = EXCLUDED.completed_at, resume_at = EXCLUDED.resume_at, error = EXCLUDED.error
    `;
        if (run.status === 'waiting' && run.resume_at) {
            await this.redis.zadd('runs:waiting', Date.parse(run.resume_at), run.id);
        }
        else {
            await this.redis.zrem('runs:waiting', run.id);
        }
    }
    async getRun(runId) {
        const rows = await this.sql `SELECT * FROM runs WHERE id = ${runId}`;
        return rows[0] ? this.rowToRun(rows[0]) : null;
    }
    async getUserRuns(userId, limit = 50) {
        const rows = await this.sql `SELECT * FROM runs WHERE user_id = ${userId} ORDER BY started_at DESC LIMIT ${limit}`;
        return rows.map(r => this.rowToRun(r));
    }
    async getUnitRuns(unitId, limit = 20) {
        const rows = await this.sql `SELECT * FROM runs WHERE unit_id = ${unitId} ORDER BY started_at DESC LIMIT ${limit}`;
        return rows.map(r => this.rowToRun(r));
    }
    async getWaitingRuns(beforeTime) {
        const ids = await this.redis.zrangebyscore('runs:waiting', 0, beforeTime);
        if (ids.length === 0)
            return [];
        const rows = await this.sql `SELECT * FROM runs WHERE id = ANY(${ids})`;
        return rows.map(r => this.rowToRun(r));
    }
    async getRunForRerun(runId) {
        const rows = await this.sql `SELECT * FROM runs WHERE id = ${runId}`;
        if (rows.length === 0)
            return null;
        return { run: this.rowToRun(rows[0]), eventPayload: rows[0].original_event_payload };
    }
    rowToRun(row) {
        return {
            id: row.id,
            unit_id: row.unit_id,
            event_id: row.event_id,
            user_id: row.user_id,
            status: row.status,
            step: row.current_step,
            context: row.context || {},
            started_at: row.started_at,
            completed_at: row.completed_at,
            resume_at: row.resume_at,
            error: row.error,
        };
    }
    async logRunStep(runId, stepIndex, action, status, result, error) {
        await this.sql `
      INSERT INTO run_steps (run_id, step_index, action_type, action_config, status, result, error, started_at, completed_at)
      VALUES (${runId}, ${stepIndex}, ${action.type}, ${JSON.stringify(action)}, ${status}, ${result ? JSON.stringify(result) : null}, ${error || null}, NOW(), ${status === 'success' || status === 'failed' ? new Date().toISOString() : null})
      ON CONFLICT (run_id, step_index) DO UPDATE SET status = EXCLUDED.status, result = EXCLUDED.result, error = EXCLUDED.error, completed_at = EXCLUDED.completed_at
    `;
    }
    async getRunSteps(runId) {
        return this.sql `SELECT * FROM run_steps WHERE run_id = ${runId} ORDER BY step_index`;
    }
    async getState(key) {
        const data = await this.redis.get(`poller:${key}`);
        return data ? JSON.parse(data) : {};
    }
    async saveState(key, state) {
        await this.redis.set(`poller:${key}`, JSON.stringify(state));
    }
}
exports.HybridStore = HybridStore;
