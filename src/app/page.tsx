"use client"

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { extractPrompts } from '@/utils/promptLoader'
import { JsonEditor } from '@/components/JsonEditor'
import { Chatbot } from '@/components/Chatbot'
import { PipelineTestUI } from '@/components/PipelineTestUI'
import { useToast } from '@/components/Toast'
import { EXTRACTION_BATCH_SIZE, METADATA_KEYS, CITATION_KEYS_TO_REMOVE } from '@/lib/constants'
import type { FileEntry, ExtractionFeedItem, SourceModalData } from '@/types'

// Animation variants (framer-motion-animator skill)
const fadeInDown = {
  hidden: { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
}

const slideInLeft = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

export default function Dashboard() {
  const { showToast } = useToast()
  const [readabilityLevel, setReadabilityLevel] = useState("6th Grade")
  const [mappingName, setMappingName] = useState("results_PLS")
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    // Fetch user info from Azure Easy Auth
    const fetchUser = async () => {
      try {
        const response = await fetch('/.auth/me');
        if (!response.ok) return;
        const data = await response.json();
        if (data && data[0]) {
          const userClaims = data[0].user_claims || [];
          const nameClaim = userClaims.find((c: { typ: string; val: string }) =>
            c.typ === 'name' || c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
          );
          const emailClaim = userClaims.find((c: { typ: string; val: string }) =>
            c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
          );
          setUser({
            name: nameClaim?.val || data[0].user_id?.split('@')[0] || 'User',
            email: emailClaim?.val || data[0].user_id || ''
          });

          // Log session start
          fetch('/api/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'SESSION_STARTED', details: { userAgent: navigator.userAgent } })
          }).catch(() => {});
        }
      } catch {
        // Expected in local dev — Easy Auth not available
      }
    };
    fetchUser();
  }, []);

  // Dynamic prompts derived from selection
  const promptData = useMemo(() => extractPrompts(readabilityLevel, mappingName), [readabilityLevel, mappingName]);
  const keys = promptData.keys;
  const texts = promptData.texts;
  const mapping = promptData.mapping;

  const [selectedPrompts, setSelectedPrompts] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Select all prompts by default when mapping changes
    const newSelections: Record<string, boolean> = {}
    keys.forEach(k => newSelections[k] = true)
    setSelectedPrompts(newSelections)
  }, [mappingName]) // omitting keys dependency to avoid infinite loop on object identity change

  const [files, setFiles] = useState<FileEntry[]>([])
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [vectorStoreId, setVectorStoreId] = useState<string | null>(null)
  const [extractionFeed, setExtractionFeed] = useState<ExtractionFeedItem[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionTimeMs, setExtractionTimeMs] = useState(0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [sourceModal, setSourceModal] = useState<SourceModalData | null>(null)
  const [showTestUI, setShowTestUI] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isExtracting) {
      interval = setInterval(() => {
        setExtractionTimeMs(prev => prev + 100);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExtracting]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);

    // Check for duplicates
    const uniqueNewFiles = newFiles.filter(nf =>
      !queuedFiles.some(qf => qf.name === nf.name) &&
      !files.some(f => f.name === nf.name)
    );

    setQueuedFiles(prev => [...prev, ...uniqueNewFiles]);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploadToVectorStore = async () => {
    if (queuedFiles.length === 0) return;

    setIsUploading(true);
    uploadStartTimeRef.current = Date.now();

    const newFileEntries = queuedFiles.map(f => ({
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(2) + " MB",
      status: "Uploading...",
      icon: f.name.endsWith('.pdf') ? "description" : "receipt_long",
      statusIcon: "more_horiz",
      statusColor: "text-slate-400",
      opacity: "opacity-70"
    }));

    setFiles(prev => [...prev, ...newFileEntries]);

    const formData = new FormData();
    queuedFiles.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        setVectorStoreId(data.vector_store_id);
        setQueuedFiles([]); // Clear queue on success
        setFiles(prev => prev.map(f =>
          newFileEntries.find(nf => nf.name === f.name)
            ? { ...f, status: "Processed", statusIcon: "check_circle", statusColor: "text-green-500", opacity: "" }
            : f
        ));
      } else {
        showToast("Upload failed: " + JSON.stringify(data.errors), 'error');
        setFiles(prev => prev.filter(f => !newFileEntries.find(nf => nf.name === f.name)));
      }
    } catch (err) {
      console.error(err);
      showToast("Error uploading files", 'error');
    } finally {
      setIsUploading(false);
    }
  }

  const runExtraction = async () => {
    if (!vectorStoreId) {
      showToast("Please upload a file first.", 'warning');
      return;
    }

    setIsExtracting(true);
    setExtractionProgress(0);
    setExtractionTimeMs(0);
    const activeKeys = keys.filter(k => selectedPrompts[k]);

    setExtractionFeed(activeKeys.map(k => ({ title: k, status: "WAITING..." })));

    // Process in batches of 7 to avoid OpenAI rate limit exhaustion while optimizing speed
    const batchSize = EXTRACTION_BATCH_SIZE;
    let completedKeys = 0;

    // Accumulate answers to provide context to subsequent batches
    const accumulatedAnswers: Record<string, any> = {};

    for (let i = 0; i < activeKeys.length; i += batchSize) {
      const batch = activeKeys.slice(i, i + batchSize);

      // Update ui to show fetching for this current batch
      setExtractionFeed(prev => prev.map(feed =>
        batch.includes(feed.title) ? { ...feed, status: "FETCHING..." } : feed
      ));

      const batchPrompts: Record<string, string> = {};
      batch.forEach(k => batchPrompts[k] = texts[k]);

      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchPrompts, vectorStoreId, contextData: accumulatedAnswers })
        });
        const data = await res.json();

        let batchResults: Record<string, any> = {};
        if (res.ok && data.raw) {
          try {
            batchResults = JSON.parse(data.raw);
          } catch (e) {
            console.error("Failed to parse batch json payload", data.raw);
          }
        }

        // REFINEMENT POST-PROCESSING STEP
        setExtractionFeed(prev => prev.map(feed =>
          batch.includes(feed.title) ? { ...feed, status: "REFINING..." } : feed
        ));

        let finalResultsToRender = batchResults;

        try {
          const refinePromise = await fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawJson: JSON.stringify(batchResults) })
          });

          const refineData = await refinePromise.json();
          if (refinePromise.ok && refineData.refinedJson) {
            try {
              const parsedRefined: Record<string, any> = JSON.parse(refineData.refinedJson);

              // Re-inject the metadata since the refinement agent often strips it
              for (const key of Object.keys(parsedRefined)) {
                if (batchResults[key]) {
                  // If refinement flattened the value to a primitive, wrap it so metadata can be attached
                  if (typeof parsedRefined[key] !== 'object' || parsedRefined[key] === null) {
                    parsedRefined[key] = { data: parsedRefined[key] };
                  }
                  const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
                  for (const mKey of metaKeys) {
                    if (batchResults[key][mKey] !== undefined) {
                      parsedRefined[key][mKey] = batchResults[key][mKey];
                    }
                  }
                }
              }

              finalResultsToRender = parsedRefined;
            } catch (e) {
              console.warn("Failed to parse refined JSON payload, falling back to raw.", refineData.refinedJson);
            }
          } else {
            console.warn("Refinement API returned error, skipping refine step:", refineData.error);
          }
        } catch (refineErr) {
          console.error("Refinement API request failed, skipping refine step:", refineErr);
        }

        // RED TEAM VALIDATION POST-PROCESSING STEP
        const tableKeys = batch.filter(k => k.includes('table'));
        if (tableKeys.length > 0) {
          setExtractionFeed(prev => prev.map(feed =>
            tableKeys.includes(feed.title) ? { ...feed, status: "VALIDATING..." } : feed
          ));

          await Promise.all(tableKeys.map(async (key) => {
            const rawObj = (finalResultsToRender as any)[key];
            if (!rawObj || Object.keys(rawObj).length === 0) return;

            const sourceQuote = rawObj.source_quote;

            try {
              const validatePromise = await fetch('/api/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyName: key, extractedData: rawObj, sourceQuote })
              });

              const validateData = await validatePromise.json();
              if (validatePromise.ok && validateData.validatedData) {
                const validatedObj = validateData.validatedData;
                // Preserve metadata
                const metaKeys = ['confidence_score', 'source_quote', 'source_file', 'source_page', 'source_section'];
                for (const mKey of metaKeys) {
                  if (rawObj[mKey] !== undefined) validatedObj[mKey] = rawObj[mKey];
                }
                (finalResultsToRender as any)[key] = validatedObj;
              } else {
                console.warn(`Validation API returned error for ${key}:`, validateData.error);
              }
            } catch (valErr) {
              console.error(`Validation API request failed for ${key}:`, valErr);
            }
          }));
        }


        setExtractionFeed(prev => prev.map(feed => {
          if (!batch.includes(feed.title)) return feed;

          const rawFinalObj = (finalResultsToRender as any)[feed.title] || {};

          // Extract metadata before stripping
          const confidenceScore = rawFinalObj.confidence_score;
          const sourceQuote = rawFinalObj.source_quote;
          const sourceFile = rawFinalObj.source_file;
          const sourcePage = rawFinalObj.source_page;
          const sourceSection = rawFinalObj.source_section;

          // Clone to avoid mutating the shared reference, then strip metadata/citation keys
          const keysToRemove: string[] = [...CITATION_KEYS_TO_REMOVE];
          const cleanObj: Record<string, unknown> = {};
          for (const k of Object.keys(rawFinalObj)) {
            if (!keysToRemove.includes(k)) {
              cleanObj[k] = rawFinalObj[k];
            }
          }

          let extractedText = "Failed to extract.";
          const dataObj = cleanObj.data !== undefined ? cleanObj.data : cleanObj;

          // Handle both primitives and objects safely
          if (dataObj !== null && dataObj !== undefined && typeof dataObj !== 'object') {
            // dataObj is a primitive (string, number, boolean)
            extractedText = String(dataObj);
            accumulatedAnswers[feed.title] = dataObj;
          } else if (dataObj !== null && typeof dataObj === 'object' && Object.keys(dataObj).length > 0) {
            extractedText = JSON.stringify(dataObj, null, 2);
            // Accumulate successfully parsed object for next batch context
            Object.assign(accumulatedAnswers, dataObj);
          } else {
            extractedText = res.ok ? "AI returned empty for this key." : data.error || "Failed.";
          }

          return { ...feed, status: "COMPLETED", data: extractedText, parsedObj: dataObj, confidenceScore, sourceQuote, sourceFile, sourcePage, sourceSection };
        }));

      } catch (e) {
        console.error("Batch extraction failed:", e);
        setExtractionFeed(prev => prev.map(feed =>
          batch.includes(feed.title) ? { ...feed, status: "COMPLETED", data: "Error extracting." } : feed
        ));
      }

      completedKeys += batch.length;
      setExtractionProgress(Math.min(100, Math.round((completedKeys / activeKeys.length) * 100)));
    }

    setIsExtracting(false);
  }

  const generateReport = async () => {
    setIsGenerating(true);
    const genStartTime = Date.now();
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: currentFetchedAnswers, mappingName })
      });

      if (res.ok) {
        const blob = await res.blob();

        const contentDisposition = res.headers.get('Content-Disposition');
        let filename = "Generated_Documents.zip";
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          if (match && match[1]) {
            filename = match[1];
          }
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        // Log time-spent from upload to final document
        const totalTimeSeconds = uploadStartTimeRef.current
          ? Math.round((Date.now() - uploadStartTimeRef.current) / 1000)
          : null;
        const genTimeSeconds = Math.round((Date.now() - genStartTime) / 1000);
        fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'REPORT_GENERATED',
            details: {
              mappingName,
              generationTimeSec: genTimeSeconds,
              totalPipelineTimeSec: totalTimeSeconds,
              filename
            }
          })
        }).catch(() => {});
      } else {
        showToast("Report generation failed.", 'error');
      }
    } catch (e) {
      console.error(e);
      showToast("Error generating report", 'error');
    } finally {
      setIsGenerating(false);
    }
  }

  const [refiningKey, setRefiningKey] = useState<string | null>(null);
  const [refineInstructions, setRefineInstructions] = useState<Record<string, string>>({});

  const handleRefine = async (key: string, rawJson: string, directInstructions?: string) => {
    if (!vectorStoreId) {
      showToast("Please upload standard reference documents to refine.", 'warning');
      return;
    }
    setRefiningKey(key);
    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawJson,
          userInstructions: directInstructions || refineInstructions[key] || "",
          vectorStoreId
        })
      });
      const data = await res.json();
      if (res.ok && data.refinedJson) {
        const refinedObj = JSON.parse(data.refinedJson);
        const extractedText = typeof refinedObj === 'object' && refinedObj !== null
          ? JSON.stringify(refinedObj, null, 2)
          : String(refinedObj);
        setExtractionFeed(prev => prev.map(feed => {
          if (feed.title !== key) return feed;
          // Preserve existing metadata through refinement
          return { ...feed, data: extractedText, parsedObj: refinedObj };
        }));
      } else {
        showToast("Refinement failed.", 'error');
      }
    } catch (e) {
      console.error("Refinement error", e);
      showToast("Error during refinement.", 'error');
    } finally {
      setRefiningKey(null);
    }
  };

  const renderEditableData = (feed: any) => {
    if (!feed.parsedObj) return null;
    if (typeof feed.parsedObj !== 'object' || feed.parsedObj === null) return null;

    return (
      <JsonEditor
        data={feed.parsedObj}
        onUpdate={(newVal) => {
          setExtractionFeed(prev => prev.map(f =>
            f.title === feed.title ? { ...f, parsedObj: newVal, data: JSON.stringify(newVal, null, 2) } : f
          ));
        }}
        onRequestAIRefine={(instructions) => {
          handleRefine(feed.title, JSON.stringify(feed.parsedObj), instructions);
        }}
        isRefining={refiningKey === feed.title}
      />
    );
  };

  // ⚡ Bolt: Memoize expensive array filter/reduce to prevent main thread blocking
  // Impacts extraction time metrics by preventing 100ms interval ticks from causing
  // an O(n) recalculation on extractionFeed arrays.
  const currentFetchedAnswers = useMemo(() => {
    return extractionFeed
      .filter(f => f.status === 'COMPLETED' && f.parsedObj)
      .reduce((acc, feed) => {
        const keyIndex = keys.indexOf(feed.title);
        let finalKey = feed.title;
        if (keyIndex !== -1) {
          const m = mapping[String(keyIndex + 1) as keyof typeof mapping] as any;
          if (m) {
            if (m.placeholder) finalKey = m.placeholder;
            else if (m.table_placeholder) finalKey = m.table_placeholder.replace(/^{{/, '').replace(/}}$/, '');
          }
        }
        return { ...acc, [finalKey]: feed.parsedObj };
      }, {});
  }, [extractionFeed, keys, mapping]);

  // ⚡ Bolt: Memoize Chatbot callback to preserve reference stability.
  // Prevents heavy child component <Chatbot /> from re-rendering on every interval tick.
  const handleChatbotUpdate = useCallback((keyToUpdate: string, newValue: any) => {
    setExtractionFeed(prev => prev.map(feed => {
      const keyIndex = keys.indexOf(feed.title);
      let finalKey = feed.title;
      if (keyIndex !== -1) {
        const m = mapping[String(keyIndex + 1) as keyof typeof mapping] as any;
        if (m) {
          if (m.placeholder) finalKey = m.placeholder;
          else if (m.table_placeholder) finalKey = m.table_placeholder.replace(/^{{/, '').replace(/}}$/, '');
        }
      }

      if (finalKey === keyToUpdate) {
        return {
          ...feed,
          parsedObj: newValue,
          data: typeof newValue === 'object' ? JSON.stringify(newValue, null, 2) : String(newValue)
        };
      }
      return feed;
    }));
  }, [keys, mapping]);

  return (
    <div className="flex flex-col h-full w-full relative gradient-mesh">
      <motion.header
        variants={fadeInDown}
        initial="hidden"
        animate="visible"
        className="flex items-center justify-between border-b border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] bg-[var(--color-surface-light)] dark:bg-[var(--color-surface-dark)] px-6 py-3 shrink-0 glass"
      >
        <div className="flex items-center gap-6">
          <img src="/krystelis_logo.svg" alt="Krystelis Logo" className="h-10 w-auto object-contain" />
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700">
            <span className="material-symbols-outlined text-[13px] text-slate-500">bolt</span>
            <span className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">Powered by OpenAI</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <span className="material-symbols-outlined text-[16px]">person</span>
              Hi, {user.name}
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            System Online
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowTestUI(true)}
            className="flex items-center gap-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">science</span>
            <span>Test Pipeline</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={generateReport}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-lg">description</span>
            )}
            <span>{isGenerating ? "Generating..." : "Generate Word Document"}</span>
          </motion.button>
        </div>
      </motion.header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <motion.aside
          variants={slideInLeft}
          initial="hidden"
          animate="visible"
          className="w-96 border-r border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] bg-[var(--color-surface-light)] dark:bg-[var(--color-surface-dark)] flex flex-col shrink-0 overflow-y-auto custom-scrollbar"
        >
          <div className="p-6 flex flex-col gap-6">

            {/* Configuration */}
            <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Configuration</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mapping Profile</label>
                  <select
                    value={mappingName}
                    onChange={(e) => setMappingName(e.target.value)}
                    className="w-full rounded-md border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm p-2 outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="results_PLS">Results PLS</option>
                    <option value="protocol_PLS">Protocol PLS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Readability Level</label>
                  <select
                    value={readabilityLevel}
                    onChange={(e) => setReadabilityLevel(e.target.value)}
                    className="w-full rounded-md border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm p-2 outline-none focus:border-[var(--color-primary)]"
                  >
                    <option value="2nd Grade">2nd Grade</option>
                    <option value="4th Grade">4th Grade</option>
                    <option value="6th Grade">6th Grade</option>
                    <option value="Non-technical Healthcare Professional">Non-technical Healthcare Professional</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Upload Zone */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</h3>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-[var(--color-primary)]/50 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-800/50"
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".pdf,.docx,.txt"
                />
                <span className="material-symbols-outlined text-3xl text-[var(--color-primary)]">
                  note_add
                </span>
                <div className="text-center text-sm">
                  <p className="font-medium text-slate-900 dark:text-white">
                    Select Documents
                  </p>
                  <p className="text-slate-500 text-xs mt-1">Add files to queue</p>
                </div>
              </div>

              {queuedFiles.length > 0 && (
                <button
                  onClick={uploadToVectorStore}
                  disabled={isUploading}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                  )}
                  {isUploading ? "Uploading..." : `Upload ${queuedFiles.length} File${queuedFiles.length > 1 ? 's' : ''} to Vector Store`}
                </button>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={runExtraction}
                disabled={isUploading || !vectorStoreId || isExtracting || queuedFiles.length > 0}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {isExtracting ? "Extracting..." : "Run AI Extraction"}
              </motion.button>
            </div>

            {/* AI Prompts Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">lightbulb</span>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Prompts</h3>
                </div>
                <button
                  onClick={() => {
                    const allSelected = keys.every(k => selectedPrompts[k]);
                    const newSelections: Record<string, boolean> = {};
                    keys.forEach(k => newSelections[k] = !allSelected);
                    setSelectedPrompts(newSelections);
                  }}
                  className="text-xs text-[var(--color-primary)] hover:underline font-medium">
                  Toggle All
                </button>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {keys.map(key => (
                  <label key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 cursor-pointer border border-transparent hover:border-[var(--color-primary)]/20 group">
                    <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate pr-2">{key.replace(/_/g, ' ')}</span>
                    <input
                      checked={!!selectedPrompts[key]}
                      onChange={(e) => setSelectedPrompts({ ...selectedPrompts, [key]: e.target.checked })}
                      className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] h-3.5 w-3.5"
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Uploaded Files List */}
            {(queuedFiles.length > 0 || files.length > 0) && (
              <div className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Files</h3>
                <div className="space-y-2">
                  {queuedFiles.map((file, idx) => (
                    <div key={`q-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-900/10`}>
                      <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">{file.name.endsWith('.pdf') ? "description" : "receipt_long"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-amber-600/70">{(file.size / 1024 / 1024).toFixed(2)} MB • Queued</p>
                      </div>
                      <button onClick={() => setQueuedFiles(prev => prev.filter(f => f.name !== file.name))} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Remove file">
                        <span className="material-symbols-outlined text-lg block">close</span>
                      </button>
                    </div>
                  ))}

                  {files.map((file, idx) => (
                    <div key={`f-${idx}`} className={`flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 ${file.opacity}`}>
                      <div className="w-10 h-10 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-lg flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined">{file.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">{file.size} • {file.status}</p>
                      </div>
                      <span className={`material-symbols-outlined ${file.statusColor} text-xl`}>{file.statusIcon}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.aside>

        {/* Main Workspace - Single Column Editing Feed */}
        <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col gap-3 shadow-sm z-10">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--color-primary)]">edit_document</span>
                AI Extraction & Refinement Feed
              </h2>
              <div className="flex items-center gap-3">
                {extractionTimeMs > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-300 text-xs font-mono font-medium">
                    <span className="material-symbols-outlined text-[14px]">timer</span>
                    {formatTime(extractionTimeMs)}
                  </div>
                )}
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] italic">Live Interactive Document</span>
              </div>
            </div>

            {/* Progress Bar */}
            {(isExtracting || (extractionProgress === 100 && extractionFeed.length > 0)) && (
              <div className="w-full space-y-1.5">
                <div className="flex justify-between items-center text-xs font-medium text-slate-500">
                  <span>{isExtracting ? 'Extracting Data...' : 'Extraction Complete'}</span>
                  <span>{extractionProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    className={`bg-[var(--color-primary)] h-1.5 rounded-full ${isExtracting ? 'progress-glow' : ''}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${extractionProgress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="max-w-4xl mx-auto space-y-6"
            >
              {extractionFeed.length === 0 ? (
                <motion.div
                  variants={staggerItem}
                  className="flex flex-col items-center justify-center h-64 text-slate-500 border-2 border-dashed border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] rounded-xl"
                >
                  <span className="material-symbols-outlined text-4xl mb-2 text-slate-300 dark:text-slate-600">article</span>
                  <p className="text-sm font-medium">Run AI Extraction to begin building the document.</p>
                </motion.div>
              ) : (
                extractionFeed.map((feed, idx) => (
                  <motion.div
                    key={idx}
                    variants={staggerItem}
                    layout
                    className={`bg-[var(--color-surface-light)] dark:bg-[var(--color-surface-dark)] rounded-xl border border-[var(--color-border-light)] dark:border-[var(--color-border-dark)] p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-shadow ${feed.status === 'FETCHING...' ? 'border-l-4 border-l-[var(--color-primary)]' : ''}`}
                  >
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-[var(--color-primary)] uppercase tracking-wide flex items-center gap-2">
                          {feed.title.replace(/_/g, ' ')}
                        </h3>
                        {feed.confidenceScore !== undefined && (
                          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${feed.confidenceScore >= 85 ? 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20' : feed.confidenceScore >= 70 ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'}`} title="AI Confidence Score (Based on Source Alignment)">
                            <span className="material-symbols-outlined text-[12px]">
                              {feed.confidenceScore >= 85 ? 'verified' : 'warning'}
                            </span>
                            {feed.confidenceScore}% CONFIDENCE
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {feed.sourceQuote && (
                          <button
                            onClick={() => setSourceModal({ quote: feed.sourceQuote ?? '', file: feed.sourceFile || 'Unknown', section: feed.sourceSection || 'Unknown', page: feed.sourcePage || 'Unknown' })}
                            className="text-[10px] font-bold text-slate-500 hover:text-[var(--color-primary)] bg-slate-100 dark:bg-slate-800 hover:bg-[var(--color-primary)]/10 px-2.5 py-1 flex items-center gap-1 rounded transition-colors mr-2 border border-transparent hover:border-[var(--color-primary)]/20"
                            title="View source quote"
                          >
                            <span className="material-symbols-outlined text-[13px]">format_quote</span>
                            VIEW SOURCE
                          </button>
                        )}
                        {feed.status === 'FETCHING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse"></div>
                            <span className="text-[10px] font-bold text-[var(--color-primary)]">EXTRACTING</span>
                          </div>
                        ) : feed.status === 'REFINING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 dark:bg-amber-900/20 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-amber-500">REFINING</span>
                          </div>
                        ) : feed.status === 'WAITING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                            <span className="material-symbols-outlined text-[12px] opacity-50 px-0.5">more_horiz</span>
                            <span className="text-[10px] font-bold text-slate-500">QUEUED</span>
                          </div>
                        ) : feed.status === 'VALIDATING...' ? (
                          <div className="flex items-center gap-2 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-100 dark:border-purple-800">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-purple-600">VALIDATING</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/20 shadow-sm border border-green-200 px-2 py-1 rounded flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check</span> READY
                          </span>
                        )}
                      </div>
                    </div>

                    {feed.status === 'FETCHING...' || feed.status === 'WAITING...' || feed.status === 'REFINING...' || feed.status === 'VALIDATING...' ? (
                      <div className={`space-y-3 ${feed.status === 'WAITING...' ? 'opacity-30' : ''}`}>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full skeleton-shimmer"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-5/6 skeleton-shimmer"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-4/6 skeleton-shimmer"></div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Primitive value: simple textarea */}
                        {feed.parsedObj !== null && feed.parsedObj !== undefined && typeof feed.parsedObj !== 'object' ? (
                          <>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-800 relative group">
                              <textarea
                                className="w-full bg-transparent text-sm text-slate-700 dark:text-slate-300 resize-none outline-none min-h-[60px]"
                                value={String(feed.parsedObj)}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  setExtractionFeed(prev => prev.map(f =>
                                    f.title === feed.title ? { ...f, data: newVal, parsedObj: newVal } : f
                                  ));
                                }}
                                rows={feed.data ? feed.data.split('\n').length : 3}
                              />
                            </div>
                            {/* Refine bar for primitive-only data */}
                            <div className="flex gap-2 items-center bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                              <span className="material-symbols-outlined text-indigo-500 text-lg shrink-0">auto_awesome</span>
                              <input
                                type="text"
                                placeholder="Optional: instructions for AI refinement"
                                className="flex-1 text-xs px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 outline-none focus:border-indigo-400"
                                value={refineInstructions[feed.title] || ""}
                                onChange={(e) => setRefineInstructions(prev => ({ ...prev, [feed.title]: e.target.value }))}
                              />
                              <button
                                onClick={() => handleRefine(feed.title, JSON.stringify(feed.parsedObj))}
                                disabled={refiningKey === feed.title}
                                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[14px]">{refiningKey === feed.title ? 'hourglass_empty' : 'auto_fix_high'}</span>
                                {refiningKey === feed.title ? 'Refining...' : 'Refine with AI'}
                              </button>
                            </div>
                          </>
                        ) : (
                          /* Complex data: delegate entirely to JsonEditor (which has its own AI expansion bar) */
                          renderEditableData(feed)
                        )}
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>
        </main>
      </div>

      {/* View Source Modal */}
      <AnimatePresence>
        {sourceModal && (
          <>
            <motion.div
              key="source-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSourceModal(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              key="source-panel"
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="pointer-events-auto w-full max-w-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/30 dark:border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-r from-[var(--color-primary)]/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-[20px]">format_quote</span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wide">Source Document Proof</h3>
                  </div>
                  <button onClick={() => setSourceModal(null)} className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                    <span className="material-symbols-outlined text-slate-500 text-[20px]">close</span>
                  </button>
                </div>

                {/* Quote */}
                <div className="px-5 py-4 max-h-[50vh] overflow-y-auto custom-scrollbar">
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 italic border-l-3 border-[var(--color-primary)]/40 pl-4">
                    &ldquo;{sourceModal.quote}&rdquo;
                  </p>
                </div>

                {/* Metadata */}
                <div className="px-5 py-3 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40 grid grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <span className="block font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">File</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{sourceModal.file}</span>
                  </div>
                  <div>
                    <span className="block font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Section</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{sourceModal.section}</span>
                  </div>
                  <div>
                    <span className="block font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Page</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">{sourceModal.page}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pipeline Test UI Modal */}
      <AnimatePresence>
        {showTestUI && (
          <PipelineTestUI onClose={() => setShowTestUI(false)} />
        )}
      </AnimatePresence>

      {/* Floating Chatbot Widget */}
      <Chatbot
        vectorStoreId={vectorStoreId}
        fetchedAnswers={currentFetchedAnswers}
        onUpdateData={handleChatbotUpdate}
      />
    </div>
  )
}

