// Multi-sheet .xlsx writer with no extra packages (text and numbers only, no images).
// Gold header, frozen header row, filters, column widths, peso / number formats and an optional total row.
const enc = new TextEncoder();

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// ZIP with no compression ("store"), enough for .xlsx
const zip = (files) => {
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const push = (...parts) => parts.forEach((p) => { chunks.push(p); offset += p.length; });
  files.forEach(({ name, data }) => {
    const nameB = enc.encode(name);
    const crc = crc32(data);
    const start = offset;
    push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), nameB, data);
    central.push({ nameB, crc, size: data.length, start });
  });
  const cdStart = offset;
  central.forEach(({ nameB, crc, size, start }) => {
    push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(start), nameB);
  });
  const cdSize = offset - cdStart;
  push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0));
  const out = new Uint8Array(offset);
  let p = 0;
  chunks.forEach((c) => { out.set(c, p); p += c.length; });
  return out;
};

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

// Style ids (see cellXfs in `styles`)
const S = { text: 0, head: 1, int: 2, money: 3, zebraText: 4, zebraInt: 5, zebraMoney: 6, title: 7, totalText: 8, totalMoney: 9, label: 10, note: 11 };

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF8A6508"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF7A7A7A"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFB8860B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBF6E6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3E7BE"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFB8860B"/></top><bottom style="double"><color rgb="FFB8860B"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" horizontal="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const cell = (v, r, c, style) => {
  const ref = `${colName(c)}${r}`;
  const s = style ? ` s="${style}"` : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (v === null || v === undefined || v === '') return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
};

/* sheet = {
     name, title?, note?,
     headers: [...], rows: [[...]],
     money: [colIndexes]   // columns shown as ₱ amounts
     totals: [colIndexes]  // columns summed in a total row at the bottom
     label: true           // "key / value" sheet: first column bold
   } */
const sheetXml = (sh) => {
  const { headers, rows, money = [], totals = [], title, note } = sh;
  const cols = headers.length;
  const lines = [];
  let r = 1;
  const top = [];
  if (title) { top.push(`<row r="${r}" ht="26" customHeight="1">${cell(title, r, 0, S.title)}</row>`); r += 1; }
  if (note) { top.push(`<row r="${r}">${cell(note, r, 0, S.note)}</row>`); r += 1; }
  if (title || note) r += 1;       // one empty row before the table
  const headRow = r;
  lines.push(`<row r="${r}" ht="24" customHeight="1">${headers.map((h, c) => cell(h, r, c, S.head)).join('')}</row>`);
  r += 1;
  const first = r;
  rows.forEach((row, i) => {
    const z = i % 2 === 1;
    lines.push(`<row r="${r}">${headers.map((_, c) => {
      const v = row[c];
      let st;
      if (sh.label && c === 0) st = S.label;
      else if (typeof v === 'number') st = (money.includes(c) || (sh.moneyRows || []).includes(i)) ? (z ? S.zebraMoney : S.money) : (z ? S.zebraInt : S.int);
      else st = z ? S.zebraText : S.text;
      return cell(v, r, c, st);
    }).join('')}</row>`);
    r += 1;
  });
  const last = r - 1;
  if (totals.length && rows.length) {
    lines.push(`<row r="${r}">${headers.map((_, c) => {
      if (c === 0) return cell('TOTAL', r, c, S.totalText);
      if (totals.includes(c)) return `<c r="${colName(c)}${r}" s="${money.includes(c) ? S.totalMoney : S.totalText}"><f>SUM(${colName(c)}${first}:${colName(c)}${last})</f></c>`;
      return cell('', r, c, S.totalText);
    }).join('')}</row>`);
  }
  const widths = headers.map((h, c) => Math.min(46, Math.max(String(h).length + 3, ...rows.map((row) => {
    const v = row[c];
    return (typeof v === 'number' && money.includes(c) ? String(v).length + 4 : String(v ?? '').length) + 2;
  }))));
  const freeze = sh.label ? '' : `<pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/>`;
  const filter = sh.label || !rows.length ? '' : `<autoFilter ref="A${headRow}:${colName(cols - 1)}${last}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze}</sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${top.join('')}${lines.join('')}</sheetData>${filter}<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
};

export const buildWorkbook = (sheets) => {
  const names = sheets.map((s, i) => esc(s.name.replace(/[\\/?*[\]:]/g, ' ')).slice(0, 31) || `Sheet${i + 1}`);
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ].map(([name, text]) => ({ name, data: enc.encode(text) }));
  return zip(files);
};

export const downloadWorkbook = (fileName, sheets) => {
  const blob = new Blob([buildWorkbook(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};