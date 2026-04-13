import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export const maxDuration = 300;

/**
 * Document Processing Pipeline: Convert uploaded files (PDF/DOCX) to Markdown.
 * Uses mammoth for DOCX → HTML → Markdown conversion (from docx-to-markdown skill).
 * PDF text extraction uses a lightweight inline parser.
 */

function htmlToMarkdown(html: string): string {
    let md = html;
    // Headings
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    // Bold / Italic
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    // Links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    // Lists
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');
    // Tables
    md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
        const rows: string[][] = [];
        const rowMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
        for (const row of rowMatches) {
            const cells: string[] = [];
            const cellMatches = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
            for (const cell of cellMatches) {
                cells.push(cell.replace(/<[^>]+>/g, '').trim());
            }
            rows.push(cells);
        }
        if (rows.length === 0) return '';
        const colCount = Math.max(...rows.map(r => r.length));
        let table = '';
        rows.forEach((row, idx) => {
            const paddedRow = [...row, ...Array(colCount - row.length).fill('')];
            table += '| ' + paddedRow.join(' | ') + ' |\n';
            if (idx === 0) {
                table += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
            }
        });
        return '\n' + table + '\n';
    });
    // Paragraphs and breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    // Strip remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');
    // Clean up whitespace
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const fileName = file.name.toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let markdown = '';
        const metadata: Record<string, string> = {
            fileName: file.name,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
            convertedAt: new Date().toISOString(),
        };

        if (fileName.endsWith('.docx')) {
            // DOCX → HTML → Markdown pipeline (docx-to-markdown skill)
            const result = await mammoth.convertToHtml({ buffer });
            markdown = htmlToMarkdown(result.value);
            metadata.format = 'DOCX';
            metadata.warnings = result.messages
                .filter(m => m.type === 'warning')
                .map(m => m.message)
                .join('; ') || 'None';
        } else if (fileName.endsWith('.pdf')) {
            // PDF: extract raw text content
            const textContent = buffer.toString('utf-8');
            // Extract readable text segments from PDF binary
            const textSegments: string[] = [];
            const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
            let match;
            while ((match = streamRegex.exec(textContent)) !== null) {
                const segment = match[1].replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
                if (segment.length > 20) textSegments.push(segment);
            }
            if (textSegments.length > 0) {
                markdown = textSegments.join('\n\n');
            } else {
                // Fallback: extract printable text
                markdown = textContent.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                    .replace(/ {2,}/g, ' ')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }
            metadata.format = 'PDF';
            metadata.note = 'Basic text extraction. For complex PDFs with OCR, use markitdown.';
        } else {
            // Plain text fallback
            markdown = buffer.toString('utf-8');
            metadata.format = 'TEXT';
        }

        // Add metadata tags as YAML frontmatter
        const frontmatter = [
            '---',
            ...Object.entries(metadata).map(([k, v]) => `${k}: "${v}"`),
            '---',
            '',
        ].join('\n');

        const fullMarkdown = frontmatter + markdown;

        return NextResponse.json({
            markdown: fullMarkdown,
            metadata,
            stats: {
                characters: markdown.length,
                words: markdown.split(/\s+/).filter(Boolean).length,
                lines: markdown.split('\n').length,
            }
        });

    } catch (error: unknown) {
        console.error("Markdown conversion error:", error);
        return NextResponse.json(
            { error: "Conversion failed", details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

