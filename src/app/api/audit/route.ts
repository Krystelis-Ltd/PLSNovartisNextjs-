import { NextRequest, NextResponse } from 'next/server';
import { auditLog } from '@/lib/audit-logger';

/**
 * Lightweight audit endpoint for client-side events.
 */
export async function POST(request: NextRequest) {
    try {
        const { event, details } = await request.json();

        if (!event) {
            return NextResponse.json({ error: 'Missing event name' }, { status: 400 });
        }

        auditLog(request, 'client', 'client_event', {
            status: 200,
            request: {
                event_name: event,
                details: details || {},
                user_agent: request.headers.get('user-agent') || 'unknown',
                referrer: request.headers.get('referer') || 'unknown'
            }
        });

        return NextResponse.json({ status: 'ok' });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        auditLog(request, 'client', 'client_event_failed', { status: 500, error: msg });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

