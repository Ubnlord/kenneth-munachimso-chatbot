import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import JSZip from 'jszip';

function text(value) { return typeof value === 'string' ? value : String(value ?? ''); }
function cleanName(name, fallback) {
  const value = text(name || fallback).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return value || fallback;
}
function send(res, status, body, type, name) {
  res.statusCode = status;
  if (type) res.setHeader('Content-Type', type);
  if (name) res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.end(body);
}

async function makePdf(content, title) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, info: { Title: title } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).text(title, { paragraphGap: 12 });
    doc.fontSize(11).text(content, { lineGap: 4 });
    doc.end();
  });
}

async function makeDocx(content, title) {
  const children = [];
  const lines = text(content).split(/\r?\n/);
  children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  for (const line of lines) children.push(new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const format = text(body.format).toLowerCase();
    const title = text(body.title || 'Kenneth Munachimso document');
    const content = text(body.content);
    const filenameBase = cleanName(body.filename, 'kenneth-munachimso-file');

    if (format === 'txt') return send(res, 200, Buffer.from(content, 'utf8'), 'text/plain; charset=utf-8', `${filenameBase}.txt`);
    if (format === 'csv') return send(res, 200, Buffer.from(content, 'utf8'), 'text/csv; charset=utf-8', `${filenameBase}.csv`);
    if (format === 'pdf') return send(res, 200, await makePdf(content, title), 'application/pdf', `${filenameBase}.pdf`);
    if (format === 'docx') return send(res, 200, await makeDocx(content, title), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${filenameBase}.docx`);

    if (format === 'zip') {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return res.status(400).json({ error: 'files is required for ZIP generation.' });
      const zip = new JSZip();
      for (const file of files) {
        const path = text(file?.path).replace(/^\/+|\.\.\//g, '').trim();
        if (path) zip.file(path, text(file?.content));
      }
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      return send(res, 200, buffer, 'application/zip', `${filenameBase}.zip`);
    }

    return res.status(400).json({ error: 'Unsupported format. Use pdf, docx, txt, csv, or zip.' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'File generation failed.' });
  }
}
