(() => {
  const style = document.createElement('style');
  style.textContent = `
    .preview-shell{display:none;flex-direction:column;position:absolute;inset:0;background:#fff;z-index:5}
    .preview-shell.open{display:flex}.preview-toolbar{height:46px;display:flex;align-items:center;gap:8px;padding:7px 9px;background:#141418;color:#f2f2f7;border-bottom:1px solid #2e2e38}
    .preview-toolbar button{padding:7px 11px;border-radius:9px}.preview-toolbar .preview-active{background:#00d4ff;color:#000}.preview-frame{flex:1;width:100%;border:0;background:#fff}
    .editor{position:relative}
  `;
  document.head.appendChild(style);

  const editor = document.querySelector('.editor');
  if (!editor || document.getElementById('previewShell')) return;

  const shell = document.createElement('div');
  shell.id = 'previewShell';
  shell.className = 'preview-shell';
  shell.innerHTML = `
    <div class="preview-toolbar">
      <strong style="flex:1">👁️ Live Preview</strong>
      <button id="previewRefresh">↻ Refresh</button>
      <button id="previewBack">‹ Code</button>
    </div>
    <iframe id="previewFrame" class="preview-frame" sandbox="allow-scripts allow-forms allow-modals"></iframe>
  `;
  editor.appendChild(shell);

  const workspace = document.getElementById('workView');
  const bar = workspace?.querySelector('.wbar');
  if (!bar) return;

  const previewBtn = document.createElement('button');
  previewBtn.id = 'previewBtn';
  previewBtn.textContent = '👁 Preview';
  previewBtn.className = 'primary';
  bar.insertBefore(previewBtn, bar.querySelector('#download'));

  const code = document.getElementById('code');
  const frame = document.getElementById('previewFrame');

  function getFiles(){
    try { return JSON.parse(localStorage.getItem('km_workspace_files') || '{}'); }
    catch { return {}; }
  }

  function buildDocument(){
    const files = getFiles();
    let html = files['index.html'] || '<!doctype html><html><body><h2>No index.html found</h2><p>Create an index.html file to preview your project.</p></body></html>';
    const css = files['style.css'] || '';
    const js = files['script.js'] || '';

    if (!/<html[\s>]/i.test(html)) {
      html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}<script>${js.replace(/<\/script>/gi,'<\\/script>')}<\/script></body></html>`;
    } else {
      if (css && !/<link[^>]+style\.css/i.test(html) && !/<style[\s>]/i.test(html)) {
        html = html.replace(/<\/head>/i, `<style>${css}</style></head>`);
      }
      if (js && !/<script[^>]*src=["']?script\.js/i.test(html)) {
        html = html.replace(/<\/body>/i, `<script>${js.replace(/<\/script>/gi,'<\\/script>')}</script></body>`);
      }
    }
    return html;
  }

  function refresh(){
    frame.srcdoc = buildDocument();
  }

  function open(){
    shell.classList.add('open');
    previewBtn.classList.add('preview-active');
    refresh();
  }
  function close(){
    shell.classList.remove('open');
    previewBtn.classList.remove('preview-active');
  }

  previewBtn.addEventListener('click', () => shell.classList.contains('open') ? close() : open());
  document.getElementById('previewRefresh').addEventListener('click', refresh);
  document.getElementById('previewBack').addEventListener('click', close);

  const observer = new MutationObserver(() => {
    if (shell.classList.contains('open')) refresh();
  });
  observer.observe(document.getElementById('files'), {childList:true, subtree:true});

  code?.addEventListener('input', () => {
    if (shell.classList.contains('open')) setTimeout(refresh, 150);
  });
})();
