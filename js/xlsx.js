import { DAY_MS } from "./config.js";

// Excel-Export (XLSX ohne Bibliothek)
// XLSX ist ein ZIP mit XML-Dateien. Im Gegensatz zu CSV gibt es keine Probleme mit Zeichenkodierung oder Trennzeichen.
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSX_STYLE = { none: 0, header: 1, date: 2, time: 3, dateTime: 4 };
const OOXML_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OOXML_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OOXML_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP ohne Kompression ("stored") – für die kleinen XML-Dateien völlig ausreichend
function zipStored(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, content } of files) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // Dateinamen in UTF-8
    local.setUint16(12, 0x0021, true); // Datum 01.01.1980
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(local, nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(14, 0x0021, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(entry, nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: XLSX_MIME });
}

function xmlEsc(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function colName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// Excel zählt Tage ab dem 30.12.1899; lokale Uhrzeit, damit die Zeiten wie in der App erscheinen
export function excelDateTime(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
  return (utc - Date.UTC(1899, 11, 30)) / DAY_MS;
}

export function excelTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) / 1440;
}

// columns: [{ header, width }]; Zellen: Text, Zahl, { v: Zahl, s: XLSX_STYLE } oder leer (null/"")
export function buildXlsx(sheetName, columns, rows) {
  const strings = [];
  const stringIndex = new Map();
  const sharedString = (s) => {
    if (!stringIndex.has(s)) {
      stringIndex.set(s, strings.length);
      strings.push(s);
    }
    return stringIndex.get(s);
  };
  const cell = (value, ref, style) => {
    if (value === null || value === undefined || value === "") return "";
    const s = style ? ` s="${style}"` : "";
    if (typeof value === "object") return `<c r="${ref}" s="${value.s}"><v>${value.v}</v></c>`;
    if (typeof value === "number") return `<c r="${ref}"${s}><v>${value}</v></c>`;
    return `<c r="${ref}" t="s"${s}><v>${sharedString(String(value))}</v></c>`;
  };

  const allRows = [columns.map((col) => col.header), ...rows];
  const sheetData = allRows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, colName(c) + (r + 1), r === 0 ? XLSX_STYLE.header : 0)).join("")}</row>`)
    .join("");
  const cols = columns.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`).join("");

  const sheet = `${XML_HEAD}<worksheet xmlns="${OOXML_MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetData}</sheetData></worksheet>`;
  const sst = `${XML_HEAD}<sst xmlns="${OOXML_MAIN}" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join("")}</sst>`;
  // Eingebaute Zahlenformate 14/20/22 stellen Excel und Google Sheets im Format des Geräts dar
  const styles = `${XML_HEAD}<styleSheet xmlns="${OOXML_MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="20" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const workbook = `${XML_HEAD}<workbook xmlns="${OOXML_MAIN}" xmlns:r="${OOXML_REL}"><sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `${XML_HEAD}<Relationships xmlns="${OOXML_PKG_REL}"><Relationship Id="rId1" Type="${OOXML_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${OOXML_REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="${OOXML_REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const rootRels = `${XML_HEAD}<Relationships xmlns="${OOXML_PKG_REL}"><Relationship Id="rId1" Type="${OOXML_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const ct = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="${ct}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${ct}.sharedStrings+xml"/></Types>`;

  return zipStored([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: styles },
    { name: "xl/sharedStrings.xml", content: sst },
    { name: "xl/worksheets/sheet1.xml", content: sheet },
  ]);
}
