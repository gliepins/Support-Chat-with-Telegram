(function(){
  var d=document,w=window;
  var STYLE='\n.scw-btn{position:fixed;right:16px;bottom:16px;background:#2563eb;color:#fff;border-radius:999px;padding:12px 16px;font:14px sans-serif;cursor:pointer;z-index:2147483000;box-shadow:0 8px 20px rgba(0,0,0,.15)}\n.scw-panel{position:fixed;right:16px;bottom:64px;width:320px;height:420px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 16px 30px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:2147483000}\n.scw-head{padding:10px 12px;background:#111827;color:#fff;font:600 14px sans-serif;display:flex;justify-content:space-between;align-items:center}\n.scw-head .scw-actions{display:flex;gap:10px;align-items:center}\n.scw-edit{cursor:pointer;opacity:.9}\n.scw-edit:hover{opacity:1}\n.scw-name-edit{display:flex;gap:6px;align-items:center;margin-left:8px}\n.scw-name-edit input{width:140px;padding:4px 6px;border-radius:6px;border:1px solid #e5e7eb;font:12px sans-serif}\n.scw-name-btn{background:#10b981;border:0;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font:12px sans-serif}\n.scw-name-cancel{background:#6b7280}\n.scw-body{flex:1;overflow:auto;padding:8px;background:#f9fafb}\n.scw-msg{margin:6px 0;max-width:80%;padding:8px 10px;border-radius:10px;font:14px sans-serif}\n.scw-in{background:#2563eb;color:#fff;margin-left:auto}\n.scw-out{background:#e5e7eb;color:#111827;margin-right:auto}\n.scw-input{display:flex;border-top:1px solid #e5e7eb}\n.scw-input input{flex:1;border:0;padding:10px;font:14px sans-serif;outline:none}\n.scw-input button{border:0;background:#2563eb;color:#fff;padding:0 12px;font:14px sans-serif;cursor:pointer}\n';
  function el(tag,cls,text){var e=d.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
  function style(){var s=el('style');s.textContent=STYLE;d.head.appendChild(s)}
  function addMsg(body,dir,text){var m=el('div','scw-msg '+(dir==='IN'?'scw-in':'scw-out'));m.textContent=text;body.appendChild(m);body.scrollTop=body.scrollHeight}
  function start(origin,nickname){return fetch(origin+'/v1/conversations/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(nickname?{name:nickname}:{})}).then(function(r){if(!r.ok)throw new Error('start failed');return r.json()})}
  function connect(origin,token,onMsg){var ws=new WebSocket(origin.replace(/^http/,'ws')+'/v1/ws?token='+encodeURIComponent(token));ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m&&typeof m.text==='string'){onMsg(m.direction==='OUTBOUND'?'OUT':'IN',m.text)}}catch(_){} };return ws}
  function patchName(origin,id,token,name){return fetch(origin+'/v1/conversations/'+encodeURIComponent(id)+'/name',{method:'PATCH',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({name:name})}).then(function(r){if(!r.ok)throw new Error('rename failed');return r.json()})}
  function init(opts){style();var origin=(opts.origin||'').replace(/\/$/,'');var store=w.localStorage||{getItem:function(){},setItem:function(){}};var btn=el('div','scw-btn','Chat');var panel=el('div','scw-panel');var head=el('div','scw-head');var title=el('div','', 'Support');var actions=el('div','scw-actions');var edit=el('div','scw-edit','✎');var close=el('div','', '×');actions.appendChild(edit);actions.appendChild(close);head.appendChild(title);head.appendChild(actions);var body=el('div','scw-body');var inputWrap=el('div','scw-input');var input=el('input');input.placeholder='Type a message…';var sendBtn=el('button','', 'Send');inputWrap.appendChild(input);inputWrap.appendChild(sendBtn);panel.appendChild(head);panel.appendChild(body);panel.appendChild(inputWrap);d.body.appendChild(btn);d.body.appendChild(panel);
    var ws=null, connecting=false, queue=[];
    function ensureSession(){var savedOrigin=store.getItem('scw:origin');var id=store.getItem('scw:id');var token=store.getItem('scw:token');if(savedOrigin===origin && id && token){return Promise.resolve({conversation_id:id,token:token})}return start(origin,opts.nickname).then(function(s){store.setItem('scw:origin',origin);store.setItem('scw:id',s.conversation_id);store.setItem('scw:token',s.token);if(opts.nickname){store.setItem('scw:name',opts.nickname)}return {conversation_id:s.conversation_id,token:s.token}})}
    function updateTitle(){var name=store.getItem('scw:name');title.textContent = name?('Support — '+name):'Support'}
    updateTitle();
    function connectNow(token){ if(connecting) return; connecting=true; try{ if(ws && ws.readyState===1){connecting=false; return;} }catch(_){}
      ws = connect(origin, token, function(dir,text){addMsg(body,dir,text)});
      ws.onopen = function(){ connecting=false; while(queue.length){ try{ ws.send(queue.shift()) }catch(_){} } };
      ws.onclose = function(){ connecting=false; setTimeout(function(){ ensureConn() }, 1500) };
      ws.onerror = function(){ try{ ws.close() }catch(_){} };
    }
    function ensureConn(){ ensureSession().then(function(s){ connectNow(s.token) }) }
    function sendText(text){ if(ws && ws.readyState===1){ try{ ws.send(text); return }catch(_){} } queue.push(text); ensureConn(); }

    function openPanel(){ panel.style.display='flex'; ensureConn(); }
    function closePanel(){ panel.style.display='none'; }
    btn.onclick=function(){panel.style.display==='flex'?closePanel():openPanel()};
    close.onclick=closePanel;

    // Inline name editor
    var editing=false;
    edit.onclick=function(){ if(editing) return; editing=true; ensureSession().then(function(s){
      var current=store.getItem('scw:name')||'';
      var wrap=el('div','scw-name-edit');
      var inp=el('input'); inp.value=current; inp.placeholder='Your name';
      var save=el('button','scw-name-btn','Save');
      var cancel=el('button','scw-name-btn scw-name-cancel','Cancel');
      wrap.appendChild(inp); wrap.appendChild(save); wrap.appendChild(cancel);
      head.insertBefore(wrap, actions);
      function done(){ try{ head.removeChild(wrap); }catch(_){} editing=false; }
      cancel.onclick=done;
      save.onclick=function(){ var name=inp.value.trim(); if(!name){ done(); return; }
        patchName(origin, store.getItem('scw:id'), s.token, name)
          .then(function(){ store.setItem('scw:name',name); updateTitle(); done(); })
          .catch(function(){ alert('Could not update name right now. Please try later.'); done(); });
      };
      inp.addEventListener('keydown',function(e){ if(e.key==='Enter') save.onclick(); if(e.key==='Escape') cancel.onclick(); });
      setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(_){} }, 0);
    }); };

    sendBtn.onclick=function(){var t=input.value.trim();if(!t)return; input.value=''; sendText(t); };
    input.addEventListener('keydown',function(e){if(e.key==='Enter')sendBtn.onclick()});
  }
  w.SupportChat=w.SupportChat||{};w.SupportChat.init=init;
})();
