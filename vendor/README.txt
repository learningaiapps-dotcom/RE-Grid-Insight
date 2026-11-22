Libraries used by the pages. They are stored here so the sites never load code from other websites
(only the weather look-ups need internet).
  xlsx.full.min.js               SheetJS (reads and writes Excel files). Replace with the newest version from
                                 https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js (keep the same file name)
  chart.umd.min.js               Chart.js 4.6.1 (draws the charts)
  jspdf.umd.min.js               jsPDF 4.2.1 (BESS operations PDF reports)
  jspdf.plugin.autotable.min.js  jsPDF-AutoTable 5.0.9 (tables in those PDF reports)
  jszip.min.js                   only used by the tests; the page contains its own copy
Keep this vendor folder next to index.html when you upload to GitHub.
