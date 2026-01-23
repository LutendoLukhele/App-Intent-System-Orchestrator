"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamEventEmitter = void 0;
const events_1 = require("events");
class StreamEventEmitter extends events_1.EventEmitter {
    constructor(serviceName) {
        super();
        this.serviceName = serviceName;
    }
    emitTitleGenerated(sessionId, title) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'title_generated',
            data: { title },
            metadata: { source: this.serviceName }
        });
    }
    emitSubtitleGenerated(sessionId, subtitle) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'subtitle_generated',
            data: { subtitle },
            metadata: { source: this.serviceName }
        });
    }
    emitSegmentAdded(sessionId, segment) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'segment_added',
            data: { segment },
            metadata: { source: this.serviceName }
        });
    }
    emitSourceAdded(sessionId, source) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'source_added',
            data: { source },
            metadata: { source: this.serviceName }
        });
    }
    emitImageAdded(sessionId, image) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'image_added',
            data: { image },
            metadata: { source: this.serviceName }
        });
    }
    emitHeroImageSet(sessionId, hero) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'hero_image_set',
            data: { hero },
            metadata: { source: this.serviceName }
        });
    }
    emitMetadataUpdate(sessionId, metadata) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'metadata_update',
            data: { metadata },
            metadata: { source: this.serviceName }
        });
    }
    emitEnrichmentStart(sessionId, key) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_start',
            data: { key },
            metadata: { source: this.serviceName }
        });
    }
    emitEnrichmentComplete(sessionId, key, stats) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_complete',
            data: { key, ...stats },
            metadata: { source: this.serviceName }
        });
    }
    emitEnrichmentError(sessionId, key, message) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_error',
            data: { key, message },
            metadata: { source: this.serviceName }
        });
    }
    emitToken(sessionId, chunk) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'token',
            data: { chunk },
            metadata: { source: this.serviceName }
        });
    }
    emitReasoning(sessionId, text) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'reasoning',
            data: { text },
            metadata: { source: this.serviceName }
        });
    }
    emitTool(sessionId, tool, status, result) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'tool',
            data: { tool, status, result },
            metadata: { source: this.serviceName }
        });
    }
    emitWarning(sessionId, message, type) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'warning',
            data: { message, type },
            metadata: { source: this.serviceName }
        });
    }
    emitStart(sessionId, data) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'start',
            data,
            metadata: { source: this.serviceName }
        });
    }
    emitComplete(sessionId, data) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'complete',
            data,
            metadata: { source: this.serviceName }
        });
    }
    emitError(sessionId, message, code) {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'error',
            data: { message, code },
            metadata: { source: this.serviceName }
        });
    }
    emitConversationalSegment(sessionId, content, messageId, isFinal) {
        this.emit('send_chunk', sessionId, {
            type: 'conversational_text_segment',
            content,
            messageId,
            streamType: 'conversational',
            isFinal,
            metadata: { source: this.serviceName }
        });
    }
    emitStreamEnd(sessionId, messageId, streamType = 'conversational') {
        this.emit('send_chunk', sessionId, {
            type: 'stream_end',
            messageId,
            streamType,
            isFinal: true,
            metadata: { source: this.serviceName }
        });
    }
}
exports.StreamEventEmitter = StreamEventEmitter;
