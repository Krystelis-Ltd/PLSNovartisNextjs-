import { NextRequest } from 'next/server';
import { getUserIdentity } from './auth';

/**
 * Structured Audit Logger for Azure App Service
 * Outputs single-line JSON to stdout for ingestion by Azure Monitor / Log Analytics.
 */

export interface AuditLogEntry {
    type: 'AUDIT';
    timestamp: string;
    category: string;
    action: string;
    user: string;
    public_ip: string;
    status?: number;
    vector_store_id?: string;
    duration_ms?: number;
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
    error?: string;
}

/**
 * Resolves the client's public IP from Azure-specific headers.
 */
export function getPublicIp(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return (
        request.headers.get('x-client-ip') ||
        request.headers.get('x-real-ip') ||
        '0.0.0.0'
    );
}

/**
 * Emits a structured JSON audit log.
 */
export function auditLog(
    request: NextRequest,
    category: string,
    action: string,
    details?: {
        status?: number;
        vector_store_id?: string;
        duration_ms?: number;
        request?: Record<string, unknown>;
        response?: Record<string, unknown>;
        error?: string;
    }
) {
    const entry: AuditLogEntry = {
        type: 'AUDIT',
        timestamp: new Date().toISOString(),
        category,
        action,
        user: getUserIdentity(request),
        public_ip: getPublicIp(request),
        ...details,
    };

    // Output as single-line JSON for Azure log collectors
    console.log(JSON.stringify(entry));
}

/**
 * Helper to time an operation and automatically log the result upon completion.
 */
export function timedAuditLog(
    request: NextRequest,
    category: string,
    action: string,
    initialDetails?: { vector_store_id?: string; request?: Record<string, unknown> }
) {
    const start = Date.now();
    
    // Log the start event
    auditLog(request, category, `${action}_started`, initialDetails);

    return {
        /**
         * Finalizes the log entry with duration and response data.
         */
        finish: (responseDetails?: { 
            status?: number; 
            vector_store_id?: string;
            response?: Record<string, unknown>;
            error?: string;
        }) => {
            const duration_ms = Date.now() - start;
            auditLog(request, category, responseDetails?.error ? `${action}_failed` : `${action}_completed`, {
                ...initialDetails,
                status: responseDetails?.status,
                duration_ms,
                vector_store_id: responseDetails?.vector_store_id || initialDetails?.vector_store_id,
                response: responseDetails?.response,
                error: responseDetails?.error,
            });
        }
    };
}
