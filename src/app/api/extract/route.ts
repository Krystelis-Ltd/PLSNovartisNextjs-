import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

export const maxDuration = 300;

interface OpenAIRawResponse {
    output_text?: string;
}

/**
 * Agentic Architecture: 2-Agent Pipeline
 *
 * Agent 1 (Retrieval Agent): Uses file_search to find and extract raw scientific
 *   data from documents. Focused on accuracy and completeness of retrieval.
 *
 * Agent 2 (Conversion Agent): Takes raw scientific extractions and converts them
 *   into plain, accessible language. Lightweight reasoning for speed.
 */

// Agent 1: Retrieval - Extract raw scientific data from documents
async function runRetrievalAgent(
    keys: string[],
    batchPrompts: Record<string, string>,
    vectorStoreId: string,
    contextData: Record<string, unknown> | null
): Promise<string> {
    const retrievalSystemPrompt = `
<system_role>
You are "Agent 1: Scientific Document Retrieval Specialist."
Your ONLY job is to accurately EXTRACT raw data from the uploaded clinical/scientific documents.
You must be precise, thorough, and faithful to the source material.
</system_role>

<core_directives>
1. Use your file_search tool to find and extract the requested information from the uploaded documents.
2. Extract the data EXACTLY as it appears in the source — do NOT simplify, paraphrase, or translate terminology yet.
3. Your ENTIRE response must be a single, valid, raw JSON object. NO Markdown fences. NO text before/after.
4. For EVERY task key, wrap your extracted data in metadata: "data", "confidence_score" (0-100), "source_quote", "source_file", "source_page", "source_section".
5. Use the <previous_extractions_context> to understand foundational study facts.
</core_directives>

<previous_extractions_context>
${contextData ? JSON.stringify(contextData, null, 2) : "No previous context compiled yet."}
</previous_extractions_context>
`;

    const combinedPrompt = `Extract the following data points from the provided documents. Return raw scientific data as-is from the source.
You MUST return a SINGLE valid JSON object with the exact TASK KEYs below.

${keys.map(k => `==============================
TASK KEY: "${k}"
EXTRACTION INSTRUCTIONS:
${batchPrompts[k]}

Your output for "${k}" MUST match this schema:
{
  "data": { ...<extracted data matching the requested JSON structure>... },
  "confidence_score": 95,
  "source_quote": "Exact sentence(s) from the source document.",
  "source_file": "document.pdf",
  "source_page": "Page 5",
  "source_section": "2.1 Background"
}`).join('\n\n')}
`;

    let raw = "";
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIRawResponse> } }).responses.create({
                model: "gpt-5.4",
                instructions: retrievalSystemPrompt,
                input: combinedPrompt,
                reasoning: { effort: "low" },
                tools: [{
                    type: "file_search",
                    vector_store_ids: [vectorStoreId],
                }],
                text: {}
            });
            raw = response.output_text || "";
            if (raw) break;
        } catch (err) {
            console.warn(`Retrieval Agent attempt ${attempt + 1} failed:`, err);
            if (attempt === 2) throw err;
            await new Promise(res => setTimeout(res, 1000));
        }
    }
    return raw;
}

// Agent 2: Conversion - Convert scientific language to plain language
async function runConversionAgent(rawExtraction: string): Promise<string> {
    const conversionSystemPrompt = `
<system_role>
You are "Agent 2: Plain Language Conversion Specialist."
Your job is to take raw scientific/clinical data and convert ALL text values into clear, plain language
that a 6th-8th grade reader can understand, while preserving the exact JSON structure.
</system_role>

<conversion_rules>
1. PRESERVE the exact JSON structure, keys, nesting, arrays, and data types.
2. CONVERT scientific/medical terminology into plain, everyday language.
3. NEVER change: numbers, percentages, dates, boolean values, null values, JSON keys.
4. Keep sentences short and direct. Use active voice.
5. Replace jargon: "adverse events" → "medical problems", "efficacy" → "effects", "subjects/patients" → "participants".
6. Your ENTIRE response must be a single valid raw JSON object. NO markdown fences.
7. PRESERVE confidence_score, source_quote, source_file, source_page, source_section metadata exactly.
</conversion_rules>
`;

    const conversionPrompt = `Convert the following extracted scientific data into plain, accessible language.
Keep the JSON structure identical. Only simplify the text content within string values.

RAW SCIENTIFIC DATA:
${rawExtraction}`;

    let converted = "";
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIRawResponse> } }).responses.create({
                model: "gpt-5.4",
                instructions: conversionSystemPrompt,
                input: conversionPrompt,
                reasoning: { effort: "low" },
                text: {}
            });
            converted = response.output_text || "";
            if (converted) break;
        } catch (err) {
            console.warn(`Conversion Agent attempt ${attempt + 1} failed:`, err);
            if (attempt === 2) throw err;
            await new Promise(res => setTimeout(res, 1000));
        }
    }
    return converted;
}

export async function POST(request: NextRequest) {
    try {
        const { batchPrompts, vectorStoreId, contextData } = await request.json();

        if (!batchPrompts || typeof batchPrompts !== 'object' || !vectorStoreId) {
            return NextResponse.json({ error: 'Missing batchPrompts or vectorStoreId' }, { status: 400 });
        }

        const keys = Object.keys(batchPrompts);

        // === AGENT 1: Retrieval ===
        console.log("🔍 Agent 1 (Retrieval): Starting extraction for keys:", keys);
        let rawExtraction = await runRetrievalAgent(keys, batchPrompts, vectorStoreId, contextData);

        if (!rawExtraction) {
            throw new Error("Agent 1 (Retrieval) returned empty response");
        }
        rawExtraction = rawExtraction.replace(/^```json/mi, '').replace(/```$/m, '').trim();
        console.log("✅ Agent 1 (Retrieval): Complete");

        // === AGENT 2: Conversion ===
        console.log("📝 Agent 2 (Conversion): Starting plain language conversion...");
        let raw = await runConversionAgent(rawExtraction);

        if (!raw) {
            console.warn("⚠️ Agent 2 (Conversion) returned empty, falling back to Agent 1 output");
            raw = rawExtraction;
        }
        raw = raw.replace(/^```json/mi, '').replace(/```$/m, '').trim();
        console.log("✅ Agent 2 (Conversion): Complete");

        return NextResponse.json({ raw });

    } catch (error: unknown) {
        console.error("Extraction pipeline error:", error);
        return NextResponse.json(
            { error: "Extraction failed", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
