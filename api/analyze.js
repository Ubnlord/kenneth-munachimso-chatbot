import pdf from 'pdf-parse';
import mammoth from 'mammoth';

function b64ToBuffer(value) {
  const raw = String(value || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(raw, 'base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { filename = 'uploaded-file', mimeType = '', data } = req.body || {};
    if (!data) return res.status(400).json({ error: 'data is required.' });
    const buffer = b64ToBuffer(data);
    const lower = String(filename).toLowerCase();
    let text = '';
    let type = 'binary';

    if (mimeType.includes('pdf') || lower.endsWith('.pdf')) {
      const result = await pdf(buffer);
      text = result.text || '';
      type = 'pdf';
    } else if (mimeType.includes('wordprocessingml') || lower.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
      type = 'docx';
    } else if (mimeType.startsWith('text/') || /\.(txt|md|csv|json|js|jsx|ts|tsx|html|css|xml|yml|yaml|py|java|cpp|c|h|sql)$/i.test(lower)) {
      text = buffer.toString('utf8');
      type = 'text';
    } else {
      return res.status(415).json({ error: 'This file type can be uploaded, but automatic text extraction is not supported yet.', filename });
    }

    const max = 50000;
    return res.status(200).json({ filename, type, text: text.slice(0, max), truncated: text.length > max, characters: text.length });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'File analysis failed.' });
  }
}
