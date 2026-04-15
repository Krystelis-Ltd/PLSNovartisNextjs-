"use client"

import React, { useState } from 'react'

interface JsonEditorProps {
  data: any
  onUpdate: (newData: any) => void
  onRequestAIRefine?: (instructions: string) => void
  isRefining?: boolean
}

export function JsonEditor({ data, onUpdate, onRequestAIRefine, isRefining }: JsonEditorProps) {
  const [tableRefinePrompt, setTableRefinePrompt] = useState("")

  const cloneAndNavigate = (path: string[]) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData
    for (const key of path) { current = current[key] }
    return { newData, current }
  }

  const updateNestedValue = (path: string[], newValue: any) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }
    const lastKey = path[path.length - 1]
    const oldValue = current[lastKey]
    if (typeof oldValue === 'number' && !isNaN(Number(newValue)) && newValue !== '') {
      current[lastKey] = Number(newValue)
    } else {
      current[lastKey] = newValue
    }
    onUpdate(newData)
  }

  // --- headers/rows table ops ---
  const addTableRow = (path: string[], colCount: number) => {
    const { newData, current } = cloneAndNavigate(path)
    current.rows.push(Array(colCount).fill(""))
    onUpdate(newData)
  }
  const removeTableRow = (path: string[], rowIdx: number) => {
    const { newData, current } = cloneAndNavigate(path)
    current.rows.splice(rowIdx, 1)
    onUpdate(newData)
  }
  const addTableColumn = (path: string[]) => {
    const { newData, current } = cloneAndNavigate(path)
    current.headers.push(`Column ${current.headers.length + 1}`)
    current.rows.forEach((row: any[]) => row.push(""))
    onUpdate(newData)
  }
  const removeTableColumn = (path: string[], colIdx: number) => {
    const { newData, current } = cloneAndNavigate(path)
    current.headers.splice(colIdx, 1)
    current.rows.forEach((row: any[]) => row.splice(colIdx, 1))
    onUpdate(newData)
  }

  // --- array-of-objects table ops ---
  const addArrObjRow = (path: string[], template: Record<string, any>) => {
    const { newData, current } = cloneAndNavigate(path)
    if (Array.isArray(current)) {
      const emptyRow: Record<string, any> = {}
      for (const k of Object.keys(template)) emptyRow[k] = ""
      current.push(emptyRow)
    }
    onUpdate(newData)
  }
  const removeArrObjRow = (path: string[], rowIdx: number) => {
    const { newData, current } = cloneAndNavigate(path)
    if (Array.isArray(current)) current.splice(rowIdx, 1)
    onUpdate(newData)
  }
  const addArrObjColumn = (path: string[], colName: string) => {
    const { newData, current } = cloneAndNavigate(path)
    if (Array.isArray(current)) current.forEach((item: any) => { item[colName] = "" })
    onUpdate(newData)
  }
  const removeArrObjColumn = (path: string[], colKey: string) => {
    const { newData, current } = cloneAndNavigate(path)
    if (Array.isArray(current)) current.forEach((item: any) => { delete item[colKey] })
    onUpdate(newData)
  }

  // Only match arrays of "flat" objects where all values are primitives — not nested objects/arrays
  const isArrayOfFlatObjects = (val: any): boolean =>
    Array.isArray(val) && val.length > 0 && val.every((item: any) =>
      typeof item === 'object' && item !== null && !Array.isArray(item) &&
      Object.values(item).every((v: any) => v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    )

  const isHeadersRowsTable = (val: any): boolean =>
    val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.headers) && Array.isArray(val.rows)

  const isChartData = (val: any): boolean =>
    val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.labels) && Array.isArray(val.datasets)

  const isArrayOfPrimitives = (val: any): boolean =>
    Array.isArray(val) && (val.length === 0 || val.every((item: any) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'))

  // ─── Helpers ───
  /** Compute textarea rows based on content — auto-expand for long text */
  const autoRows = (text: string, minRows = 1, colWidth = 30): number => {
    if (!text) return minRows
    const lines = text.split('\n').length
    const wrappedLines = Math.ceil(text.length / colWidth)
    return Math.max(minRows, Math.min(Math.max(lines, wrappedLines), 8))
  }

  /** Convert snake_case key to readable Title Case label */
  const toTitleCase = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  // ─── Shared table styles ───
  const thBase = "px-3 py-2.5 border-b-2 border-r border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-left"
  const thText = "text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight"
  const tdBase = "px-2 py-1.5 border-r border-b border-slate-200 dark:border-slate-700 align-top"
  const cellTextarea = "w-full bg-transparent outline-none resize-none text-sm text-slate-700 dark:text-slate-300 rounded px-2 py-1.5 transition-all focus:bg-blue-50 dark:focus:bg-slate-800 focus:ring-2 focus:ring-[var(--color-primary)]/30"
  const rowNumTd = "w-14 px-2 py-1.5 border-r border-b border-slate-300 dark:border-slate-600 text-center align-middle bg-slate-50 dark:bg-slate-800/60 sticky left-0 z-10"

  // ─── Table toolbar buttons ───
  const TableActions = ({ onAddRow, onAddCol }: { onAddRow: () => void, onAddCol: () => void }) => (
    <div className="flex items-center gap-2 pt-2">
      <button onClick={onAddRow} className="text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 px-3 py-1.5 rounded flex items-center gap-1 transition-colors border border-[var(--color-primary)]/20">
        <span className="material-symbols-outlined text-[14px]">add</span> Add Row
      </button>
      <button onClick={onAddCol} className="text-xs font-bold text-indigo-500 hover:bg-indigo-500/10 px-3 py-1.5 rounded flex items-center gap-1 transition-colors border border-indigo-500/20">
        <span className="material-symbols-outlined text-[14px]">view_column</span> Add Column
      </button>
    </div>
  )

  // ─── headers/rows spreadsheet ───
  const renderSpreadsheet = (value: { headers: string[], rows: any[][] }, path: string[]) => (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className={`w-14 px-2 py-2.5 border-b-2 border-r border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 sticky left-0 z-10`}>#</th>
              {value.headers.map((h: string, ci: number) => (
                <th key={ci} className={`${thBase} min-w-[160px] group`}>
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={String(h)} onChange={(e) => updateNestedValue([...path, 'headers', String(ci)], e.target.value)}
                      className={`w-full bg-transparent outline-none ${thText} py-0.5 focus:ring-2 focus:ring-[var(--color-primary)]/30 rounded px-1`} />
                    <button aria-label="Remove column" onClick={() => removeTableColumn(path, ci)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity" title="Remove column">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-12 border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-center">
                <button aria-label="Add column" onClick={() => addTableColumn(path)} className="text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded p-1.5 transition-colors" title="Add column">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row: any[], ri: number) => (
              <tr key={ri} className={`${ri % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-800/30'} group hover:bg-blue-50/50 dark:hover:bg-slate-700/30 transition-colors`}>
                <td className={rowNumTd}>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{ri + 1}</span>
                    <button aria-label="Remove row" onClick={() => removeTableRow(path, ri)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity" title="Remove row">
                      <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                    </button>
                  </div>
                </td>
                {row.map((cell: any, ci: number) => (
                  <td key={ci} className={tdBase}>
                    <textarea value={String(cell ?? "")} onChange={(e) => updateNestedValue([...path, 'rows', String(ri), String(ci)], e.target.value)}
                      className={cellTextarea} rows={autoRows(String(cell ?? ""), 1, 35)} />
                  </td>
                ))}
                <td className="w-12 border-b border-slate-200 dark:border-slate-700"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions onAddRow={() => addTableRow(path, value.headers.length)} onAddCol={() => addTableColumn(path)} />
    </div>
  )

  // ─── array-of-objects table ───
  const renderArrayTable = (arr: Record<string, any>[], path: string[]) => {
    const allKeys = Array.from(new Set(arr.flatMap(item => Object.keys(item))))
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm custom-scrollbar">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr>
                <th className={`w-14 px-2 py-2.5 border-b-2 border-r border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 sticky left-0 z-10`}>#</th>
                {allKeys.map((key, ci) => (
                  <th key={ci} className={`${thBase} min-w-[160px] group`}>
                    <div className="flex items-center gap-1.5">
                      <span className={thText}>{toTitleCase(key)}</span>
                      {allKeys.length > 1 && (
                        <button aria-label="Remove column" onClick={() => removeArrObjColumn(path, key)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity" title="Remove column">
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-12 border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-center">
                  <button aria-label="Add column" onClick={() => { const n = prompt("Column name:"); if (n?.trim()) addArrObjColumn(path, n.trim()) }}
                    className="text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded p-1.5 transition-colors" title="Add column">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {arr.map((item, ri) => (
                <tr key={ri} className={`${ri % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-800/30'} group hover:bg-blue-50/50 dark:hover:bg-slate-700/30 transition-colors`}>
                  <td className={rowNumTd}>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">{ri + 1}</span>
                      <button aria-label="Remove row" onClick={() => removeArrObjRow(path, ri)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity" title="Remove row">
                        <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                      </button>
                    </div>
                  </td>
                  {allKeys.map((key) => (
                    <td key={key} className={tdBase}>
                      {typeof item[key] === 'object' && item[key] !== null ? (
                        <div className="p-1">{renderValue(item[key], [...path, String(ri), key])}</div>
                      ) : (
                        <textarea value={String(item[key] ?? "")} onChange={(e) => updateNestedValue([...path, String(ri), key], e.target.value)}
                          className={cellTextarea} rows={autoRows(String(item[key] ?? ""), 1, 35)} />
                      )}
                    </td>
                  ))}
                  <td className="w-12 border-b border-slate-200 dark:border-slate-700"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TableActions onAddRow={() => addArrObjRow(path, arr[0] || {})} onAddCol={() => { const n = prompt("Column name:"); if (n?.trim()) addArrObjColumn(path, n.trim()) }} />
      </div>
    )
  }

  // ─── chart data (labels/datasets) table ───
  const renderChartTable = (cd: { labels: string[], datasets: { label: string, data: any[] }[] }, path: string[]) => (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr>
              <th className={`${thBase} min-w-[180px] sticky left-0 z-10`}>
                <span className={thText}>Category</span>
              </th>
              {cd.labels?.map((l: string, li: number) => (
                <th key={li} className={`${thBase} min-w-[120px] group`}>
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={l} onChange={(e) => updateNestedValue([...path, 'labels', String(li)], e.target.value)}
                      className={`w-full bg-transparent outline-none ${thText} text-center py-0.5 focus:ring-2 focus:ring-[var(--color-primary)]/30 rounded px-1`} />
                    <button aria-label="Remove column" onClick={() => { const { newData, current } = cloneAndNavigate(path); current.labels.splice(li, 1); current.datasets.forEach((ds: any) => ds.data.splice(li, 1)); onUpdate(newData) }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity" title="Remove column">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-12 border-b-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-center">
                <button aria-label="Add column" onClick={() => { const { newData, current } = cloneAndNavigate(path); current.labels.push(`Label ${current.labels.length + 1}`); current.datasets.forEach((ds: any) => ds.data.push("")); onUpdate(newData) }}
                  className="text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded p-1.5 transition-colors" title="Add column">
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {cd.datasets?.map((ds: any, di: number) => (
              <tr key={di} className={`${di % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-800/30'} group hover:bg-blue-50/50 dark:hover:bg-slate-700/30 transition-colors`}>
                <td className={`${tdBase} sticky left-0 z-10 ${di % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'} group-hover:bg-blue-50/50 dark:group-hover:bg-slate-700/30`}>
                  <div className="flex items-center gap-1">
                    <textarea value={ds.label} onChange={(e) => updateNestedValue([...path, 'datasets', String(di), 'label'], e.target.value)}
                      className={`${cellTextarea} font-medium`} rows={autoRows(String(ds.label ?? ""), 1, 25)} />
                    <button aria-label="Remove row" onClick={() => { const { newData, current } = cloneAndNavigate(path); current.datasets.splice(di, 1); onUpdate(newData) }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity" title="Remove row">
                      <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                    </button>
                  </div>
                </td>
                {ds.data?.map((val: any, vi: number) => (
                  <td key={vi} className={tdBase}>
                    <input type="text" value={val} className={`w-full bg-transparent text-center outline-none text-sm py-1.5 rounded transition-all focus:bg-blue-50 dark:focus:bg-slate-800 focus:ring-2 focus:ring-[var(--color-primary)]/30 text-slate-700 dark:text-slate-300`}
                      onChange={(e) => { const v = e.target.value; updateNestedValue([...path, 'datasets', String(di), 'data', String(vi)], isNaN(Number(v)) || v.trim() === '' ? v : Number(v)) }} />
                  </td>
                ))}
                <td className="w-12 border-b border-slate-200 dark:border-slate-700"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions
        onAddRow={() => { const { newData, current } = cloneAndNavigate(path); current.datasets.push({ label: "New Category", data: Array(current.labels.length).fill("") }); onUpdate(newData) }}
        onAddCol={() => { const { newData, current } = cloneAndNavigate(path); current.labels.push(`Label ${current.labels.length + 1}`); current.datasets.forEach((ds: any) => ds.data.push("")); onUpdate(newData) }}
      />
    </div>
  )

  // ─── main recursive renderer ───
  const renderValue = (value: any, path: string[] = []): React.ReactNode => {
    if (value === null || value === undefined) {
      return <input type="text" value="" onChange={(e) => updateNestedValue(path, e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20" placeholder="Empty value" />
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return <textarea value={String(value)} onChange={(e) => updateNestedValue(path, e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 resize-y" rows={String(value).length > 80 ? 4 : 1} />
    }
    if (typeof value === 'boolean') {
      return <select value={String(value)} onChange={(e) => updateNestedValue(path, e.target.value === 'true')}
        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)]">
        <option value="true">True</option><option value="false">False</option>
      </select>
    }
    // Array of uniform flat objects → editable table (skip complex nested objects)
    if (isArrayOfFlatObjects(value)) return renderArrayTable(value, path)
    // Array of primitives → clean editable list with add/remove
    if (isArrayOfPrimitives(value)) {
      return (
        <div className="space-y-2">
          {value.length === 0 && <span className="text-xs italic text-slate-500">No items yet.</span>}
          {value.map((item: any, idx: number) => (
            <div key={idx} className="flex items-start gap-2 group">
              <span className="text-xs font-bold text-slate-400 mt-2.5 shrink-0 w-5 text-right">{idx + 1}.</span>
              <textarea value={String(item)} onChange={(e) => updateNestedValue([...path, String(idx)], e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 resize-y"
                rows={String(item).length > 100 ? 3 : 1} />
              <button aria-label="Remove item" onClick={() => { const newData = JSON.parse(JSON.stringify(data)); let arr = newData; for (let i = 0; i < path.length - 1; i++) arr = arr[path[i]]; const lastKey = path[path.length - 1]; if (lastKey !== undefined) arr = arr[lastKey]; if (Array.isArray(arr)) { arr.splice(idx, 1); onUpdate(newData); } }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 mt-2 shrink-0 transition-opacity" title="Remove item">
                <span className="material-symbols-outlined text-[16px]">remove_circle</span>
              </button>
            </div>
          ))}
          <button onClick={() => { const newData = JSON.parse(JSON.stringify(data)); let arr = newData; for (const k of path) arr = arr[k]; if (Array.isArray(arr)) { arr.push(""); onUpdate(newData); } }}
            className="text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 px-3 py-1.5 rounded flex items-center gap-1 transition-colors border border-[var(--color-primary)]/20 mt-1">
            <span className="material-symbols-outlined text-[14px]">add</span> Add Item
          </button>
        </div>
      )
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-xs italic text-slate-500">Empty list</span>
      return (
        <div className="space-y-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 mt-2">
          {value.map((item, idx) => (
            <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800 relative group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entry {idx + 1}</span>
                <button aria-label="Remove entry" onClick={() => { const newData = JSON.parse(JSON.stringify(data)); let arr = newData; for (const k of path) arr = arr[k]; if (Array.isArray(arr)) { arr.splice(idx, 1); onUpdate(newData); } }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity" title="Remove entry">
                  <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                </button>
              </div>
              {renderValue(item, [...path, String(idx)])}
            </div>
          ))}
        </div>
      )
    }
    if (typeof value === 'object') {
      if (isHeadersRowsTable(value)) return renderSpreadsheet(value, path)
      if (isChartData(value)) return renderChartTable(value, path)
      return (
        <div className="space-y-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700 mt-2">
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">{key.replace(/_/g, ' ')}</label>
              {renderValue(val, [...path, key])}
            </div>
          ))}
        </div>
      )
    }
    return <span className="text-xs text-slate-500">Unsupported type</span>
  }

  // ─── main component render ───
  const dataKeys = typeof data === 'object' && data !== null ? Object.keys(data) : []
  const isWrapper = dataKeys.length === 1 && typeof data[dataKeys[0]] === 'object'
  const contentToRender = isWrapper ? data[dataKeys[0]] : data
  const initialPath = isWrapper ? [dataKeys[0]] : []

  return (
    <div className="space-y-4 mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-primary)] flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">edit_note</span>
          {isWrapper ? dataKeys[0].replace(/_/g, ' ').toUpperCase() : 'Data Editor'}
        </h3>
      </div>
      <div className="pt-1">
        {/* Route special shapes directly instead of iterating their keys */}
        {isHeadersRowsTable(contentToRender) || isChartData(contentToRender) || Array.isArray(contentToRender) ? (
          renderValue(contentToRender, initialPath)
        ) : typeof contentToRender === 'object' && contentToRender !== null ? (
          Object.entries(contentToRender).map(([key, value]) => (
            <div key={key} className="space-y-1 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-lg border border-slate-100 dark:border-slate-800 mb-4">
              <label className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-wider block mb-2">{key.replace(/_/g, ' ')}</label>
              {renderValue(value, [...initialPath, key])}
            </div>
          ))
        ) : (
          renderValue(contentToRender, initialPath)
        )}
      </div>

      {/* Inline AI expansion */}
      {onRequestAIRefine && (
        <div className="flex gap-2 items-center bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
          <span className="material-symbols-outlined text-indigo-500 text-lg shrink-0">auto_awesome</span>
          <input type="text" placeholder="e.g. 'Add more rows with detailed data' or 'Add a percentage column'"
            className="flex-1 text-xs px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20"
            value={tableRefinePrompt} onChange={(e) => setTableRefinePrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && tableRefinePrompt.trim()) { onRequestAIRefine(tableRefinePrompt); setTableRefinePrompt("") } }} />
          <button onClick={() => { if (tableRefinePrompt.trim()) { onRequestAIRefine(tableRefinePrompt); setTableRefinePrompt("") } }}
            disabled={isRefining || !tableRefinePrompt.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            <span className="material-symbols-outlined text-[14px]">{isRefining ? 'hourglass_empty' : 'auto_fix_high'}</span>
            {isRefining ? 'Refining...' : 'Refine with AI'}
          </button>
        </div>
      )}
    </div>
  )
}
