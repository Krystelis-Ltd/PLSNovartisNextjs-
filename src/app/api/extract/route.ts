import { NextRequest, NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { getOpenAIClient } from '@/lib/openai';
import { withRetry } from '@/lib/retry';
import { AI_MODEL } from '@/lib/constants';
import { timedAuditLog } from '@/lib/audit-logger';
import type { OpenAIResponsePayload, ExtractRequest } from '@/types';

export const maxDuration = 300;

/**
 * Agentic Architecture: 3-Agent Pipeline (Agent 1 of 3)
 *
 * Agent 1 — Extract Facts: Uses file_search to find, extract, AND convert
 *   clinical/scientific data into plain, accessible language in a single pass.
 *
 * Agent 2 — Build Novartis Terminology (refine/route.ts)
 * Agent 3 — Validation Agent (validate/route.ts)
 */

// Agent 1: Extract Facts — retrieves data AND converts to plain language in one pass
async function runExtractFactsAgent(
    openai: OpenAI,
    keys: string[],
    batchPrompts: Record<string, string>,
    vectorStoreId: string,
    contextData: Record<string, unknown> | null
): Promise<string> {
    const systemPrompt = `
<system_role>
You are "Agent 1: Extract Facts — Clinical Document Specialist."
Your job is to accurately EXTRACT data from the uploaded clinical/scientific documents
AND convert ALL text values into clear, plain language that a 6th-8th grade reader
can understand — in a SINGLE pass.
</system_role>

<core_directives>
1. Use your file_search tool to find and extract the requested information from the uploaded documents.
2. Your ENTIRE response must be a single, valid, raw JSON object. NO Markdown fences. NO text before/after.
3. For EVERY task key, wrap your extracted data in metadata: "data", "confidence_score" (0-100), "source_quote", "source_file", "source_page", "source_section".
4. Use the <previous_extractions_context> to understand foundational study facts.
</core_directives>

<plain_language_rules>
1. CONVERT scientific/medical terminology into plain, everyday language.
2. NEVER change: numbers, percentages, dates, boolean values, null values, JSON keys.
3. Keep sentences short and direct. Use active voice.
4. Replace jargon: "adverse events" → "medical problems", "efficacy" → "effects", "subjects/patients" → "participants".
5. PRESERVE the exact JSON structure, keys, nesting, arrays, and data types.
6. PRESERVE confidence_score, source_quote, source_file, source_page, source_section metadata exactly.
</plain_language_rules>

<previous_extractions_context>
${contextData ? JSON.stringify(contextData, null, 2) : "No previous context compiled yet."}
</previous_extractions_context>
`;

    const combinedPrompt = `Extract the following data points from the provided documents.
Convert ALL text into plain, accessible language while keeping scientific accuracy.
You MUST return a SINGLE valid JSON object with the exact TASK KEYs below.

${keys.map(k => `==============================
TASK KEY: "${k}"
EXTRACTION INSTRUCTIONS:
${batchPrompts[k]}

Your output for "${k}" MUST match this schema:
{
  "data": { ...<extracted data in plain language>... },
  "confidence_score": 95,
  "source_quote": "Exact sentence(s) from the source document.",
  "source_file": "document.pdf",
  "source_page": "Page 5",
  "source_section": "2.1 Background"
}`).join('\n\n')}
`;

    return withRetry(async () => {
        const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIResponsePayload> } }).responses.create({
            model: AI_MODEL,
            instructions: systemPrompt,
            input: combinedPrompt,
            reasoning: { effort: "low" },
            tools: [{
                type: "file_search",
                vector_store_ids: [vectorStoreId],
            }],
            text: {}
        });
        const raw = response.output_text || "";
        if (!raw) throw new Error("Empty response from Extract Facts agent");
        return raw;
    }, { label: 'Extract Facts Agent' });
}

function stripMarkdownFences(text: string): string {
    return text.replace(/^```json/mi, '').replace(/```$/m, '').trim();
}

export async function POST(request: NextRequest) {
    const openai = getOpenAIClient();
    try {
        const body: ExtractRequest = await request.json();
        const { batchPrompts, vectorStoreId, contextData } = body;

        if (!batchPrompts || typeof batchPrompts !== 'object' || !vectorStoreId) {
            return NextResponse.json({ error: 'Missing batchPrompts or vectorStoreId' }, { status: 400 });
        }

        const keys = Object.keys(batchPrompts);
        const logger = timedAuditLog(request, 'extract', 'extraction', {
            vector_store_id: vectorStoreId,
            request: { keys, batch_size: keys.length }
        });

        // === AGENT 1: Extract Facts (single-pass retrieval + plain language) ===
        let raw = await runExtractFactsAgent(openai, keys, batchPrompts, vectorStoreId, contextData ?? null);

        if (!raw) {
            throw new Error("Extract Facts Agent returned empty response");
        }
        raw = stripMarkdownFences(raw);

        logger.finish({
            status: 200,
            vector_store_id: vectorStoreId,
            response: {
                output_keys: keys,
                output_size_bytes: Buffer.byteLength(raw, 'utf-8')
            }
        });

        return NextResponse.json({ raw });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const logger = timedAuditLog(request, 'extract', 'extraction');
        logger.finish({ status: 500, error: msg });
        return NextResponse.json(
            { error: "Extraction failed", details: msg },
            { status: 500 }
        );
    }
}

