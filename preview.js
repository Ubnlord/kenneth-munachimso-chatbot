(() => {
  // Chat ↔ Workspace bridge: every chat request receives the current workspace files.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (/\/api\/chat(?:\?|$)/.test(url) && init.body) {
        const body = JSON.parse(init.body);
        let files = {};
        try { files = JSON.parse(localStorage.getItem('km_workspace_files') || '{}'); } catch {}
        const names = Object.keys(files);
        if (names.length) {
          let total = 0;
          const project = [];
          for (const name of names) {
            const content = String(files[name] ?? '');
            if (total + content.length > 60000) break;
            project.push(`\n--- FILE: ${name} ---\n${content}`);
            total += content.length;
          }
          const workspaceMessage = {
            role: 'system',
            content: `CURRENT KENNETH WORKSPACE. Treat these files as the user's current project. When the user asks to modify, fix, improve, refactor, add, remove, or continue the project, work from these files and return the COMPLETE changed files using the <FILES>[...]</FILES> format. Preserve unchanged files when needed for a coherent project. Do not merely describe changes.\n${project.join('')}`
          };
          body.messages = [body.messages?.[0], workspaceMessage, ...(body.messages || []).slice(1)];
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    } catch (e) {
      console.warn('Workspace context bridge skipped:', e);
    }
    return originalFetch(input, init);
  };

  const style = document.createElement('style');
  style.textContent = `
    .workspace-chat-btn{margin-left:8px}
    .project-status{font-size:11px;color:#8e8e9a;padding:0 10px 7px}
    .project-status strong{color:#00d4ff}
  `;
  document.head.appendChild(style);

  const workspace = document.getElementById('workView');
  const bar = workspace?.querySelector('.wbar');
  const filesEl = document.getElementById('files');
  if (!workspace || !bar || !filesEl) return;

  // Add a clear action for continuing workspace work from Chat.
  if (!document.getElementById('askProject')) {
    const ask = document.createElement('button');
    ask.id = 'askProject';
    ask.textContent = '💬 Ask AI';
    ask.title = 'Return to Chat and ask the AI to work on this project';
    ask.className = 'workspace-chat-btn';
    bar.insertBefore(ask, bar.firstChild);
    ask.addEventListener('click', () => {
      const tabs = document.querySelectorAll('.tab');
      const chatTab = [...tabs].find(t => t.dataset.v === 'chatView');
      chatTab?.click();
      const input = document.getElementById('input');
      if (input) {
        input.focus();
        if (Object.keys(getFiles()).length) {
          input.placeholder = 'Ask Kenneth to modify your current project...';
        }
      }
    });
  }

  if (!document.getElementById('projectStatus')) {
    const status = document.createElement('div');
    status.id = 'projectStatus';
    status.className = 'project-status';
    workspace.insertBefore(status, workspace.querySelector('.wgrid'));
  }

  function getFiles() {
    try { return JSON.parse(localStorage.getItem('km_workspace_files') || '{}'); }
    catch { return {}; }
  }

  function updateStatus() {
    const status = document.getElementById('projectStatus');
    if (!status) return;
    const files = getFiles();
    const names = Object.keys(files);
    status.innerHTML = names.length
      ? `<strong>● Connected</strong> · Chat is working with ${names.length} workspace file${names.length === 1 ? '' : 's'}`
      : '<strong>○ Empty</strong> · Generate or add files to connect the project';
  }

  updateStatus();
  new MutationObserver(updateStatus).observe(filesEl, { childList: true, subtree: true });

  // The current index.html already contains the preview UI. Only create one if it is missing.
  const editor = document.querySelector('.editor');
  if (!editor || document.getElementById('previewShell')) return;

  const shell = document.createElement('div');
  shell.id = 'previewShell';
  shell.style.cssText = 'display:none;position:absolute;inset:0;background:#fff;z-index:5;flex-direction:column';
  shell.innerHTML = `<div style="height:46px;display:flex;align-items:center;gap:8px;padding:7px 9px;background:#141418;color:#f2f2f7"><strong style="flex:1">👁️ Live Preview</strong><button id="previewRefresh">↻ Refresh</button><button id="previewBack">‹ Code</button></div><iframe id="previewFrame" style="flex:1;width:100%;border:0;background:#fff" sandbox="allow-scripts allow-forms allow-modals"></iframe>`;
  editor.appendChild(shell);

  const previewBtn = document.createElement('button');
  previewBtn.id = 'previewBtnFallback';
  previewBtn.textContent = '👁 Preview';
  previewBtn.className = 'primary';
  bar.insertBefore(previewBtn, bar.querySelector('#download'));
  const frame = document.getElementById('previewFrame');

  function buildDocument() {
    const files = getFiles();
    let html = files['index.html'] || '<!doctype html><html><body><h2>No index.html found</h2><p>Create an index.html file to preview your project.</p></body></html>';
    const css = files['style.css'] || '';
    const js = files['script.js'] || '';
    if (!/<html[\s>]/i.test(html)) {
      html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}<script>${js.replace(/<\/script>/gi,'<\\/script>')}</script></body></html>`;
    } else {
      if (css && !/<link[^>]+style\.css/i.test(html) && !/<style[\s>]/i.test(html)) html = html.replace(/<\/head>/i, `<style>${css}</style></head>`);
      if (js && !/<script[^>]*src=["']?script\.js/i.test(html)) html = html.replace(/<\/body>/i, `<script>${js.replace(/<\/script>/gi,'<\\/script>')}</script></body>`);
    }
    return html;
  }
  function refresh(){ frame.srcdoc = buildDocument(); }
  function open(){ shell.style.display='flex'; previewBtn.classList.add('preview-active'); refresh(); }
  function close(){ shell.style.display='none'; previewBtn.classList.remove('preview-active'); }
  previewBtn.onclick = () => shell.style.display === 'flex' ? close() : open();
  document.getElementById('previewRefresh').onclick = refresh;
  document.getElementById('previewBack').onclick = close;
})();
