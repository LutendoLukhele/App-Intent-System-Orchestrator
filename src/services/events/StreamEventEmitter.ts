// src/services/events/StreamEventEmitter.ts

import { EventEmitter } from 'events';
import { StreamChunk } from '../stream/types';

/**
 * Base class for services that emit streaming events.
 * Provides standardized methods for emitting common event types.
 */
export class StreamEventEmitter extends EventEmitter {
    protected serviceName: string;

    constructor(serviceName: string) {
        super();
        this.serviceName = serviceName;
    }

    /**
     * Emit a title_generated event
     */
    protected emitTitleGenerated(sessionId: string, title: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'title_generated',
            data: { title },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a subtitle_generated event
     */
    protected emitSubtitleGenerated(sessionId: string, subtitle: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'subtitle_generated',
            data: { subtitle },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a segment_added event
     */
    protected emitSegmentAdded(sessionId: string, segment: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'segment_added',
            data: { segment },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a source_added event
     */
    protected emitSourceAdded(sessionId: string, source: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'source_added',
            data: { source },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit an image_added event
     */
    protected emitImageAdded(sessionId: string, image: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'image_added',
            data: { image },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a hero_image_set event
     */
    protected emitHeroImageSet(sessionId: string, hero: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'hero_image_set',
            data: { hero },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a metadata_update event
     */
    protected emitMetadataUpdate(sessionId: string, metadata: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'metadata_update',
            data: { metadata },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit an enrichment_start event
     */
    protected emitEnrichmentStart(sessionId: string, key: 'cultural' | 'social' | 'visual'): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_start',
            data: { key },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit an enrichment_complete event
     */
    protected emitEnrichmentComplete(sessionId: string, key: string, stats?: { segmentsAdded?: number; sourcesAdded?: number }): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_complete',
            data: { key, ...stats },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit an enrichment_error event
     */
    protected emitEnrichmentError(sessionId: string, key: string, message: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'enrichment_error',
            data: { key, message },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a token event (for raw LLM tokens)
     */
    protected emitToken(sessionId: string, chunk: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'token',
            data: { chunk },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a reasoning event
     */
    protected emitReasoning(sessionId: string, text: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'reasoning',
            data: { text },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a tool event
     */
    protected emitTool(sessionId: string, tool: string, status: 'running' | 'complete', result?: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'tool',
            data: { tool, status, result },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a warning event
     */
    protected emitWarning(sessionId: string, message: string, type?: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'warning',
            data: { message, type },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a start event
     */
    protected emitStart(sessionId: string, data: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'start',
            data,
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a complete event
     */
    protected emitComplete(sessionId: string, data: any): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'complete',
            data,
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit an error event
     */
    protected emitError(sessionId: string, message: string, code?: string): void {
        this.emit('send_chunk', sessionId, {
            type: 'interpret_event',
            event: 'error',
            data: { message, code },
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a conversational text segment (for backward compatibility)
     */
    protected emitConversationalSegment(sessionId: string, content: any, messageId: string, isFinal?: boolean): void {
        this.emit('send_chunk', sessionId, {
            type: 'conversational_text_segment',
            content,
            messageId,
            streamType: 'conversational',
            isFinal,
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }

    /**
     * Emit a stream_end event
     */
    protected emitStreamEnd(sessionId: string, messageId: string, streamType: string = 'conversational'): void {
        this.emit('send_chunk', sessionId, {
            type: 'stream_end',
            messageId,
            streamType,
            isFinal: true,
            metadata: { source: this.serviceName }
        } as StreamChunk);
    }
}
