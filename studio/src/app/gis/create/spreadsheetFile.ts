import { normaliseGrid, type ParsedTable } from "./tableImport";

/**
 * Read a spreadsheet file straight from disk — .xlsx, .csv or .tsv.
 *
 * The .xlsx path is a small ZIP + XML reader rather than a library: the format
 * is a zip of XML parts, and the browser can already inflate (DecompressionStream)
 * and parse XML (DOMParser). That keeps a heavyweight dependency out of the app
 * for what is, in the end, "read the first sheet as a grid".
 */

// ------------------------------------------------------------------ zip bits
type ZipEntry = { name: string; offset: number; method: number; compressedSize: number };

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

/** Read the central directory — it holds definitive sizes and offsets. */
function readZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  // End of central directory: scan back for its signature.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0 && i > buf.byteLength - 66000; i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file");

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count && p + 46 <= buf.byteLength; i++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const offset = u32(view, p + 42);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    entries.push({ name, offset, method, compressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf);
  if (u32(view, entry.offset) !== 0x04034b50) throw new Error("bad local header");
  const nameLen = u16(view, entry.offset + 26);
  const extraLen = u16(view, entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buf, start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error(`unsupported compression ${entry.method}`);

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

// ---------------------------------------------------------------- xlsx bits
/** "BC12" → 54 (zero-based column index). */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(el: Element): string {
  // Shared strings can be split across runs (<r><t>…), so join every <t>.
  return Array.from(el.getElementsByTagName("t"))
    .map((t) => t.textContent ?? "")
    .join("");
}

async function readXlsx(file: File): Promise<ParsedTable> {
  const buf = await file.arrayBuffer();
  const entries = readZipEntries(buf);

  const sharedEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedEntry) {
    const doc = new DOMParser().parseFromString(await readEntry(buf, sharedEntry), "application/xml");
    for (const si of Array.from(doc.getElementsByTagName("si"))) shared.push(textOf(si));
  }

  const sheetEntry = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
  if (!sheetEntry) throw new Error("no worksheet found");

  const doc = new DOMParser().parseFromString(await readEntry(buf, sheetEntry), "application/xml");
  const grid: string[][] = [];

  for (const row of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const idx = colIndex(c.getAttribute("r") ?? "A1");
      const type = c.getAttribute("t");
      let value = "";
      if (type === "s") {
        const i = Number(c.getElementsByTagName("v")[0]?.textContent ?? "-1");
        value = shared[i] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(c);
      } else {
        value = c.getElementsByTagName("v")[0]?.textContent ?? "";
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = value.trim();
    }
    grid.push(cells);
  }

  return normaliseGrid(grid);
}

// ----------------------------------------------------------------- csv bits
/** Split a delimited line, honouring quoted fields. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseDelimited(text: string): ParsedTable {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  const delimiter = (lines[0]?.match(/\t/g)?.length ?? 0) > 0 ? "\t" : ",";
  return normaliseGrid(lines.map((l) => splitLine(l, delimiter)));
}

/** Read any supported spreadsheet file into a grid. */
export async function readSpreadsheetFile(file: File): Promise<ParsedTable> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(file);
  return parseDelimited(await file.text());
}

export const SPREADSHEET_ACCEPT = ".xlsx,.csv,.tsv,.txt";
