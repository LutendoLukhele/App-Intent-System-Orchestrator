"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventShaper = void 0;
const CONNECTION_OWNER_CACHE_TTL_SECONDS = 60 * 60;
const getConnectionOwnerCacheKey = (connectionId) => `connection-owner:${connectionId}`;
class EventShaper {
    constructor(nangoSecretKey, redis, sql, emit) {
        this.nangoSecretKey = nangoSecretKey;
        this.redis = redis;
        this.sql = sql;
        this.emit = emit;
    }
    async handleWebhook(payload) {
        const { connectionId, model, responseResults, syncName } = payload;
        const addedVal = typeof responseResults?.added === 'number' ? responseResults.added :
            Array.isArray(responseResults?.added) ? responseResults.added.length : 0;
        const updatedVal = typeof responseResults?.updated === 'number' ? responseResults.updated :
            Array.isArray(responseResults?.updated) ? responseResults.updated.length : 0;
        const dedupeKey = `webhook:${connectionId}:${model}`;
        const alreadyProcessed = await this.redis.get(dedupeKey);
        if (alreadyProcessed) {
            console.warn('[EventShaper] Duplicate webhook detected (idempotency check)', { dedupeKey });
            return { processed: 0 };
        }
        console.log('[EventShaper] handleWebhook called', {
            connectionId,
            model,
            hasResponseResults: !!responseResults,
            addedCount: addedVal,
            updatedCount: updatedVal,
        });
        const userId = await this.getUserId(connectionId);
        if (!userId) {
            console.warn('[EventShaper] No userId found for connectionId:', connectionId);
            return { processed: 0 };
        }
        console.log('[EventShaper] Found userId:', userId);
        const addedCount = typeof responseResults?.added === 'number' ? responseResults.added :
            Array.isArray(responseResults?.added) ? responseResults.added.length : 0;
        const updatedCount = typeof responseResults?.updated === 'number' ? responseResults.updated :
            Array.isArray(responseResults?.updated) ? responseResults.updated.length : 0;
        const totalChanges = addedCount + updatedCount;
        if (totalChanges === 0) {
            console.warn('[EventShaper] No changes in webhook payload');
            return { processed: 0 };
        }
        console.log(`[EventShaper] Sync detected: ${addedCount} added, ${updatedCount} updated for model: ${model}`);
        let events = [];
        const syncEvent = {
            id: `sync_${connectionId}_${Date.now()}`,
            source: this.getSourceFromModel(model),
            event: 'sync_completed',
            timestamp: new Date().toISOString(),
            user_id: userId,
            payload: {
                connectionId,
                model,
                syncName,
                addedCount,
                updatedCount,
            },
            meta: {
                dedupe_key: `${connectionId}_${model}`,
            },
        };
        events.push(syncEvent);
        console.log(`[EventShaper] Created sync event for ${model}: ${addedCount} added, ${updatedCount} updated`);
        const results = await Promise.allSettled(events.map(event => this.emit(event)));
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
            console.error(`[EventShaper] ${failures.length} events failed to emit`, {
                failures: failures.map(f => f.reason?.message),
            });
        }
        await this.redis.setex(dedupeKey, 300, '1');
        return { processed: events.length };
    }
    async shapeEmailEvents(records, userId) {
        const events = [];
        const stateKey = `shaper:gmail:${userId}`;
        const prevStateStr = await this.redis.get(stateKey);
        const prevState = prevStateStr ? JSON.parse(prevStateStr) : {};
        const newState = {};
        for (const email of records) {
            const emailId = email.id || email.message_id;
            if (!emailId)
                continue;
            const from = this.parseEmail(email.from || email.sender);
            const threadId = email.thread_id || email.threadId;
            let eventType;
            let isReply = false;
            if (email.in_reply_to || (threadId && prevState[threadId])) {
                eventType = 'email_reply_received';
                isReply = true;
            }
            else if (this.isAutomated(from.email)) {
                continue;
            }
            else if (email.labels?.includes('SENT') || email.from?.includes('me')) {
                eventType = 'email_sent';
            }
            else {
                eventType = 'email_received';
            }
            const event = {
                id: `gmail_${emailId}_${Date.now()}`,
                source: 'gmail',
                event: eventType,
                timestamp: new Date().toISOString(),
                user_id: userId,
                payload: {
                    message_id: emailId,
                    thread_id: threadId,
                    from: from.email,
                    from_name: from.name,
                    to: email.to || '',
                    subject: email.subject || '(no subject)',
                    snippet: email.snippet || email.body_text?.substring(0, 200) || '',
                    body_text: email.body_text || '',
                    body_html: email.body_html || '',
                    date: email.date || email.received_at || email.internal_date,
                    labels: email.labels || [],
                    has_attachments: !!email.has_attachments,
                    is_unread: !email.is_read,
                },
                meta: {
                    dedupe_key: `gmail:${emailId}`,
                },
            };
            events.push(event);
            if (threadId) {
                newState[threadId] = {
                    last_message_id: emailId,
                    message_count: (prevState[threadId]?.message_count || 0) + 1,
                };
            }
        }
        if (Object.keys(newState).length > 0) {
            await this.redis.setex(stateKey, 7 * 24 * 60 * 60, JSON.stringify(newState));
        }
        return events;
    }
    async shapeCalendarEvents(records, userId) {
        const events = [];
        const stateKey = `shaper:calendar:${userId}`;
        const prevStateStr = await this.redis.get(stateKey);
        const prevState = prevStateStr ? JSON.parse(prevStateStr) : {};
        const newState = {};
        for (const calEvent of records) {
            const eventId = calEvent.id || calEvent.event_id;
            if (!eventId)
                continue;
            const prevEvent = prevState[eventId];
            const startTime = new Date(calEvent.start?.dateTime || calEvent.start?.date || calEvent.start_time);
            const now = new Date();
            const minutesUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60);
            let eventType;
            if (!prevEvent) {
                eventType = 'event_created';
            }
            else if (minutesUntilStart > 0 && minutesUntilStart <= 15) {
                eventType = 'event_starting';
            }
            else if (this.detectChanges(prevEvent, calEvent).length > 0) {
                eventType = 'event_updated';
            }
            else {
                continue;
            }
            const event = {
                id: `calendar_${eventId}_${Date.now()}`,
                source: 'google-calendar',
                event: eventType,
                timestamp: new Date().toISOString(),
                user_id: userId,
                payload: {
                    event_id: eventId,
                    summary: calEvent.summary || calEvent.title || '(no title)',
                    description: calEvent.description || '',
                    location: calEvent.location || '',
                    start: calEvent.start,
                    end: calEvent.end,
                    attendees: calEvent.attendees || [],
                    organizer: calEvent.organizer,
                    status: calEvent.status || 'confirmed',
                    html_link: calEvent.htmlLink || calEvent.html_link,
                    is_online: !!(calEvent.conferenceData || calEvent.hangoutLink),
                },
                meta: {
                    dedupe_key: `calendar:${eventId}:${eventType}`,
                },
            };
            events.push(event);
            newState[eventId] = {
                summary: calEvent.summary,
                start: calEvent.start,
                end: calEvent.end,
                location: calEvent.location,
                status: calEvent.status,
            };
        }
        if (Object.keys(newState).length > 0) {
            await this.redis.setex(stateKey, 30 * 24 * 60 * 60, JSON.stringify(newState));
        }
        return events;
    }
    async shapeLeadEvents(records, userId) {
        const events = [];
        const stateKey = `shaper:leads:${userId}`;
        const prevStateStr = await this.redis.get(stateKey);
        const prevState = prevStateStr ? JSON.parse(prevStateStr) : {};
        const newState = {};
        for (const lead of records) {
            const leadId = lead.Id || lead.id;
            if (!leadId)
                continue;
            const prevLead = prevState[leadId];
            let eventType;
            if (!prevLead) {
                eventType = 'lead_created';
            }
            else if (lead.IsConverted && !prevLead.IsConverted) {
                eventType = 'lead_converted';
            }
            else if (lead.Status !== prevLead.Status) {
                eventType = 'lead_stage_changed';
            }
            else {
                continue;
            }
            const event = {
                id: `salesforce_lead_${leadId}_${Date.now()}`,
                source: 'salesforce',
                event: eventType,
                timestamp: new Date().toISOString(),
                user_id: userId,
                payload: {
                    lead_id: leadId,
                    first_name: lead.FirstName || '',
                    last_name: lead.LastName || '',
                    company: lead.Company || '',
                    email: lead.Email || '',
                    phone: lead.Phone || '',
                    status: lead.Status,
                    rating: lead.Rating || '',
                    owner_id: lead.OwnerId,
                    is_converted: !!lead.IsConverted,
                    converted_account_id: lead.ConvertedAccountId,
                    converted_contact_id: lead.ConvertedContactId,
                    converted_opportunity_id: lead.ConvertedOpportunityId,
                    previous_status: prevLead?.Status,
                },
                meta: {
                    dedupe_key: `salesforce:lead:${leadId}:${eventType}`,
                },
            };
            events.push(event);
            newState[leadId] = {
                Status: lead.Status,
                IsConverted: lead.IsConverted,
            };
        }
        if (Object.keys(newState).length > 0) {
            await this.redis.setex(stateKey, 60 * 24 * 60 * 60, JSON.stringify(newState));
        }
        return events;
    }
    async shapeOpportunityEvents(records, userId) {
        const events = [];
        const stateKey = `shaper:opps:${userId}`;
        const prevStateStr = await this.redis.get(stateKey);
        const prevState = prevStateStr ? JSON.parse(prevStateStr) : {};
        const newState = {};
        for (const opp of records) {
            const oppId = opp.Id || opp.id;
            if (!oppId)
                continue;
            const prevOpp = prevState[oppId];
            let eventType = null;
            const generatedEvents = [];
            if (!prevOpp) {
                eventType = 'opportunity_created';
            }
            else {
                if (opp.StageName !== prevOpp.StageName) {
                    generatedEvents.push({
                        id: `salesforce_opp_${oppId}_stage_${Date.now()}`,
                        source: 'salesforce',
                        event: 'opportunity_stage_changed',
                        timestamp: new Date().toISOString(),
                        user_id: userId,
                        payload: {
                            opportunity_id: oppId,
                            name: opp.Name || '',
                            account_id: opp.AccountId,
                            amount: opp.Amount || 0,
                            stage_name: opp.StageName,
                            previous_stage: prevOpp.StageName,
                            close_date: opp.CloseDate,
                            probability: opp.Probability || 0,
                            owner_id: opp.OwnerId,
                            is_closed: opp.IsClosed,
                            is_won: opp.IsWon,
                        },
                        meta: {
                            dedupe_key: `salesforce:opp:${oppId}:stage_${opp.StageName}`,
                        },
                    });
                }
                if (opp.IsClosed && !prevOpp.IsClosed) {
                    eventType = opp.IsWon ? 'opportunity_closed_won' : 'opportunity_closed_lost';
                }
                if (opp.Amount && prevOpp.Amount) {
                    const amountChange = Math.abs(opp.Amount - prevOpp.Amount);
                    const percentChange = amountChange / prevOpp.Amount;
                    if (amountChange > 1000 || percentChange > 0.1) {
                        generatedEvents.push({
                            id: `salesforce_opp_${oppId}_amount_${Date.now()}`,
                            source: 'salesforce',
                            event: 'opportunity_amount_changed',
                            timestamp: new Date().toISOString(),
                            user_id: userId,
                            payload: {
                                opportunity_id: oppId,
                                name: opp.Name || '',
                                account_id: opp.AccountId,
                                amount: opp.Amount,
                                previous_amount: prevOpp.Amount,
                                amount_change: opp.Amount - prevOpp.Amount,
                                stage_name: opp.StageName,
                                close_date: opp.CloseDate,
                                owner_id: opp.OwnerId,
                            },
                            meta: {
                                dedupe_key: `salesforce:opp:${oppId}:amount_${opp.Amount}`,
                            },
                        });
                    }
                }
            }
            if (eventType) {
                generatedEvents.unshift({
                    id: `salesforce_opp_${oppId}_${Date.now()}`,
                    source: 'salesforce',
                    event: eventType,
                    timestamp: new Date().toISOString(),
                    user_id: userId,
                    payload: {
                        opportunity_id: oppId,
                        name: opp.Name || '',
                        account_id: opp.AccountId,
                        amount: opp.Amount || 0,
                        stage_name: opp.StageName,
                        close_date: opp.CloseDate,
                        probability: opp.Probability || 0,
                        owner_id: opp.OwnerId,
                        is_closed: opp.IsClosed,
                        is_won: opp.IsWon,
                    },
                    meta: {
                        dedupe_key: `salesforce:opp:${oppId}:${eventType}`,
                    },
                });
            }
            events.push(...generatedEvents);
            newState[oppId] = {
                StageName: opp.StageName,
                Amount: opp.Amount,
                IsClosed: opp.IsClosed,
                IsWon: opp.IsWon,
            };
        }
        if (Object.keys(newState).length > 0) {
            await this.redis.setex(stateKey, 60 * 24 * 60 * 60, JSON.stringify(newState));
        }
        return events;
    }
    async getUserId(connectionId) {
        const cacheKey = getConnectionOwnerCacheKey(connectionId);
        const cachedUserId = await this.redis.get(cacheKey);
        if (cachedUserId) {
            return cachedUserId;
        }
        try {
            const rows = await this.sql `
        SELECT user_id FROM connections WHERE connection_id = ${connectionId} LIMIT 1
      `;
            if (rows.length > 0) {
                await this.redis.setex(cacheKey, CONNECTION_OWNER_CACHE_TTL_SECONDS, rows[0].user_id);
                return rows[0].user_id;
            }
            return null;
        }
        catch (error) {
            console.error('[EventShaper] Error fetching userId:', error.message);
            return null;
        }
    }
    parseEmail(addr) {
        if (!addr)
            return { email: '', name: '' };
        const match = addr.match(/^(.+?)\s*<(.+?)>$/);
        if (match) {
            return { name: match[1].trim(), email: match[2].trim() };
        }
        return { email: addr.trim(), name: '' };
    }
    isAutomated(email) {
        if (!email)
            return false;
        const automatedPatterns = [
            'noreply',
            'no-reply',
            'donotreply',
            'do-not-reply',
            'notifications',
            'newsletter',
            'automated',
            'mailer-daemon',
            'postmaster',
        ];
        const lowerEmail = email.toLowerCase();
        return automatedPatterns.some(pattern => lowerEmail.includes(pattern));
    }
    detectChanges(prev, curr) {
        const changes = [];
        for (const key of Object.keys(curr)) {
            if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) {
                changes.push(key);
            }
        }
        return changes;
    }
    getSourceFromModel(model) {
        if (model.startsWith('Gmail'))
            return 'gmail';
        if (model.startsWith('Calendar'))
            return 'google-calendar';
        if (model.startsWith('Salesforce'))
            return 'salesforce';
        return 'gmail';
    }
}
exports.EventShaper = EventShaper;
