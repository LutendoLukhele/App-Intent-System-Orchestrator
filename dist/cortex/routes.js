"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCortexRouter = createCortexRouter;
const express_1 = require("express");
function createCortexRouter(store, compiler, runtime) {
    const router = (0, express_1.Router)();
    router.get('/units', async (req, res) => {
        try {
            const userId = req.headers['x-user-id'];
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const units = await store.getUserUnits(userId);
            res.json({ units });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/units/:id', async (req, res) => {
        try {
            const unit = await store.getUnit(req.params.id);
            if (!unit)
                return res.status(404).json({ error: 'Not found' });
            res.json({ unit });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/units', async (req, res) => {
        try {
            const userId = req.headers['x-user-id'];
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { prompt, when, if: ifClause, then: thenClause } = req.body;
            let input;
            if (prompt && typeof prompt === 'string') {
                const parts = prompt.toLowerCase();
                if (parts.includes('when') && parts.includes('then')) {
                    const whenMatch = prompt.match(/when\s+(.*?)(?:\s+if\s+|\s+then\s+)/i);
                    const ifMatch = prompt.match(/if\s+(.*?)(?:\s+then\s+)/i);
                    const thenMatch = prompt.match(/then\s+(.*?)$/i);
                    input = {
                        when: whenMatch?.[1] || prompt,
                        if: ifMatch?.[1],
                        then: thenMatch?.[1] || 'complete the task',
                    };
                }
                else {
                    return res.status(400).json({
                        error: 'Prompt must include "when" and "then" clauses'
                    });
                }
            }
            else if (when && thenClause) {
                input = { when, if: ifClause, then: thenClause };
            }
            else {
                return res.status(400).json({
                    error: 'Either "prompt" (raw text) or "when"+"then" (structured) required'
                });
            }
            const unit = await compiler.compile(input, userId);
            await store.saveUnit(unit);
            res.json({ unit });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.patch('/units/:id/status', async (req, res) => {
        try {
            const { status } = req.body;
            if (!['active', 'paused', 'disabled'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            await store.updateUnitStatus(req.params.id, status);
            const unit = await store.getUnit(req.params.id);
            res.json({ unit });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.delete('/units/:id', async (req, res) => {
        try {
            await store.deleteUnit(req.params.id);
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/units/:id/runs', async (req, res) => {
        try {
            const runs = await store.getUnitRuns(req.params.id);
            res.json({ runs });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/runs', async (req, res) => {
        try {
            const userId = req.headers['x-user-id'];
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const runs = await store.getUserRuns(userId);
            res.json({ runs });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/runs/:id', async (req, res) => {
        try {
            const run = await store.getRun(req.params.id);
            if (!run)
                return res.status(404).json({ error: 'Not found' });
            const steps = await store.getRunSteps(req.params.id);
            res.json({ run, steps });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/runs/:id/rerun', async (req, res) => {
        try {
            const newRun = await runtime.rerun(req.params.id);
            if (!newRun)
                return res.status(400).json({ error: 'Cannot rerun' });
            res.json({ run: newRun });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.post('/events/test', async (req, res) => {
        try {
            const { source, event, payload, userId } = req.body;
            res.json({ success: true, message: 'Use processEvent() directly for testing' });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    router.get('/metrics', async (req, res) => {
        try {
            const unitCountResult = await store.sql `SELECT COUNT(*)::int as count FROM units WHERE status = 'active'`;
            const runCountResult = await store.sql `SELECT COUNT(*)::int as count FROM runs WHERE started_at > NOW() - INTERVAL '1 hour'`;
            const connectionCountResult = await store.sql `SELECT COUNT(*)::int as count FROM connections WHERE enabled = true`;
            const activeUnits = unitCountResult[0]?.count || 0;
            const runsLastHour = runCountResult[0]?.count || 0;
            const enabledConnections = connectionCountResult[0]?.count || 0;
            res.json({
                units: {
                    active: activeUnits,
                },
                runs: {
                    lastHour: runsLastHour,
                },
                connections: {
                    enabled: enabledConnections,
                },
                timestamp: new Date().toISOString(),
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}
