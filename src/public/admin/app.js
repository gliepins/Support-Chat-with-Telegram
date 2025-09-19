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
  const loadBtn = document.getElementById('load');
  const statusSel = document.getElementById('status');
  const searchInput = document.getElementById('search');
  const autoRefresh = document.getElementById('autoRefresh');
  const rows = document.getElementById('rows');
  const selectAll = document.getElementById('selectAll');
  const deleteSelected = document.getElementById('deleteSelected');
  const deleteByStatus = document.getElementById('deleteByStatus');
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

  function bindRowClicks(){
    Array.from(rows.querySelectorAll('tr[data-id]')).forEach((tr) => {
      tr.onclick = async () => {
        const id = tr.getAttribute('data-id'); if(!id) return;
        detail.textContent = 'Loading…'; detailTitle.textContent = id;
        try {
          const msgs = await fetchJSON(origin + '/v1/conversations/' + encodeURIComponent(id) + '/messages');
          if (!Array.isArray(msgs) || msgs.length === 0) { detail.textContent = 'No messages.'; return; }
          detail.textContent = msgs.map(m => `${new Date(m.createdAt).toLocaleString()}  ${m.direction}: ${m.text}`).join('\n');
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
        tr.innerHTML = `<td>${cb}</td><td>${c.id}</td><td>${c.codename}</td><td>${c.customerName||''}</td><td><span class=\"badge\">${c.status}</span></td>`;
        const td = document.createElement('td');
        const btnClose = document.createElement('button'); btnClose.textContent='Close'; btnClose.onclick = async (e)=>{ e.stopPropagation(); try{ await postJSON(origin + '/v1/moderation/close', { id: c.id }); loadConversations(); }catch{ alert('Close failed'); } };
        const btnBlock = document.createElement('button'); btnBlock.textContent='Block'; btnBlock.style.marginLeft='6px'; btnBlock.onclick = async (e)=>{ e.stopPropagation(); try{ await postJSON(origin + '/v1/moderation/block', { id: c.id }); loadConversations(); }catch{ alert('Block failed'); } };
        const aJson = document.createElement('a'); aJson.textContent='Export JSON'; aJson.href = '#'; aJson.style.marginLeft='6px'; aJson.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); fetch(origin + '/v1/conversations/' + encodeURIComponent(c.id) + '/export.json', { headers: authHeaders() }).then(r=>r.blob()).then(b=>{ const url=URL.createObjectURL(b); const dl=document.createElement('a'); dl.href=url; dl.download='conversation_'+c.id+'.json'; dl.click(); URL.revokeObjectURL(url); }); };
        const aCsv = document.createElement('a'); aCsv.textContent='Export CSV'; aCsv.href = '#'; aCsv.style.marginLeft='6px'; aCsv.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); fetch(origin + '/v1/conversations/' + encodeURIComponent(c.id) + '/export.csv', { headers: authHeaders() }).then(r=>r.blob()).then(b=>{ const url=URL.createObjectURL(b); const dl=document.createElement('a'); dl.href=url; dl.download='conversation_'+c.id+'.csv'; dl.click(); URL.revokeObjectURL(url); }); };
        td.append(btnClose, btnBlock, aJson, aCsv); tr.appendChild(td); rows.appendChild(tr);
      }
      bindRowClicks();
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
    if (!confirm('Delete '+ids.length+' selected conversation(s)?')) return;
    try {
      const r = await fetch(origin + '/v1/admin/conversations/bulk-delete', { method: 'POST', headers: Object.assign({'content-type':'application/json'}, authHeaders()), body: JSON.stringify({ ids }) });
      const json = await r.json().catch(()=>({}));
      bulkStatus.textContent = 'Deleted ' + (json && typeof json.deleted==='number' ? json.deleted : ids.length);
      setTimeout(()=>bulkStatus.textContent='',1500);
      loadConversations();
    } catch { bulkStatus.textContent = 'Failed'; setTimeout(()=>bulkStatus.textContent='',1200); }
  };
  deleteByStatus.onclick = async () => {
    const status = statusSel.value;
    if (!confirm('Delete ALL conversations in status: '+status+' ?')) return;
    try {
      const r = await fetch(origin + '/v1/admin/conversations/bulk-delete', { method: 'POST', headers: Object.assign({'content-type':'application/json'}, authHeaders()), body: JSON.stringify({ status }) });
      const json = await r.json().catch(()=>({}));
      bulkStatus.textContent = 'Deleted ' + (json && typeof json.deleted==='number' ? json.deleted : '');
      setTimeout(()=>bulkStatus.textContent='',1500);
      loadConversations();
    } catch { bulkStatus.textContent = 'Failed'; setTimeout(()=>bulkStatus.textContent='',1200); }
  };

  // Agents management
  const agentsRows = document.getElementById('agentsRows');
  const agentTgId = document.getElementById('agentTgId');
  const agentName = document.getElementById('agentName');
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
        const dis=document.createElement('button'); dis.textContent='Disable'; dis.onclick=async()=>{ try{ await postJSON(origin + '/v1/admin/agents/disable', { tgId: a.tgId }); setAgentsStatus('Disabled'); loadAgents(); }catch{ setAgentsStatus('Failed'); } };
        td.appendChild(dis); tr.appendChild(td); agentsRows.appendChild(tr);
      }
    }catch{ const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=4; td.textContent='Failed to load agents'; tr.appendChild(td); agentsRows.appendChild(tr); }
  }

  agentSave.onclick = async ()=>{
    const id = (agentTgId.value||'').trim(); const name = (agentName.value||'').trim(); if(!id||!name){ setAgentsStatus('Fill fields'); return; }
    try{ await postJSON(origin + '/v1/admin/agents/upsert', { tgId: id, displayName: name }); setAgentsStatus('Saved'); agentName.value=''; loadAgents(); }catch{ setAgentsStatus('Failed'); }
  };
  agentsReload.onclick = loadAgents;

  loadBtn.onclick = loadConversations;
  autoRefresh.onchange = () => {
    if (autoRefresh.checked) {
      refreshTimer = setInterval(() => { loadConversations(); }, 15000);
    } else {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  (function init(){ tokenInput.value = getToken(); statusSel.value='all'; refreshMetricsBtn.click(); loadConversations(); loadAgents(); })();
})();
