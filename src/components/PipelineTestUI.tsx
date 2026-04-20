"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { JsonEditor } from './JsonEditor'

// Mock responses from the test script
const MOCK_RESPONSES: Record<string, any> = {
  title: { title: "A clinical trial to learn more about the effects of ABC123 in people with hypertension" },
  health_condition: { "Health condition": "Plaque psoriasis" },
  drug_code: { "Drug code": "ABC123" },
  primary_endpoint: { "Primary endpoint": ["90% improvement at Week 16?", "Change in blood sugar at Week 24?"] },
  inclusion_criteria: { inclusion_criteria: ["have plaque psoriasis", "are 18+", "tried other treatments"] },
  race: { race_table: { headers: ["Race", "Number"], rows: [["White", "150"], ["Asian", "45"]] } },
  treatment: { treatment_summary: "Received one of these treatments.", groups: [{ name: "ABC123 120mg", participants: 150 }, { name: "Placebo", participants: 150 }], total_participants: 300 },
  efficacy_primary_endpoint_results_conclusion: { chart_data: [{ question: "90% improvement?", primary_endpoint_results_conclusion: "More improved on ABC123.", clinical_term_definition: "PASI 90", primary_endpoint_results_assessment: "p<0.001", Primary_endpoint_results: "", data: { labels: ["ABC123", "Placebo"], datasets: [{ label: "Responders", data: ["72%", "5%"] }] } }] },
  key_secondary_endpoint_results: [{ question: "DLQI change?", answer: "Better scores." }, { question: "PASI 75?", answer: "65% vs 3%." }],
};

const MOCK_METADATA = {
  title: { source_quote: "A clinical trial to learn more about the effects of ABC123 in people with hypertension", source_file: "CSR_ABC123_2024.pdf", source_section: "Title Page", source_page: "1" },
  health_condition: { source_quote: "Plaque psoriasis is a chronic inflammatory skin disease", source_file: "CSR_ABC123_2024.pdf", source_section: "Background", source_page: "5" },
  race: { source_quote: "150 White participants, 45 Asian participants", source_file: "CSR_ABC123_2024.pdf", source_section: "Demographics", source_page: "12" },
  treatment: { source_quote: "Participants received ABC123 120mg, 240mg, or placebo", source_file: "CSR_ABC123_2024.pdf", source_section: "Study Design", source_page: "8" },
};

interface TestUIProps {
  onClose: () => void;
}

export function PipelineTestUI({ onClose }: TestUIProps) {
  const [selectedKey, setSelectedKey] = useState<string>('title');
  const [editedData, setEditedData] = useState<Record<string, any>>(MOCK_RESPONSES);
  const [sourceModal, setSourceModal] = useState<{ quote: string; file: string; section: string; page: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentMockData = editedData[selectedKey];
  const currentMetadata = MOCK_METADATA[selectedKey as keyof typeof MOCK_METADATA];

  const handleUpdate = (newVal: any) => {
    setEditedData(prev => ({
      ...prev,
      [selectedKey]: newVal
    }));
  };

  const handleViewSource = () => {
    if (currentMetadata) {
      setSourceModal({
        quote: currentMetadata.source_quote,
        file: currentMetadata.source_file,
        section: currentMetadata.source_section,
        page: currentMetadata.source_page,
      });
    }
  };

  const handleGenerateDocument = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'test-pipeline-output.docx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to generate document');
      }
    } catch (error) {
      console.error('Error generating document:', error);
      alert('Error generating document');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-6xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-transparent dark:from-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Pipeline Test UI</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">View mock data shapes, test rendering, and generate Word documents</p>
          </div>
          <button
            aria-label="Close test UI"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
          >
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - Data Shape Selector */}
          <div className="w-48 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-y-auto p-4 space-y-2">
            {Object.keys(MOCK_RESPONSES).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedKey === key
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Main Content - Editor */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedKey}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Edit and preview data rendering</p>
              </div>
              {currentMetadata && (
                <button
                  onClick={handleViewSource}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">format_quote</span>
                  View Source
                </button>
              )}
            </div>

            {currentMockData && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <JsonEditor
                  data={currentMockData}
                  onUpdate={handleUpdate}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {Object.keys(MOCK_RESPONSES).length} mock data shapes available
          </p>
          <button
            onClick={handleGenerateDocument}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {isGenerating ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
            ) : (
              <span className="material-symbols-outlined text-[18px]">description</span>
            )}
            Generate Word Document
          </button>
        </div>
      </motion.div>

      {/* Source Modal */}
      <AnimatePresence>
        {sourceModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSourceModal(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="pointer-events-auto w-full max-w-lg bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white/30 dark:border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-r from-blue-500/5 to-transparent">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500 text-[20px]">format_quote</span>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Source Document Proof</h3>
                  </div>
                  <button aria-label="Close source modal" onClick={() => setSourceModal(null)} className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/60 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                    <span aria-hidden="true" className="material-symbols-outlined text-slate-500 text-[20px]">close</span>
                  </button>
                </div>
                <div className="px-5 py-4 max-h-[50vh] overflow-y-auto">
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 italic border-l-3 border-blue-500/40 pl-4">
                    &ldquo;{sourceModal.quote}&rdquo;
                  </p>
                </div>
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
    </motion.div>
  );
}

