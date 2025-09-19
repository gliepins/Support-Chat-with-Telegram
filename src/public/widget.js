(function(){
  var d=document,w=window;
  function cssVar(name, fallback){
    try{ var v=getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v||fallback; }catch(_){ return fallback }
  }
  var COLORS={
    primary: cssVar('--color-primary-main', '#2563eb'),
    primaryDark: cssVar('--color-primary-dark', '#1e40af'),
    bgPaper: cssVar('--color-background-paper', '#ffffff'),
    bgDefault: cssVar('--color-background-default', '#ffffff'),
    textPrimary: cssVar('--color-text-primary', '#111827'),
    textInverse: '#ffffff',
    border: cssVar('--color-border-main', '#e5e7eb'),
    muted: '#6b7280'
  };
  var STYLE='\n'
    + '.scw-btn{position:fixed;right:16px;bottom:16px;background:'+COLORS.primary+';color:'+COLORS.textInverse+';border-radius:999px;padding:12px 16px;font:14px sans-serif;cursor:pointer;z-index:2147483000;box-shadow:0 8px 20px rgba(0,0,0,.15)}\n'
    + '.scw-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:999px;min-width:18px;height:18px;display:none;align-items:center;justify-content:center;font:11px sans-serif;padding:0 5px}\n'
    + '.scw-panel{position:fixed;right:16px;bottom:64px;width:380px;height:600px;background:'+COLORS.bgPaper+';border:1px solid '+COLORS.border+';border-radius:12px;box-shadow:0 16px 30px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:2147483000}\n'
    + '.scw-head{padding:10px 12px;background:'+COLORS.primaryDark+';color:'+COLORS.textInverse+';font:600 14px sans-serif;display:flex;justify-content:space-between;align-items:center}\n'
    + '.scw-head .scw-actions{display:flex;gap:10px;align-items:center}\n'
    + '.scw-edit{cursor:pointer;opacity:.9}\n.scw-edit:hover{opacity:1}\n'
    + '.scw-name-edit{display:flex;gap:6px;align-items:center;margin-left:8px}\n'
    + '.scw-name-edit input{width:160px;padding:4px 6px;border-radius:6px;border:1px solid '+COLORS.border+';font:12px sans-serif;background:'+COLORS.bgDefault+';color:'+COLORS.textPrimary+'}\n'
    + '.scw-name-btn{background:#10b981;border:0;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font:12px sans-serif}\n.scw-name-cancel{background:'+COLORS.muted+'}\n'
    + '.scw-banner{display:none;background:'+COLORS.primaryDark+';color:'+COLORS.textInverse+';font:12px sans-serif;padding:6px 8px;border-bottom:1px solid '+COLORS.border+'}\n'
    + '.scw-body{flex:1;overflow:auto;padding:8px;background:'+cssVar('--color-background-default', '#f9fafb')+'}\n'
    + '.scw-msg{margin:6px 0;max-width:84%;padding:8px 10px;border-radius:10px;font:14px sans-serif;display:flex;gap:8px;align-items:flex-end;flex-direction:column}\n'
    + '.scw-in{background:'+COLORS.primary+';color:'+COLORS.textInverse+';margin-left:auto;align-items:flex-end}\n'
    + '.scw-out{background:'+COLORS.border+';color:'+COLORS.textPrimary+';margin-right:auto;align-items:flex-start}\n'
    + '.scw-time{opacity:.7;font:11px sans-serif}\n'
    + '.scw-agent{opacity:.85;font:11px sans-serif;margin-bottom:2px}\n'
    + '.scw-input{display:flex;border-top:1px solid '+COLORS.border+'}\n'
    + '.scw-input input{flex:1;border:0;padding:10px;font:14px sans-serif;outline:none;background:'+COLORS.bgDefault+';color:'+COLORS.textPrimary+'}\n'
    + '.scw-input button{border:0;background:'+COLORS.primary+';color:'+COLORS.textInverse+';padding:0 12px;font:14px sans-serif;cursor:pointer}\n'
    + '@media (max-width: 480px){.scw-panel{width:92vw;height:70vh}}\n';

  function el(tag,cls,text){var e=d.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
  function style(){var s=el('style');s.textContent=STYLE;d.head.appendChild(s)}
  function fmtTime(ts){try{var dt=new Date(ts); return dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});}catch(_){return ''}}
  function addMsg(body,dir,text,ts,agent){var wrap=el('div','scw-msg '+(dir==='IN'?'scw-in':'scw-out')); if(dir==='OUT' && agent){ var who=el('div','scw-agent',agent); wrap.appendChild(who); } var line=el('div',''); line.textContent=text; var time=el('div','scw-time',fmtTime(ts||Date.now())); wrap.appendChild(line); wrap.appendChild(time); body.appendChild(wrap); body.scrollTop=body.scrollHeight}
  function start(origin,nickname){return fetch(origin+'/v1/conversations/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(nickname?{name:nickname}:{})}).then(function(r){if(!r.ok)throw new Error('start failed');return r.json()})}
  function connect(origin,token,onMsg,onOpen,onClose){var ws=new WebSocket(origin.replace(/^http/,'ws')+'/v1/ws?token='+encodeURIComponent(token));ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m&&typeof m.text==='string'){onMsg(m.direction==='OUTBOUND'?'OUT':'IN',m.text,Date.now(),m.agent)}}catch(_){} };ws.onopen=function(){onOpen&&onOpen()};ws.onclose=function(){onClose&&onClose()};ws.onerror=function(){try{ws.close()}catch(_){}};return ws}
  function patchName(origin,id,token,name){return fetch(origin+'/v1/conversations/'+encodeURIComponent(id)+'/name',{method:'PATCH',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({name:name})}).then(function(r){if(!r.ok)throw new Error('rename failed');return r.json()})}

  function init(opts){style();var origin=(opts.origin||'').replace(/\/$/,'');var store=w.localStorage||{getItem:function(){},setItem:function(){}};
    var btn=el('div','scw-btn','Chat'); var badge=el('div','scw-badge','0'); btn.style.position='fixed'; btn.style.bottom='16px'; var pos=(opts.position||'right')==='left'?'left':'right'; btn.style[pos]='16px'; btn.style[('right'===pos?'left':'right')]='auto'; btn.appendChild(badge);

    var panel=el('div','scw-panel'); panel.style[pos]='16px'; panel.style[('right'===pos?'left':'right')]='auto';
    var head=el('div','scw-head'); var title=el('div','', 'Support'); var actions=el('div','scw-actions'); var edit=el('div','scw-edit','✎'); var close=el('div','', '×'); actions.appendChild(edit); actions.appendChild(close); head.appendChild(title); head.appendChild(actions);
    var banner=el('div','scw-banner','Reconnecting…');
    var body=el('div','scw-body');
    var inputWrap=el('div','scw-input'); var input=el('input'); input.placeholder='Type a message…'; var sendBtn=el('button','', 'Send'); inputWrap.appendChild(input); inputWrap.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(banner); panel.appendChild(body); panel.appendChild(inputWrap); d.body.appendChild(btn); d.body.appendChild(panel);

    var ws=null, connecting=false, queue=[], unread=0, reconnectAttempts=0;
    function showBadge(){ badge.style.display = unread>0 ? 'flex' : 'none'; badge.textContent=String(unread) }
    function continuityCheck(){var ts=parseInt(store.getItem('scw:ts')||'0',10)||0;var maxAge=30*24*60*60*1000; if(ts && (Date.now()-ts)>maxAge){ store.removeItem('scw:id'); store.removeItem('scw:token'); }}
    continuityCheck();
    function ensureSession(forceNew){ var savedOrigin=store.getItem('scw:origin'); var id=store.getItem('scw:id'); var token=store.getItem('scw:token'); if(!forceNew && savedOrigin===origin && id && token){ return Promise.resolve({conversation_id:id, token:token}) } return start(origin,store.getItem('scw:name')||undefined).then(function(s){ store.setItem('scw:origin',origin); store.setItem('scw:id',s.conversation_id); store.setItem('scw:token',s.token); store.setItem('scw:ts', String(Date.now())); return {conversation_id:s.conversation_id, token:s.token} }) }
    function updateTitle(){var name=store.getItem('scw:name');title.textContent = name?('Support — '+name):'Support'}; updateTitle();

    function loadHistory(){ var id=store.getItem('scw:id'); if(!id) return Promise.resolve(); return fetch(origin + '/v1/conversations/' + encodeURIComponent(id) + '/messages').then(function(r){ if(!r.ok) throw new Error(); return r.json() }).then(function(msgs){ body.innerHTML=''; msgs.forEach(function(m){ addMsg(body, m.direction==='INBOUND'?'IN':'OUT', m.text, new Date(m.createdAt).getTime()) }); }).catch(function(){ /* ignore */ }) }

    function connectNow(token){ if(connecting) return; connecting=true; if(ws && ws.readyState===1){connecting=false; return;} banner.style.display='block'; banner.textContent = reconnectAttempts>0? 'Reconnecting…' : 'Connecting…';
      ws = connect(origin, token, function(dir,text,ts,agent){ addMsg(body,dir,text,ts,agent); if(panel.style.display!=='flex' && dir==='OUT'){ unread++; showBadge(); } }, function(){ connecting=false; reconnectAttempts=0; banner.style.display='none'; while(queue.length){ try{ ws.send(queue.shift()) }catch(_){ } } }, function(){ connecting=false; reconnectAttempts++; banner.style.display='block'; if(reconnectAttempts>=3){ store.removeItem('scw:id'); store.removeItem('scw:token'); ensureSession(true).then(function(s){ loadHistory().then(function(){ connectNow(s.token) }) }); } else { setTimeout(function(){ ensureConn() }, 1500) } });
    }
    function ensureConn(){ ensureSession(false).then(function(s){ connectNow(s.token) }) }
    function sendText(text){ if(ws && ws.readyState===1){ try{ ws.send(text); return }catch(_){ } } queue.push(text); ensureConn(); }

    function openPanel(){ panel.style.display='flex'; store.setItem('scw:ts', String(Date.now())); unread=0; showBadge(); loadHistory().then(ensureConn); }
    function closePanel(){ panel.style.display='none'; }
    btn.onclick=function(){panel.style.display==='flex'?closePanel():openPanel()}; close.onclick=closePanel;

    var editing=false; edit.onclick=function(){ if(editing) return; editing=true; ensureSession(false).then(function(s){ var current=store.getItem('scw:name')||''; var wrap=el('div','scw-name-edit'); var inp=el('input'); inp.value=current; inp.placeholder='Your name'; var save=el('button','scw-name-btn','Save'); var cancel=el('button','scw-name-btn scw-name-cancel','Cancel'); wrap.appendChild(inp); wrap.appendChild(save); wrap.appendChild(cancel); head.insertBefore(wrap, actions); function done(){ try{ head.removeChild(wrap); }catch(_){ } editing=false; } cancel.onclick=done; save.onclick=function(){ var name=inp.value.trim(); if(!name){ done(); return; } patchName(origin, store.getItem('scw:id'), (store.getItem('scw:token')||''), name).then(function(){ store.setItem('scw:name',name); updateTitle(); done(); }).catch(function(){ alert('Could not update name right now. Please try later.'); done(); }); }; inp.addEventListener('keydown',function(e){ if(e.key==='Enter') save.onclick(); if(e.key==='Escape') cancel.onclick(); }); setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(_){ } }, 0); }); };

    sendBtn.onclick=function(){var t=input.value.trim();if(!t)return; input.value=''; sendText(t); };
    input.addEventListener('keydown',function(e){if(e.key==='Enter')sendBtn.onclick()});
  }
  w.SupportChat=w.SupportChat||{};w.SupportChat.init=init;
})();
