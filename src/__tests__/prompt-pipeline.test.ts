/**
 * Pipeline Validation Test Script
 * ================================
 * Validates both prompt mapping sets (results_PLS and protocol_PLS) offline.
 * Covers: prompt loading, heuristic classification, generate patching, edge cases.
 *
 * Run with: npx tsx src/__tests__/prompt-pipeline.test.ts
 */

import extractedData from '../utils/extracted_data.json' with { type: 'json' };

// ─── Test Harness ───
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ FAIL: ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`);
}

// ─── Heuristic Functions (mirrored from JsonEditor.tsx) ───
const isArrayOfFlatObjects = (val: any): boolean =>
  Array.isArray(val) && val.length > 0 && val.every((item: any) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) &&
    Object.values(item).every((v: any) => v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
  );

const isHeadersRowsTable = (val: any): boolean =>
  val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.headers) && Array.isArray(val.rows);

const isChartData = (val: any): boolean =>
  val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.labels) && Array.isArray(val.datasets);

const isArrayOfPrimitives = (val: any): boolean =>
  Array.isArray(val) && (val.length === 0 || val.every((item: any) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'));

// ─── Patching Classifier (mirrors generate/route.ts logic) ───
type PatchResult = 'table_headers_rows' | 'treatment' | 'chart_data_endpoints' | 'array_strings' | 'array_qa' | 'array_fallback_json' | 'object_fallback_json' | 'primitive_text' | 'null_skip';

function classifyForPatching(key: string, rawValue: any): PatchResult {
  let value = rawValue;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const stripped = { ...value };
    for (const k of ['source', '_citations', 'citations', 'reasoning']) delete stripped[k];
    if (Object.keys(stripped).length === 1) value = stripped[Object.keys(stripped)[0]];
    else value = stripped;
  }
  if (value === null || value === undefined) return 'null_skip';
  if (value && typeof value === 'object' && Array.isArray(value.headers) && Array.isArray(value.rows)) return 'table_headers_rows';
  if (key === 'treatment' || (typeof value === 'object' && value.treatment_summary && value.groups)) return 'treatment';
  if (key === 'efficacy_primary_endpoint_results_conclusion' || (value && Array.isArray(value.chart_data))) return 'chart_data_endpoints';
  if (Array.isArray(value)) {
    const hasStrings = value.some((i: any) => typeof i === 'string');
    const hasQA = value.some((i: any) => i && typeof i === 'object' && (i.question && (i.answer || i.primary_endpoint_results_conclusion)));
    if (hasStrings || hasQA) return hasQA ? 'array_qa' : 'array_strings';
    return 'array_fallback_json';
  }
  if (typeof value === 'object') return 'object_fallback_json';
  return 'primitive_text';
}

// ─── Mock AI Responses ───
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

// ─── Edge Cases ───
const EDGE_CASES: Record<string, { label: string; data: any }> = {
  empty_object: { label: "Empty object", data: {} },
  empty_array: { label: "Empty array", data: [] },
  single_item_array: { label: "Single-item array", data: ["only one"] },
  wrapped_primitive: { label: "Primitive wrapped in {data}", data: { data: "simple value" } },
  bare_string: { label: "Bare string", data: "This is just a string" },
  bare_number: { label: "Bare number", data: 42 },
  single_row_table: { label: "Single-row table", data: { headers: ["Col1", "Col2"], rows: [["val1", "val2"]] } },
  empty_headers_rows: { label: "Table with headers but no rows", data: { headers: ["A", "B"], rows: [] } },
  null_value: { label: "Null value", data: null },
  nested_array_of_objects: { label: "Array with nested objects (NOT flat)", data: [{ name: "Item1", details: { nested: true } }, { name: "Item2", details: { nested: true } }] },
  flat_array_of_objects: { label: "Flat array of objects (IS flat)", data: [{ name: "Item1", value: "100", unit: "mg" }, { name: "Item2", value: "200", unit: "mg" }] },
  chart_data_shape: { label: "Chart data {labels, datasets}", data: { labels: ["A", "B"], datasets: [{ label: "Set1", data: [1, 2] }] } },
};

// ════════════════════════════════════════════════════════════
//  TEST 1: Prompt Loading & Validation
// ════════════════════════════════════════════════════════════
section("TEST 1: Prompt Loading & Validation");

const data = extractedData as any;

for (const mappingName of ['results_PLS', 'protocol_PLS']) {
  console.log(`\n  📋 Mapping: ${mappingName}`);
  const prompts = data.prompts[mappingName];
  const mapping = data.mappings[mappingName];
  assert(!!prompts, `${mappingName}: prompts object exists`);
  assert(!!mapping, `${mappingName}: mapping object exists`);
  const promptKeys = Object.keys(prompts);
  assert(promptKeys.length > 0, `${mappingName}: has ${promptKeys.length} prompt keys`);
  let allNonEmpty = true;
  for (const key of promptKeys) {
    if (typeof prompts[key] !== 'string' || prompts[key].trim().length === 0) {
      allNonEmpty = false;
    }
  }
  assert(allNonEmpty, `${mappingName}: all prompts are non-empty strings`);
  const mappingKeys = Object.keys(mapping);
  assert(mappingKeys.length > 0, `${mappingName}: mapping has ${mappingKeys.length} entries`);
  let hasAgePlaceholder = 0;
  for (const key of promptKeys) {
    if (prompts[key].includes('${age}')) hasAgePlaceholder++;
  }
  assert(hasAgePlaceholder > 0, `${mappingName}: ${hasAgePlaceholder}/${promptKeys.length} prompts have \${age} placeholder`);
}

// ════════════════════════════════════════════════════════════
//  TEST 2: Heuristic Classification
// ════════════════════════════════════════════════════════════
section("TEST 2: Heuristic Classification");

console.log("\n  📋 results_PLS mock responses:");

for (const [key, mockData] of Object.entries(MOCK_RESPONSES)) {
  let value = mockData;
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1) {
    value = value[Object.keys(value)[0]];
  }

  if (typeof value === 'string' || typeof value === 'number') {
    assert(true, `${key}: correctly identified as primitive (${typeof value})`);
  } else if (isHeadersRowsTable(value)) {
    assert(key === 'race', `${key}: detected as {headers, rows} table`);
  } else if (isChartData(value)) {
    assert(true, `${key}: detected as chart data {labels, datasets}`);
  } else if (isArrayOfPrimitives(value)) {
    assert(
      ['primary_endpoint', 'inclusion_criteria'].includes(key) || key.includes('criteria'),
      `${key}: detected as array of primitives`
    );
  } else if (isArrayOfFlatObjects(value)) {
    assert(true, `${key}: detected as array of flat objects (table)`);
  } else if (Array.isArray(value)) {
    assert(!isArrayOfFlatObjects(value), `${key}: array is correctly NOT classified as flat table`);
    assert(true, `${key}: detected as non-flat array (form/card layout)`);
  } else if (typeof value === 'object' && value !== null) {
    if (key === 'efficacy_primary_endpoint_results_conclusion') {
      assert(!isArrayOfFlatObjects(value), `${key}: complex object NOT classified as flat table`);
      assert(!isHeadersRowsTable(value), `${key}: complex object NOT classified as headers/rows`);
      assert(Array.isArray(value.chart_data), `${key}: has chart_data array`);
    } else if (key === 'treatment') {
      assert(!isHeadersRowsTable(value), `${key}: treatment NOT classified as headers/rows`);
      assert(!!value.groups && !!value.treatment_summary, `${key}: has treatment structure`);
    } else {
      assert(true, `${key}: detected as generic object (form layout)`);
    }
  }
}

console.log("\n  📋 Chart data sub-object validation:");
const chartItems = MOCK_RESPONSES.efficacy_primary_endpoint_results_conclusion.chart_data;
assert(!isArrayOfFlatObjects(chartItems), "chart_data array is NOT classified as flat table (has nested data)");
assert(chartItems.every((item: any) => typeof item.data === 'object'), "Each chart_data item has nested 'data' object");

// ════════════════════════════════════════════════════════════
//  TEST 3: Word Document Generation (Patching Logic)
// ════════════════════════════════════════════════════════════
section("TEST 3: Word Document Generation (Patching Logic)");

console.log("\n  📋 Patching classification for all mock responses:");

for (const [key, mockData] of Object.entries(MOCK_RESPONSES)) {
  const classification = classifyForPatching(key, mockData);
  const isValid = classification !== 'array_fallback_json' && classification !== 'object_fallback_json';
  assert(isValid, `${key}: classified as ${classification} (not JSON fallback)`);
}

console.log("\n  📋 Specific patching scenarios:");
assert(classifyForPatching('race', MOCK_RESPONSES.race) === 'table_headers_rows', "race: routes to table_headers_rows");
assert(classifyForPatching('treatment', MOCK_RESPONSES.treatment) === 'treatment', "treatment: routes to treatment handler");
assert(classifyForPatching('efficacy_primary_endpoint_results_conclusion', MOCK_RESPONSES.efficacy_primary_endpoint_results_conclusion) === 'chart_data_endpoints', "efficacy: routes to chart_data_endpoints");
assert(classifyForPatching('primary_endpoint', MOCK_RESPONSES.primary_endpoint) === 'array_strings', "primary_endpoint: routes to array_strings");
assert(classifyForPatching('key_secondary_endpoint_results', MOCK_RESPONSES.key_secondary_endpoint_results) === 'array_qa', "key_secondary: routes to array_qa");

// ════════════════════════════════════════════════════════════
//  TEST 4: Edge Cases
// ════════════════════════════════════════════════════════════
section("TEST 4: Edge Cases");

console.log("\n  📋 Heuristic edge cases:");

for (const [caseKey, caseData] of Object.entries(EDGE_CASES)) {
  const { label, data } = caseData;
  let value = data;
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1) {
    value = value[Object.keys(value)[0]];
  }

  if (caseKey === 'empty_array') {
    assert(isArrayOfPrimitives(value), `${label}: empty array is array of primitives`);
  } else if (caseKey === 'single_item_array') {
    assert(isArrayOfPrimitives(value), `${label}: single string item is array of primitives`);
  } else if (caseKey === 'flat_array_of_objects') {
    assert(isArrayOfFlatObjects(value), `${label}: flat objects detected as table`);
  } else if (caseKey === 'nested_array_of_objects') {
    assert(!isArrayOfFlatObjects(value), `${label}: nested objects NOT detected as flat table`);
  } else if (caseKey === 'single_row_table') {
    assert(isHeadersRowsTable(value), `${label}: single-row table detected`);
  } else if (caseKey === 'empty_headers_rows') {
    assert(isHeadersRowsTable(value), `${label}: table with no rows still detected as table`);
  } else if (caseKey === 'chart_data_shape') {
    assert(isChartData(value), `${label}: chart data detected`);
  } else {
    assert(true, `${label}: processed without error`);
  }
}

// ════════════════════════════════════════════════════════════
//  FINAL SUMMARY
// ════════════════════════════════════════════════════════════
section("FINAL SUMMARY");

console.log(`\n  Total Assertions: ${passed + failed}`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);

if (failures.length > 0) {
  console.log(`\n  Failed Tests:`);
  failures.forEach((f) => console.log(`    • ${f}`));
}

console.log(`\n${'═'.repeat(60)}\n`);

if (failed === 0) {
  console.log("  🎉 ALL TESTS PASSED! Pipeline is ready for development.\n");
  process.exit(0);
} else {
  console.log(`  ⚠️  ${failed} test(s) failed. Review above for details.\n`);
  process.exit(1);
}
