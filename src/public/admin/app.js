(function(){
  const origin = location.origin.replace(/\/$/, '');
  function getToken(){return localStorage.getItem('svcToken')||''}
  function setToken(val){localStorage.setItem('svcToken', val)}
  function authHeaders(){return {'x-internal-auth': getToken()}}
  async function fetchJSON(url){const r = await fetch(url, { headers: authHeaders() }); if(!r.ok) throw new Error('http '+r.status); return r.json()}
  async function fetchText(url){const r = await fetch(url, { headers: authHeaders() }); if(!r.ok) throw new Error('http '+r.status); return r.text()}
  async function postJSON(url, body){const r = await fetch(url, {method:'POST', headers: Object.assign({'content-type':'application/json'}, authHeaders()), body: JSON.stringify(body)}); if(!r.ok) throw new Error('http '+r.status); return r.json()}

  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('saveToken');
  const saveStatus = document.getElementById('saveStatus');
  const refreshMetricsBtn = document.getElementById('refreshMetrics');
  const welcomeMessage = document.getElementById('welcomeMessage');
  const saveWelcome = document.getElementById('saveWelcome');
  const settingsStatus = document.getElementById('settingsStatus');
  const statusSel = document.getElementById('status');
  const searchInput = document.getElementById('search');
  const autoRefresh = document.getElementById('autoRefresh');
  const rows = document.getElementById('rows');
  const selectAll = document.getElementById('selectAll');
  const deleteSelected = document.getElementById('deleteSelected');
  const bulkStatus = document.getElementById('bulkStatus');
  const detail = document.getElementById('detail');
  const detailTitle = document.getElementById('detailTitle');
  let refreshTimer = null;

  function setStatus(msg){ saveStatus.textContent = msg; setTimeout(()=>{ saveStatus.textContent=''; }, 1500) }
  saveBtn.onclick = () => { setToken(tokenInput.value.trim()); setStatus('Saved'); };

  refreshMetricsBtn.onclick = async () => {
    try { document.getElementById('metrics').textContent = await fetchText(origin + '/metrics'); }
    catch (e) { document.getElementById('metrics').textContent = 'Error loading metrics'; }
  };
  // Auto-refresh metrics every 15s
  setInterval(()=>{ refreshMetricsBtn.onclick(); }, 15000);

  // Settings
  async function loadSettings(){ try{ const s = await fetchJSON(origin + '/v1/admin/settings'); welcomeMessage.value = s.welcome_message || ''; }catch{} }
  saveWelcome.onclick = async ()=>{ try{ await postJSON(origin + '/v1/admin/settings', { welcome_message: welcomeMessage.value||'' }); settingsStatus.textContent='Saved'; setTimeout(()=>settingsStatus.textContent='',1200);}catch{ settingsStatus.textContent='Failed'; setTimeout(()=>settingsStatus.textContent='',1200);} };

  function bindRowClicks(){
    Array.from(rows.querySelectorAll('tr[data-id]')).forEach((tr) => {
      tr.onclick = async () => {
        const id = tr.getAttribute('data-id'); if(!id) return;
        // Visual selection & persistence
        try{ Array.from(rows.querySelectorAll('tr[data-id]')).forEach(x=>x.classList.remove('row-selected')); }catch(_){ }
        tr.classList.add('row-selected');
        try{ localStorage.setItem('admin:selected', id); }catch(_){ }
        detail.textContent = 'Loading…'; detailTitle.textContent = id;
        try {
          const payload = await fetchJSON(origin + '/v1/conversations/' + encodeURIComponent(id) + '/messages');
          const msgs = Array.isArray(payload) ? payload : (payload && payload.messages ? payload.messages : []);
          if (!Array.isArray(msgs) || msgs.length === 0) { detail.textContent = 'No messages.'; return; }
          detail.textContent = msgs.map(m => {
            const who = m.direction === 'OUTBOUND' ? (m.agent || 'Support') : 'Customer';
            return `${new Date(m.createdAt).toLocaleString()}  ${who}: ${m.text}`;
          }).join('\n');
        } catch { detail.textContent = 'Failed to load messages.'; }
      };
    });
  }

  async function loadConversations() {
    rows.innerHTML = '';
    const status = statusSel.value;
    const q = (searchInput.value||'').trim();
    try {
      const url = new URL(origin + '/v1/conversations');
      if (status !== 'all') url.searchParams.set('status', status);
      if (q) url.searchParams.set('q', q);
      const list = await fetchJSON(url.toString());
      if (!Array.isArray(list) || list.length === 0) {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan=5; td.textContent='No conversations'; tr.appendChild(td); rows.appendChild(tr); return;
      }
      for (const c of list) {
        const tr = document.createElement('tr'); tr.setAttribute('data-id', c.id);
        const cb = `<input type=\"checkbox\" class=\"rowSel\" data-id=\"${c.id}\">`;
        const updated = c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '';
        const agent = c.assignedAgentName || (c.assignedAgentTgId ? String(c.assignedAgentTgId) : '');
        tr.innerHTML = `<td>${cb}</td><td>${c.codename}</td><td>${c.customerName||''}</td><td><span class=\"badge\">${c.status}</span></td><td>${agent}</td><td>${updated}</td>`;
        const td = document.createElement('td');
        const btnClose = document.createElement('button'); btnClose.textContent='Close'; btnClose.onclick = async (e)=>{ e.stopPropagation(); try{ await postJSON(origin + '/v1/moderation/close', { id: c.id }); loadConversations(); }catch{ alert('Close failed'); } };
        const btnBlock = document.createElement('button'); btnBlock.textContent='Block'; btnBlock.style.marginLeft='6px'; btnBlock.onclick = async (e)=>{ e.stopPropagation(); try{ await postJSON(origin + '/v1/moderation/block', { id: c.id }); loadConversations(); }catch{ alert('Block failed'); } };
        // remove Export JSON per request
        const aCsv = document.createElement('a'); aCsv.textContent='Export CSV'; aCsv.href = '#'; aCsv.style.marginLeft='6px'; aCsv.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); fetch(origin + '/v1/conversations/' + encodeURIComponent(c.id) + '/export.csv', { headers: authHeaders() }).then(r=>r.blob()).then(b=>{ const url=URL.createObjectURL(b); const dl=document.createElement('a'); dl.href=url; dl.download='conversation_'+c.id+'.csv'; dl.click(); URL.revokeObjectURL(url); }); };
        td.append(btnClose, btnBlock, aCsv); tr.appendChild(td); rows.appendChild(tr);
      }
      bindRowClicks();
      // Restore last selection if present
      try{
        const sel = localStorage.getItem('admin:selected');
        if(sel){ const tr = rows.querySelector(`tr[data-id="${sel}"]`); if(tr){ tr.classList.add('row-selected'); tr.scrollIntoView({ block: 'nearest' }); } }
      }catch(_){ }
    } catch (e) {
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Failed to load. Check token and try again.'; tr.appendChild(td); rows.appendChild(tr);
    }
  }

  // Bulk selection and deletion
  selectAll.onclick = () => {
    const checked = selectAll.checked;
    rows.querySelectorAll('.rowSel').forEach((c)=>{ c.checked = checked });
  };
  deleteSelected.onclick = async () => {
    const ids = Array.from(rows.querySelectorAll('.rowSel')).filter((c)=>c.checked).map((c)=>c.getAttribute('data-id')).filter(Boolean);
    if (!ids.length) { bulkStatus.textContent = 'No rows selected'; setTimeout(()=>bulkStatus.textContent='',1200); return; }
    // inline confirm: turn the button into Confirm state briefly
    if (!deleteSelected.dataset.step) { deleteSelected.dataset.step='confirm'; deleteSelected.textContent='Confirm Delete'; deleteSelected.style.background='#b91c1c'; setTimeout(()=>{ deleteSelected.dataset.step=''; deleteSelected.textContent='Delete Selected'; deleteSelected.style.background='#dc2626'; }, 3000); return; }
    try {
      const r = await fetch(origin + '/v1/admin/conversations/bulk-delete', { method: 'POST', headers: Object.assign({'content-type':'application/json'}, authHeaders()), body: JSON.stringify({ ids }) });
      const json = await r.json().catch(()=>({}));
      bulkStatus.textContent = 'Deleted ' + (json && typeof json.deleted==='number' ? json.deleted : ids.length);
      setTimeout(()=>bulkStatus.textContent='',1500);
      loadConversations();
    } catch { bulkStatus.textContent = 'Failed'; setTimeout(()=>bulkStatus.textContent='',1200); }
  };
  // removed dangerous delete by status

  // Agents management
  const agentsRows = document.getElementById('agentsRows');
  const agentTgId = document.getElementById('agentTgId');
  const agentName = document.getElementById('agentName');
  const agentClosing = document.getElementById('agentClosing');
  const agentsReload = document.getElementById('agentsReload');
  const agentSave = document.getElementById('agentSave');
  const agentsStatus = document.getElementById('agentsStatus');
  function setAgentsStatus(msg){ agentsStatus.textContent = msg; setTimeout(()=>{ agentsStatus.textContent=''; }, 1500) }

  async function loadAgents(){
    agentsRows.innerHTML = '';
    try{
      const list = await fetchJSON(origin + '/v1/admin/agents');
      if (!Array.isArray(list) || list.length===0){ const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=4; td.textContent='No agents'; tr.appendChild(td); agentsRows.appendChild(tr); return; }
      for(const a of list){
        const tr=document.createElement('tr');
        tr.innerHTML = `<td>${a.tgId}</td><td>${a.displayName}</td><td>${a.isActive}</td>`;
        const td=document.createElement('td');
        const dis=document.createElement('button'); dis.textContent='Disable'; dis.disabled = !a.isActive; dis.onclick=async()=>{ try{ await postJSON(origin + '/v1/admin/agents/disable', { tgId: a.tgId }); setAgentsStatus('Disabled'); loadAgents(); }catch{ setAgentsStatus('Failed'); } };
        const en=document.createElement('button'); en.textContent='Enable'; en.style.marginLeft='6px'; en.disabled = !!a.isActive; en.onclick=async()=>{ try{ await postJSON(origin + '/v1/admin/agents/enable', { tgId: a.tgId }); setAgentsStatus('Enabled'); loadAgents(); }catch{ setAgentsStatus('Failed'); } };
        td.appendChild(dis); td.appendChild(en); tr.appendChild(td); agentsRows.appendChild(tr);
      }
    }catch{ const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=4; td.textContent='Failed to load agents'; tr.appendChild(td); agentsRows.appendChild(tr); }
  }

  agentSave.onclick = async ()=>{
    const id = (agentTgId.value||'').trim(); const name = (agentName.value||'').trim(); const cm = (agentClosing.value||'').trim(); if(!id||!name){ setAgentsStatus('Fill fields'); return; }
    try{ await postJSON(origin + '/v1/admin/agents/upsert', { tgId: id, displayName: name }); if(cm){ await postJSON(origin + '/v1/admin/agents/closing-message', { tgId: id, message: cm }); } setAgentsStatus('Saved'); agentName.value=''; agentClosing.value=''; loadAgents(); }catch{ setAgentsStatus('Failed'); }
  };
  agentsReload.onclick = loadAgents;

  // Messages & auto responses
  const closingAgent = document.getElementById('closingAgent');
  const closingText = document.getElementById('closingText');
  const saveClosing = document.getElementById('saveClosing');
  const closingBulkDelete = document.getElementById('closingBulkDelete');
  const closingSelectAll = document.getElementById('closingSelectAll');
  const messagesStatus = document.getElementById('messagesStatus');
  const closingList = document.getElementById('closingList');
  function setMessagesStatus(msg){ messagesStatus.textContent = msg; setTimeout(()=>{ messagesStatus.textContent=''; }, 1500) }
  // Locale tabs for closing messages
  const closingTabsWrap = document.createElement('div'); closingTabsWrap.style.margin='6px 0'; closingTabsWrap.innerHTML = '<div>Locales: <span id="closingTabs"></span> <button id="addClosingLocale" style="margin-left:8px">Add locale</button> <button id="delClosingLocale" style="margin-left:8px">Delete locale</button></div>';
  document.querySelector('main .grid > div').appendChild(closingTabsWrap);
  const closingTabs = closingTabsWrap.querySelector('#closingTabs'); const addClosingLocaleBtn = closingTabsWrap.querySelector('#addClosingLocale'); const delClosingLocaleBtn = closingTabsWrap.querySelector('#delClosingLocale');
  let closingLocale = localStorage.getItem('admin:closingLocale') || 'default';
  function renderClosingTabs(locales){
    // reuse styles
    if (!document.getElementById('sc-admin-tab-styles')) {
      const st = document.createElement('style'); st.id='sc-admin-tab-styles'; st.textContent = '.sc-tab{display:inline-block;margin-right:8px;padding:6px 10px;border:1px solid #d1d5db;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;background:#f9fafb;cursor:pointer} .sc-tab[aria-selected="true"]{background:#ffffff;border-bottom-color:#2563eb;color:#111827;font-weight:600}'; document.head.appendChild(st);
    }
    closingTabs.innerHTML='';
    (locales||['default']).forEach((loc)=>{ const b=document.createElement('button'); b.type='button'; b.className='sc-tab'; b.textContent=loc; b.setAttribute('aria-selected', String(loc===closingLocale)); b.onclick=(e)=>{ e.preventDefault(); closingLocale=loc; localStorage.setItem('admin:closingLocale', loc); populateClosingAgents(); }; closingTabs.appendChild(b); });
    try{ const active = closingTabs.querySelector('button[aria-selected="true"]'); if(active) active.focus(); }catch(_){ }
    delClosingLocaleBtn.style.display = (closingLocale==='default') ? 'none' : '';
  }
  addClosingLocaleBtn.onclick = async()=>{
    // Inline locale create: copy default values for existing agents (empty if none)
    const loc = prompt('Enter locale code (e.g., en, lv, de):',''); if(!loc) return;
    try{
      const all = await fetchJSON(origin + '/v1/admin/agents');
      const closing = await fetchJSON(origin + '/v1/admin/agents/closing-messages');
      const byTg = new Map(closing.filter(c=> (c.locale||'default')==='default' && c.message).map(c=> [String(c.tgId), c.message]));
      for(const a of all){ const msg = byTg.get(String(a.tgId)) || ''; await postJSON(origin + '/v1/admin/agents/closing-message', { tgId: a.tgId, message: msg, locale: loc }); }
      localStorage.setItem('admin:closingLocale', loc); closingLocale = loc; setMessagesStatus('Locale added'); populateClosingAgents();
    }catch{ setMessagesStatus('Failed'); }
  };
  delClosingLocaleBtn.onclick = async()=>{
    if (closingLocale==='default') return; if(!confirm('Delete all closing messages for locale '+closingLocale+'?')) return;
    try{ const list = await fetchJSON(origin + '/v1/admin/agents'); for(const a of list){ await postJSON(origin + '/v1/admin/agents/closing-message', { tgId: a.tgId, message: '', locale: closingLocale }); } localStorage.setItem('admin:closingLocale','default'); closingLocale='default'; setMessagesStatus('Deleted'); populateClosingAgents(); }catch{ setMessagesStatus('Failed'); }
  };

  async function populateClosingAgents(){
    try{
      const list = await fetchJSON(origin + '/v1/admin/agents');
      const closings = await fetchJSON(origin + '/v1/admin/agents/closing-messages');
      const locales = Array.from(new Set(closings.map(c=>c.locale||'default')));
      if (!locales.includes('default')) locales.unshift('default');
      renderClosingTabs(locales);
      closingAgent.innerHTML = '';
      closingList.innerHTML = '';
      for(const a of list){
        const opt = document.createElement('option');
        opt.value = a.tgId; opt.textContent = `${a.displayName} (${a.tgId})`;
        closingAgent.appendChild(opt);
        const tr=document.createElement('tr');
        const map = new Map(closings.filter(c=> String(c.tgId)===String(a.tgId)).map(c=> [c.locale||'default', c.message||'']));
        const msg = (map.get(closingLocale) || map.get('default') || '').toString();
        tr.innerHTML = `<td><input type="checkbox" class="closingSel" data-id="${a.tgId}"></td><td>${a.displayName} (${a.tgId})</td><td>${msg?msg:'—'}</td>`;
        const td = document.createElement('td');
        const edit = document.createElement('button'); edit.textContent='Edit'; edit.onclick=()=>{ closingAgent.value = a.tgId; closingText.value = msg; };
        const del = document.createElement('button'); del.textContent='Delete'; del.style.marginLeft='6px'; del.onclick=async()=>{
          // inline confirmation
          if(!del.dataset.step){ del.dataset.step='confirm'; del.textContent='Confirm'; del.style.background='#dc2626'; del.style.color='#fff'; setTimeout(()=>{ del.dataset.step=''; del.textContent='Delete'; del.style=''; }, 3000); return; }
          try{ await postJSON(origin + '/v1/admin/agents/closing-message', { tgId: a.tgId, message: '', locale: closingLocale }); populateClosingAgents(); }catch{}
        };
        td.append(edit, del); tr.appendChild(td);
        closingList.appendChild(tr);
      }
    }catch{}
  }
  saveClosing.onclick = async ()=>{
    const tgId = closingAgent.value; const msg = (closingText.value||'').trim(); if(!tgId){ setMessagesStatus('Select agent'); return; }
    try{ await postJSON(origin + '/v1/admin/agents/closing-message', { tgId, message: msg, locale: closingLocale }); setMessagesStatus('Saved'); closingText.value=''; populateClosingAgents(); }
    catch{ setMessagesStatus('Failed'); }
  };
  closingSelectAll.onclick = () => { const checked = closingSelectAll.checked; closingList.querySelectorAll('.closingSel').forEach(c=>{ c.checked = checked; }); };
  closingBulkDelete.onclick = async ()=>{
    const ids = Array.from(closingList.querySelectorAll('.closingSel')).filter(c=>c.checked).map(c=>c.getAttribute('data-id')).filter(Boolean);
    if (!ids.length){ setMessagesStatus('No selections'); return; }
    // inline confirm on the bulk button
    if(!closingBulkDelete.dataset.step){ closingBulkDelete.dataset.step='confirm'; closingBulkDelete.textContent='Confirm Delete'; setTimeout(()=>{ closingBulkDelete.dataset.step=''; closingBulkDelete.textContent='Delete Selected'; }, 3000); return; }
    try{
      for(const id of ids){ await postJSON(origin + '/v1/admin/agents/closing-message', { tgId: id, message: '', locale: closingLocale }); }
      closingBulkDelete.dataset.step=''; closingBulkDelete.textContent='Delete Selected';
      populateClosingAgents(); setMessagesStatus('Deleted');
    }catch{ setMessagesStatus('Failed'); }
  };

  // Message templates (simple editor)
  const templatesTable = document.createElement('div');
  templatesTable.className = 'card';
  templatesTable.innerHTML = '<div class="flex" style="justify-content:space-between"><div>System messages</div><div id="tmplStatus" style="opacity:.8"></div></div>' +
    '<div style="margin:6px 0">Locales: <span id="tmplTabs"></span> <button id="addLocaleBtn" style="margin-left:8px">Add locale</button></div>' +
    '<div id="tmplWrap"></div>';
  document.querySelector('main .grid > div').appendChild(templatesTable);
  const tmplStatus = templatesTable.querySelector('#tmplStatus');
  const tmplTabs = templatesTable.querySelector('#tmplTabs');
  const addLocaleBtn = templatesTable.querySelector('#addLocaleBtn');
  function setTmplStatus(msg){ tmplStatus.textContent = msg; setTimeout(()=>{ tmplStatus.textContent=''; }, 1500) }
  let currentLocale = localStorage.getItem('admin:tmplLocale') || 'default';
  async function refreshTabs(locales){
    // Simple inline styles to make buttons look like tabs
    if (!document.getElementById('sc-admin-tab-styles')) {
      const st = document.createElement('style'); st.id='sc-admin-tab-styles';
      st.textContent = '.sc-tab{display:inline-block;margin-right:8px;padding:6px 10px;border:1px solid #d1d5db;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;background:#f9fafb;cursor:pointer} .sc-tab[aria-selected="true"]{background:#ffffff;border-bottom-color:#2563eb;color:#111827;font-weight:600}';
      document.head.appendChild(st);
    }
    tmplTabs.innerHTML='';
    (locales||['default']).forEach((loc)=>{
      const btn=document.createElement('button'); btn.type='button'; btn.className='sc-tab'; btn.textContent=loc; btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected', String(loc===currentLocale));
      btn.onclick=(e)=>{ e.preventDefault(); e.stopPropagation(); currentLocale=loc; localStorage.setItem('admin:tmplLocale', loc); loadTemplates(); };
      tmplTabs.appendChild(btn);
    });
    // keep focus on active tab
    try{ const active = tmplTabs.querySelector('button[aria-selected="true"]'); if(active) active.focus(); }catch(_){ }
  }
  async function loadTemplates(){
    const wrap = templatesTable.querySelector('#tmplWrap'); wrap.innerHTML = '';
    const y = window.scrollY || 0;
    try{
      const all = await fetchJSON(origin + '/v1/admin/message-templates');
      const locales = Array.from(new Set((all||[]).map(r=>r.locale||'default')));
      if (!locales.includes('default')) locales.unshift('default');
      await refreshTabs(locales);
      // Add delete-locale button when not default
      let del = templatesTable.querySelector('#delLocaleBtn');
      if (currentLocale !== 'default') {
        if (!del) {
          del = document.createElement('button'); del.id='delLocaleBtn'; del.textContent='Delete locale'; del.style.marginLeft='8px'; tmplTabs.after(del);
          del.onclick = async()=>{ if(!confirm('Delete all templates for locale '+currentLocale+'?')) return; try{ await postJSON(origin + '/v1/admin/message-templates/delete-locale', { locale: currentLocale }); localStorage.setItem('admin:tmplLocale','default'); currentLocale='default'; setTmplStatus('Deleted'); loadTemplates(); }catch{ setTmplStatus('Failed'); } };
        }
      } else { if (del) del.remove(); }
      const list = (all||[]).filter(r=> (r.locale||'default') === currentLocale);
      const table = document.createElement('table'); table.className='table';
      table.innerHTML = '<thead><tr><th>Key</th><th>Enabled</th><th style="width:44%">Text</th><th>WS</th><th>Persist</th><th>Telegram</th><th>Pin</th><th>Rate(s)</th><th>Save</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');
      (list||[]).forEach((t)=>{
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td'); tdKey.textContent = t.key; tr.appendChild(tdKey);
        const tdEn = document.createElement('td'); const cEn = document.createElement('input'); cEn.type='checkbox'; cEn.checked=!!t.enabled; tdEn.appendChild(cEn); tr.appendChild(tdEn);
        const tdText = document.createElement('td'); const ta = document.createElement('textarea'); ta.rows=2; ta.style.width='100%'; ta.value = (t.text||'').toString(); tdText.appendChild(ta); tr.appendChild(tdText);
        const tdWs = document.createElement('td'); const cWs = document.createElement('input'); cWs.type='checkbox'; cWs.checked=!!t.toCustomerWs; tdWs.appendChild(cWs); tr.appendChild(tdWs);
        const tdPe = document.createElement('td'); const cPe = document.createElement('input'); cPe.type='checkbox'; cPe.checked=!!t.toCustomerPersist; tdPe.appendChild(cPe); tr.appendChild(tdPe);
        const tdTg = document.createElement('td'); const cTg = document.createElement('input'); cTg.type='checkbox'; cTg.checked=!!t.toTelegram; tdTg.appendChild(cTg); tr.appendChild(tdTg);
        const tdPin = document.createElement('td'); const cPin = document.createElement('input'); cPin.type='checkbox'; cPin.checked=!!t.pinInTopic; cPin.disabled = !cTg.checked; cTg.onchange = ()=>{ cPin.disabled = !cTg.checked; if(!cTg.checked) cPin.checked=false; }; tdPin.appendChild(cPin); tr.appendChild(tdPin);
        const tdRate = document.createElement('td'); const inpRate = document.createElement('input'); inpRate.type='number'; inpRate.min='0'; inpRate.placeholder='sec'; inpRate.style.width='72px'; inpRate.value = (t.rateLimitPerConvSec==null?'':String(t.rateLimitPerConvSec)); tdRate.appendChild(inpRate); tr.appendChild(tdRate);
        const tdSave = document.createElement('td'); const btnSave = document.createElement('button'); btnSave.textContent='Save'; btnSave.onclick=async()=>{
          btnSave.disabled=true; try{
            await postJSON(origin + '/v1/admin/message-templates/upsert', {
              key: t.key,
              enabled: !!cEn.checked,
              text: ta.value,
              toCustomerWs: !!cWs.checked,
              toCustomerPersist: !!cPe.checked,
              toTelegram: !!cTg.checked,
              pinInTopic: !!cPin.checked,
              rateLimitPerConvSec: inpRate.value ? parseInt(inpRate.value,10) : null,
              locale: currentLocale,
            }); setTmplStatus('Saved'); // reload to reflect persisted values and keep locale sticky
            setTimeout(()=>{ loadTemplates(); }, 300);
          }catch{ setTmplStatus('Failed'); }
          finally{ btnSave.disabled=false; }
        }; tdSave.appendChild(btnSave); tr.appendChild(tdSave);
        tbody.appendChild(tr);
      });
      wrap.appendChild(table);
    }catch{ wrap.textContent = 'Failed to load templates'; }
    // restore scroll to avoid jump
    try{ window.scrollTo(0, y); }catch(_){ }
  }
  addLocaleBtn.onclick = async()=>{
    // Inline add-locale UI
    const parent = templatesTable;
    let box = parent.querySelector('#addLocaleBox');
    if (!box) {
      box = document.createElement('div'); box.id='addLocaleBox'; box.style.margin='6px 0';
      box.innerHTML = '<input id="newLocaleInp" placeholder="e.g., en, lv, de" style="width:140px"> <button id="newLocaleCreate">Create</button> <span id="newLocaleStatus" style="margin-left:8px;opacity:.8"></span>';
      addLocaleBtn.after(box);
      const inp = box.querySelector('#newLocaleInp'); const btn = box.querySelector('#newLocaleCreate'); const status = box.querySelector('#newLocaleStatus');
      btn.onclick = async ()=>{
        const loc = (inp.value||'').trim(); if(!loc){ status.textContent='Enter code'; setTimeout(()=>status.textContent='',1200); return; }
        try{
          // Fetch existing templates and copy from default
          const all = await fetchJSON(origin + '/v1/admin/message-templates');
          const defaults = (all||[]).filter(r=> (r.locale||'default')==='default');
          for(const t of defaults){
            await postJSON(origin + '/v1/admin/message-templates/upsert', {
              key: t.key,
              enabled: !!t.enabled,
              text: t.text||'',
              toCustomerWs: !!t.toCustomerWs,
              toCustomerPersist: !!t.toCustomerPersist,
              toTelegram: !!t.toTelegram,
              pinInTopic: !!t.pinInTopic,
              rateLimitPerConvSec: t.rateLimitPerConvSec==null?null:Number(t.rateLimitPerConvSec),
              locale: loc,
            });
          }
          localStorage.setItem('admin:tmplLocale', loc); currentLocale = loc; status.textContent='Created'; setTimeout(()=>status.textContent='',1200);
          loadTemplates();
        }catch{ status.textContent='Failed'; setTimeout(()=>status.textContent='',1200); }
      };
    } else {
      box.remove();
    }
  };
  // load on init

  statusSel.onchange = loadConversations;
  // debounce dynamic search (3+ chars)
  let searchTimer = null; searchInput.addEventListener('input', ()=>{ clearTimeout(searchTimer); searchTimer = setTimeout(()=>{ const q=(searchInput.value||'').trim(); if(q.length===0 || q.length>=3){ loadConversations(); } }, 250); });
  autoRefresh.onchange = () => {
    if (autoRefresh.checked) {
      refreshTimer = setInterval(() => { loadConversations(); }, 15000);
    } else {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  (function init(){ tokenInput.value = getToken(); statusSel.value='all'; refreshMetricsBtn.click(); loadSettings(); loadConversations(); loadAgents(); populateClosingAgents(); loadTemplates(); })();
})();
