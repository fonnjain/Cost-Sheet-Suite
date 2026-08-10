/**
 * gen-data.ts — regenerates artifacts/cost-sheet/src/lib/v6/data.ts
 * from the attached RM Excel workbook.
 *
 * Run: pnpm --filter @workspace/scripts tsx src/gen-data.ts <path-to-xlsx>
 *
 * Only BILLET_FULL and RM_FULL are replaced. INITIAL_DATA, MASTER_SPECS, and
 * STRUCTURE_FAMILIES (lines 10-12 of data.ts) are copied verbatim from the
 * existing file so per-structure defaults and spec definitions are untouched.
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

const XLSX_PATH =
  process.argv[2] ??
  path.resolve(
    process.cwd(),
    "../attached_assets/RM_Price_&_Gauge_List_1786368256764.xlsx",
  );
const DATA_TS = path.resolve(
  process.cwd(),
  "../artifacts/cost-sheet/src/lib/v6/data.ts",
);

// ── helpers ──────────────────────────────────────────────────────────────────

function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(64 + ((n - 1) % 26) + 1) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || argb === "FF000000" || argb === "00000000") return undefined;
  // ExcelJS gives 8-char ARGB; keep it as-is
  return argb.length === 8 ? "FF" + argb.slice(2) : argb;
}

function serializeSheet(ws: ExcelJS.Worksheet): Record<string, object> {
  const out: Record<string, object> = {};

  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const addr = cell.address; // e.g. "C6"

      // --- value / formula ---
      let v: number | string | null = null;
      let f: string | null = null;

      if (cell.type === ExcelJS.ValueType.Formula) {
        const formula = (cell as any).formula as string | undefined;
        f = formula ? `=${formula}` : null;
        // v stays null for formula cells (engine evaluates at runtime)
      } else if (
        cell.type === ExcelJS.ValueType.Number ||
        cell.type === ExcelJS.ValueType.String ||
        cell.type === ExcelJS.ValueType.SharedString
      ) {
        const raw = cell.value;
        if (typeof raw === "number") v = raw;
        else if (typeof raw === "string") v = raw;
        else if (raw !== null && raw !== undefined) v = String(raw);
      } else if (cell.type === ExcelJS.ValueType.RichText) {
        // flatten rich text to plain string
        const rt = cell.value as ExcelJS.CellRichTextValue;
        v = rt.richText?.map((r) => r.text).join("") ?? null;
      } else if (cell.type === ExcelJS.ValueType.Date) {
        // format dates as DD/M/YYYY matching the original data
        const d = cell.value as Date;
        v = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
      }

      // Skip completely empty cells
      if (v === null && f === null) return;

      const cellObj: Record<string, unknown> = { v, f };

      // --- background fill ---
      const fill = cell.fill as ExcelJS.Fill | undefined;
      if (fill && (fill as any).type === "pattern") {
        const pf = fill as ExcelJS.FillPattern;
        const argb = (pf.fgColor as any)?.argb as string | undefined;
        const hex = argbToHex(argb);
        if (hex) cellObj.bg = hex;
      }

      // --- bold ---
      if (cell.font?.bold) cellObj.b = true;

      // --- horizontal alignment ---
      const ha = cell.alignment?.horizontal;
      if (ha) cellObj.ha = ha;

      out[addr] = cellObj;
    });
  });

  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading: ${XLSX_PATH}`);
  console.log(`Updating: ${DATA_TS}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const billetWS = wb.getWorksheet("Billet and Gauge");
  const rmWS = wb.getWorksheet("RM Price List");

  if (!billetWS) throw new Error('Sheet "Billet and Gauge" not found');
  if (!rmWS) throw new Error('Sheet "RM Price List" not found');

  console.log(`Sheets found: "${billetWS.name}", "${rmWS.name}"`);

  const billet = serializeSheet(billetWS);
  const rm = serializeSheet(rmWS);

  // Quick sanity checks
  const zinc = (billet["C6"] as any)?.v;
  const sailDgp = (billet["H9"] as any)?.v;
  const rmDate = (billet["C4"] as any)?.v;
  const wireLudh = (billet["C18"] as any)?.v;
  console.log(`\nSanity checks (Billet and Gauge):`);
  console.log(`  C4  rmDate    = ${rmDate}`);
  console.log(`  C6  Zinc      = ${zinc}  (expected 409,500)`);
  console.log(`  H9  SAIL_Dgp  = ${sailDgp}  (expected 44,500)`);
  console.log(`  C18 Wire Ludh = ${wireLudh}  (expected 54,000)`);

  // Check angle supplier row (row 8, RM Price List)
  console.log(`\nAngle supplier row (RM Price List, row 8):`);
  for (const col of ["D","E","F","G","H","I","J","K","L","M","N","O","P","Q"]) {
    const cell = (rm[`${col}7`] as any)?.v ?? (rm[`${col}8`] as any)?.v;
    const make = (rm[`${col}7`] as any)?.v;
    const sup  = (rm[`${col}8`] as any)?.v;
    if (!make && !sup) continue;
    console.log(`  col ${col}: make="${make}" supplier="${sup}"`);
  }

  // Read existing data.ts — preserve lines 10-12 (INITIAL_DATA, MASTER_SPECS, STRUCTURE_FAMILIES)
  const existingLines = fs.readFileSync(DATA_TS, "utf-8").split("\n");
  // Lines are 0-indexed in the array; line 10 = index 9, line 12 = index 11
  const preserved = existingLines.slice(9).join("\n"); // everything from line 10 onward

  const billetJson = JSON.stringify(billet);
  const rmJson = JSON.stringify(rm);

  const newContent = [
    `// AUTO-GENERATED from ${path.basename(XLSX_PATH)}`,
    `// Source of truth for the cost-sheet engine. Do not edit by hand.`,
    `/* eslint-disable */`,
    `export type V6Cell = { v?: number | string | null; f?: string | null; [key: string]: unknown };`,
    `export type V6Sheet = Record<string, V6Cell>;`,
    `export type InitialCell = { label: string; group: string; value: number };`,
    ``,
    `export const BILLET_FULL: V6Sheet = ${billetJson};`,
    `export const RM_FULL: V6Sheet = ${rmJson};`,
    preserved,
  ].join("\n");

  fs.writeFileSync(DATA_TS, newContent, "utf-8");
  console.log(`\n✓ data.ts written (${(newContent.length / 1024).toFixed(1)} KB)`);
  console.log(`  BILLET_FULL cells: ${Object.keys(billet).length}`);
  console.log(`  RM_FULL cells:     ${Object.keys(rm).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
