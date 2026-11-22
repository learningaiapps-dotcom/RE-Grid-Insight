# Regional DSM Data Processing

Extract the ZIP and open index.html in Chrome or Edge. Keep the files together. No installation, server or internet connection is required. To host on GitHub Pages, put these files at the publishing root.

Choose one region, select all the files for the period in the file picker, and choose one plant. Picking files again replaces the current batch. NRPC accepts Excel workbooks. Review the worksheet names for each workbook and select an alias manually when it differs. WRPC accepts DSM CSVs and ZIPs. SRPC accepts generator DSM CSVs and ZIPs with commercial_dev2022 CSV entries. For filename-based matching, keep the original plant filenames.

Click Check and combine files. Review the file list, excluded inputs and validation messages. Download combined CSV exports the complete result in date/block order. Rows overlapping across sources are retained and flagged. The Excel option includes Summary and Data Validation sheets.

Regional parsing and conversion routines come from learningaiapps-dotcom/RE-Grid-Insight, commit ac7288f. Local dependencies are the repository's SheetJS and JSZip distributions.
