import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/openai';
import { AI_MODEL } from '@/lib/constants';
import { timedAuditLog } from '@/lib/audit-logger';
import type { OpenAIResponsePayload, ChatRequest } from '@/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
    const openai = getOpenAIClient();
    try {
        const body: ChatRequest = await request.json();
        const { messages, vectorStoreId, fetchedAnswers } = body;

        if (!messages || !vectorStoreId) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const lastMessage = messages[messages.length - 1]?.content || "";
        const logger = timedAuditLog(request, 'chat', 'chat_message', {
            vector_store_id: vectorStoreId,
            request: {
                message_length: lastMessage.length,
                conversation_length: messages.length,
                context_keys: Object.keys(fetchedAnswers || {})
            }
        });

        const systemMessage = `
            You are a helpful and expert AI document medical assistant.
            You have access to:
            1. The source documents uploaded by the user via your file_search tool.
            2. The currently extracted/parsed data answers, provided as JSON context below.
            
            Current extracted data context:
            ${JSON.stringify(fetchedAnswers, null, 2)}
            
            CRITICAL RULES:
            1. BASE YOUR ANSWER ONLY ON THE PROVIDED CONTEXT. Do not use outside knowledge. If the answer is not in the context or source documents, state that clearly.
            2. PROVIDE REASONING FIRST: Always provide a brief explanation or reasoning for your answer before delivering the final response.
            3. MANDATORY CITATIONS: For every piece of information you provide, you MUST cite the exact source to be helpful for medical writers. Include:
               - Document Name
               - Section Name
               - Page Number
            4. If the user asks you to update, change, edit, or manipulate any data point in the extracted JSON, you MUST use the \`update_json_value\` tool to do so programmatically.
        `;

        const conversationText = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
        const inputStr = "Please answer the latest user request based on the following conversation history:\n" + conversationText;

        let reply = "";

        try {
            const response = await (openai as unknown as { responses: { create: (opts: Record<string, unknown>) => Promise<OpenAIResponsePayload> } }).responses.create({
                model: AI_MODEL,
                instructions: systemMessage,
                input: inputStr,
                tools: [
                    {
                        type: "file_search",
                        vector_store_ids: [vectorStoreId],
                    },
                    {
                        type: "function",
                        name: "update_json_value",
                        description: "Updates a specific key in the extracted JSON document dataset with new information based on the user's request.",
                        parameters: {
                            type: "object",
                            properties: {
                                key: {
                                    type: "string",
                                    description: "The exact root-level key in the JSON object to update."
                                },
                                newValue: {
                                    type: "object",
                                    description: "The complete, properly formatted new JSON object or string value to replace the existing value under the key."
                                }
                            },
                            required: ["key", "newValue"]
                        }
                    }
                ]
            });

            // Handle function call if the model decided to use the tool
            const outputArray = response.output || [];
            const toolCall = outputArray.find((item) => item.type === "function_call" && item.name === "update_json_value");

            if (toolCall) {
                let args: Record<string, unknown>;
                try {
                    args = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : (toolCall.arguments as Record<string, unknown>) || {};
                } catch {
                    console.error("[chat] Failed to parse tool call arguments");
                    args = {};
                }

                logger.finish({
                    status: 200,
                    vector_store_id: vectorStoreId,
                    response: {
                        type: 'function_call',
                        function_name: 'update_json_value',
                        updated_key: args.key
                    }
                });

                return NextResponse.json({
                    functionCall: {
                        name: "update_json_value",
                        arguments: args
                    },
                    reply: "I've updated the document data for you."
                });
            }

            reply = response.output_text || response.choices?.[0]?.message?.content || "";
            if (reply) {
                reply = reply.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
                logger.finish({
                    status: 200,
                    vector_store_id: vectorStoreId,
                    response: {
                        type: 'text_reply',
                        reply_length: reply.length
                    }
                });
                return NextResponse.json({ reply });
            }
        } catch (e: unknown) {
            console.warn("[chat] responses.create failed, falling back to beta thread:", e instanceof Error ? e.message : String(e));
        }

        // Fallback to standard OpenAI Assistant API
        const assistant = await openai.beta.assistants.create({
            model: "gpt-4o",
            instructions: systemMessage,
            tools: [{ type: "file_search" }],
        });
        const thread = await openai.beta.threads.create({
            messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            tool_resources: {
                file_search: { vector_store_ids: [vectorStoreId] }
            }
        });
        const run = await openai.beta.threads.runs.createAndPoll(
            thread.id,
            { assistant_id: assistant.id }
        );

        if (run.status === 'completed') {
            const messagesList = await openai.beta.threads.messages.list(run.thread_id);
            const lastMsg = messagesList.data.filter(m => m.role === 'assistant')[0];
            if (lastMsg.content[0].type === 'text') {
                reply = lastMsg.content[0].text.value;
            }
        }

        if (!reply) {
            throw new Error("Empty response from AI");
        }

        reply = reply.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();

        logger.finish({
            status: 200,
            vector_store_id: vectorStoreId,
            response: {
                type: 'text_reply_fallback',
                reply_length: reply.length
            }
        });

        return NextResponse.json({ reply });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const logger = timedAuditLog(request, 'chat', 'chat_message');
        logger.finish({ status: 500, error: msg });
        return NextResponse.json({ error: "Chat failed" }, { status: 500 });
    }
}

