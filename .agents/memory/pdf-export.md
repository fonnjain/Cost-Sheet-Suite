---
name: PDF export in cost-sheet
description: Conventions/gotchas for generating PDFs in the cost-sheet artifact with jspdf + jspdf-autotable.
---

# PDF export (cost-sheet)

PDFs are built **from structured data** with `jspdf` + `jspdf-autotable` (functional API: `autoTable(doc, opts)`, next Y via `doc.lastAutoTable.finalY`), NOT html2canvas.

**Why:** html2canvas chokes on the app's Tailwind `oklch()` colors; building tables from data sidesteps that and yields cleaner output.

**₹ glyph gotcha:** jsPDF's built-in fonts (helvetica/WinAnsi) cannot render `₹` (U+20B9) — it renders blank/garbage. `formatINR()` uses `style:"currency"` so its output contains `₹`. Strip it before putting in a PDF (`.replace(/₹/g,"").trim()`) and use a textual "Rs" prefix. The em dash `—` (U+2014) DOES render fine.

**How to apply:** When exporting tables that should mirror an on-screen view, pass the UI's own change/highlight decisions into the PDF builder (e.g. a `changedMatrix` computed with the same comparator the table uses) rather than re-deriving them from formatted strings — string comparison of formatted cells can diverge from the numeric `numericEqual` the UI uses. Match discrete-row highlight rules exactly (the margin-scenario row highlights when `abs(recPct*100 - parseInt(label)) < 0.5`).
