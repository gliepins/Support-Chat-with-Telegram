(function(){
  var d=document,w=window;
  // Simple once-style injection guard
  var __scwStyleInjected = false;
  function cssVar(name, fallback){
    try{ var v=getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v||fallback; }catch(_){ return fallback }
  }
  function clamp01(x){ try{ var n=parseFloat(x); if(!isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }catch(_){ return 0 } }
  function isDarkTheme(){
    try{
      // Check for data-theme attribute
      var html = document.documentElement;
      if (html.getAttribute('data-theme') === 'dark') return true;
      // Check for theme-dark class
      if (html.classList.contains('theme-dark')) return true;
      if (document.body && document.body.classList.contains('theme-dark')) return true;
      // Check for dark color scheme via media query
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Only trust this if background is actually dark
        var bg = getComputedStyle(document.body).backgroundColor;
        if (bg) {
          var rgb = bg.match(/\d+/g);
          if (rgb && rgb.length >= 3) {
            var brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
            if (brightness < 128) return true;
          }
        }
      }
    }catch(_){}
    return false;
  }
  function getColors(dark){
    return {
      primary: cssVar('--color-primary-main', dark ? '#4A9EFF' : '#2563eb'),
      primaryDark: cssVar('--color-primary-dark', dark ? '#66B2FF' : '#1e40af'),
      bgPaper: cssVar('--color-background-paper', dark ? '#161B22' : '#ffffff'),
      bgDefault: cssVar('--color-background-default', dark ? '#0D1117' : '#ffffff'),
      textPrimary: cssVar('--color-text-primary', dark ? '#F0F6FC' : '#111827'),
      textInverse: dark ? '#0D1117' : '#ffffff',
      border: cssVar('--color-border-main', dark ? '#30363D' : '#e5e7eb'),
      muted: dark ? '#8B949E' : '#6b7280'
    };
  }
  function buildStyle(COLORS, dark){
    return '\n'
    + '.scw-btn{position:fixed;right:16px;bottom:16px;background:'+COLORS.primary+';color:'+COLORS.textInverse+';border-radius:999px;padding:12px 16px;font:14px sans-serif;cursor:pointer;z-index:2147483000;box-shadow:0 8px 20px '+(dark?'rgba(0,0,0,.4)':'rgba(0,0,0,.15)')+'}\n'
    + '.scw-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border-radius:999px;min-width:18px;height:18px;display:none;align-items:center;justify-content:center;font:11px sans-serif;padding:0 5px}\n'
    + '.scw-panel{position:fixed;right:16px;bottom:64px;width:380px;height:600px;background:'+COLORS.bgPaper+';border:1px solid '+COLORS.border+';border-radius:12px;box-shadow:0 16px 30px '+(dark?'rgba(0,0,0,.5)':'rgba(0,0,0,.2)')+';display:none;flex-direction:column;overflow:hidden;z-index:2147483000}\n'
    + '.scw-head{padding:10px 12px;background:'+COLORS.primaryDark+';color:'+COLORS.textInverse+';font:600 14px sans-serif;display:flex;justify-content:space-between;align-items:center}\n'
    + '.scw-head .scw-actions{display:flex;gap:10px;align-items:center}\n'
    + '.scw-edit{cursor:pointer;opacity:.9}\n.scw-edit:hover{opacity:1}\n'
    + '.scw-name-edit{display:flex;gap:6px;align-items:center;margin-left:8px;flex-wrap:wrap}\n'
    + '.scw-name-edit input{flex:1 1 100%;min-width:0;padding:4px 6px;border-radius:6px;border:1px solid '+COLORS.border+';font:12px sans-serif;background:'+COLORS.bgPaper+';color:'+COLORS.textPrimary+'}\n'
    + '.scw-name-btn{background:#10b981;border:0;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font:12px sans-serif}\n.scw-name-cancel{background:'+COLORS.muted+';color:'+COLORS.textInverse+'}\n'
    + '.scw-banner{display:none;background:'+COLORS.primaryDark+';color:'+COLORS.textInverse+';font:12px sans-serif;padding:6px 8px;border-bottom:1px solid '+COLORS.border+'}\n'
    + '.scw-body{flex:1;overflow:auto;padding:8px;background:'+(dark?COLORS.bgDefault:cssVar('--color-background-default','#f9fafb'))+'}\n'
    + '.scw-msg{margin:6px 0;max-width:84%;padding:8px 10px;border-radius:10px;font:14px sans-serif;display:flex;gap:8px;align-items:flex-end;flex-direction:column;word-break:break-word;overflow-wrap:anywhere}\n'
    + '.scw-line{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}\n'
    + '.scw-in{background:'+COLORS.primary+';color:'+COLORS.textInverse+';margin-left:auto;align-items:flex-end}\n'
    + '.scw-out{background:'+(dark?'#21262D':COLORS.border)+';color:'+COLORS.textPrimary+';margin-right:auto;align-items:flex-start}\n'
    + '.scw-time{opacity:.7;font:11px sans-serif;color:'+COLORS.textPrimary+'}\n'
    + '.scw-agent{opacity:.85;font:11px sans-serif;margin-bottom:2px;color:'+COLORS.textPrimary+'}\n'
    + '.scw-input{display:flex;border-top:1px solid '+COLORS.border+';background:'+COLORS.bgPaper+'}\n'
    + '.scw-input textarea{flex:1;border:0;padding:10px;font:14px sans-serif;outline:none;background:'+COLORS.bgPaper+';color:'+COLORS.textPrimary+';resize:none;min-height:38px;max-height:140px;line-height:1.35;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}\n'
    + '.scw-input button{border:0;background:'+COLORS.primary+';color:'+COLORS.textInverse+';padding:0 12px;font:14px sans-serif;cursor:pointer}\n'
    + '.scw-retry{cursor:pointer;color:'+(dark?'#FDB022':'#fde68a')+';margin-left:8px;text-decoration:underline}\n'
    + '@media (max-width: 480px){.scw-panel{width:92vw;height:70vh}}\n';
  }

  var dark = isDarkTheme();
  var COLORS = getColors(dark);
  var STYLE = buildStyle(COLORS, dark);
  var styleElement = null;

  function el(tag,cls,text){var e=d.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e}
  function style(){ if(__scwStyleInjected) return; styleElement=el('style'); styleElement.textContent=STYLE; styleElement.id='scw-style'; d.head.appendChild(styleElement); __scwStyleInjected=true; }
  function updateTheme(){ try{ var newDark=isDarkTheme(); if(newDark===dark) return; dark=newDark; COLORS=getColors(dark); STYLE=buildStyle(COLORS, dark); if(styleElement){ styleElement.textContent=STYLE; } }catch(_){} }
  function getCookie(name){ try{ var m=('; '+document.cookie).split('; '+name+'='); if(m.length===2) return m.pop().split(';').shift(); }catch(_){} return '' }
  function setCookie(name,val,days){ try{ var d=new Date(); d.setTime(d.getTime()+ (days||30)*24*60*60*1000); document.cookie = name+'='+encodeURIComponent(val)+'; expires='+d.toUTCString()+'; path=/'; }catch(_){} }
  function fmtTime(ts){try{var dt=new Date(ts); return dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});}catch(_){return ''}}
  function addMsg(body,dir,text,ts,agent){var wrap=el('div','scw-msg '+(dir==='IN'?'scw-in':'scw-out')); if(dir==='OUT' && agent){ var who=el('div','scw-agent',agent+':'); wrap.appendChild(who); } var line=el('div','scw-line'); line.textContent=text; var time=el('div','scw-time',fmtTime(ts||Date.now())); wrap.appendChild(line); wrap.appendChild(time); body.appendChild(wrap); body.scrollTop=body.scrollHeight}
  function addSystem(body,text,ts){var wrap=el('div','scw-msg scw-out'); var who=el('div','scw-agent'); var line=el('div','scw-line'); who.textContent=''; line.textContent=text; var time=el('div','scw-time',fmtTime(ts||Date.now())); wrap.style.opacity='.9'; wrap.style.background='transparent'; wrap.style.border='0'; wrap.style.margin='10px 0'; wrap.appendChild(line); wrap.appendChild(time); body.appendChild(wrap); body.scrollTop=body.scrollHeight}
  function start(origin,nickname,locale){
    var payload = nickname?{name:nickname}:{ };
    try{ if(locale && typeof locale==='string' && locale.trim().length){ payload.locale = locale.trim(); } }catch(_){ }
    return fetch(origin+'/v1/conversations/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(function(r){if(!r.ok)throw new Error('start failed');return r.json()})
  }
function connect(origin,token,onMsg,onOpen,onClose){var ws=new WebSocket(origin.replace(/^http/,'ws')+'/v1/ws?token='+encodeURIComponent(token));ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m&&m.type==='agent_joined'){var SS=(window.SupportChat&&window.SupportChat.__strings)||null; var who=(m.agent&&String(m.agent).trim().length)?m.agent:((SS&&SS.supportLabel)||'Support'); var suf=(SS&&SS.joinedSuffix); if(!suf){ try{ var loc=(window.SupportChat&&window.SupportChat.__locale)||''; var map=(window.SupportChat&&window.SupportChat.__opts&&window.SupportChat.__opts.stringsByLocale)||{}; var fromMap=(loc&&map[loc]&&map[loc].joinedSuffix)||(map['default']&&map['default'].joinedSuffix); suf=fromMap||' joined'; }catch(_){ suf=' joined'; } } var txt=who + suf; onMsg('SYS', txt, Date.now(), null, true);return;} if(m&&m.type==='info_note'){ onMsg('SYS', (m.text||''), Date.now()); return; } if(m&&typeof m.text==='string'){onMsg(m.direction==='OUTBOUND'?'OUT':'IN',m.text,Date.now(),m.agent)}}catch(_){} };ws.onopen=function(){onOpen&&onOpen()};ws.onclose=function(){onClose&&onClose()};ws.onerror=function(){try{ws.close()}catch(_){}};return ws}
  function patchName(origin,id,token,name){return fetch(origin+'/v1/conversations/'+encodeURIComponent(id)+'/name',{method:'PATCH',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({name:name})}).then(function(r){if(!r.ok)throw new Error('rename failed');return r.json()})}

  function detectOrigin(){ try{ var s=document.currentScript && document.currentScript.src; if(!s){ var scripts=document.getElementsByTagName('script'); if(scripts&&scripts.length) s=scripts[scripts.length-1].src; } if(s){ var u=new URL(s); return u.origin; } }catch(_){} return '' }
  function setupThemeObservers(){
    // Watch for prefers-color-scheme changes
    try{ if(w.matchMedia){ var mq=w.matchMedia('(prefers-color-scheme: dark)'); if(mq.addEventListener){ mq.addEventListener('change', updateTheme); }else if(mq.addListener){ mq.addListener(updateTheme); } } }catch(_){}
    // Watch for data-theme attribute changes on <html>
    try{ if(w.MutationObserver){ var obs=new MutationObserver(updateTheme); obs.observe(d.documentElement, {attributes:true, attributeFilter:['data-theme','class']}); if(d.body){ obs.observe(d.body, {attributes:true, attributeFilter:['class']}); } } }catch(_){}
  }
  function init(opts){style();setupThemeObservers();var origin=((opts&&opts.origin)||detectOrigin()).replace(/\/$/,'');var store=w.localStorage||{getItem:function(){},setItem:function(){}};
    var pageLocale = (function(){ try{
      var fromOpt = opts&&opts.locale; if(fromOpt) return String(fromOpt);
      // Prefer i18next persisted language if present
      try{ var ls=w.localStorage; if(ls && ls.getItem){ var v=ls.getItem('i18nextLng'); if(v) return String(v); } }catch(_){ }
      var fromCookie = getCookie('i18nextLng'); if(fromCookie) return String(fromCookie);
      var htmlLang = d.documentElement && d.documentElement.lang; if(htmlLang) return String(htmlLang);
      var navLang = (w.navigator && (navigator.language||navigator.userLanguage)); if(navLang) return String(navLang);
    }catch(_){ } return 'default'; })();
    // Optional site-wide gating: includePaths / excludePaths (string with * globs or RegExp)
    function toRegex(p){
      if (p && typeof p === 'object' && p.source) { return p; }
      if (typeof p === 'string') {
        try {
          // Escape all regex specials EXCEPT '*', then convert '*' wildcards to '.*'
          var esc = p.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
          return new RegExp('^' + esc + '$');
        } catch(_) { return null }
      }
      return null;
    }
    function pathMatches(list, path){ if(!list||!list.length) return false; for(var i=0;i<list.length;i++){ var rx=toRegex(list[i]); if(rx && rx.test(path)) return true; } return false }
    var includePaths = Array.isArray(opts&&opts.includePaths)? opts.includePaths : null;
    var excludePaths = Array.isArray(opts&&opts.excludePaths)? opts.excludePaths : null;
    // persist options globally for recheck/show/hide and route observation
    w.SupportChat = w.SupportChat || {}; w.SupportChat.__opts = opts || {};
    if (opts && opts.observeRoute && !w.SupportChat.__observeSetup) {
      try{
        var _push=w.history.pushState, _replace=w.history.replaceState;
        var notify=function(){ try{ w.dispatchEvent(new Event('scw:navigate')); }catch(_){ } };
        w.history.pushState=function(){ try{ _push.apply(w.history, arguments); }catch(_){ } notify(); };
        w.history.replaceState=function(){ try{ _replace.apply(w.history, arguments); }catch(_){ } notify(); };
        w.addEventListener('popstate', notify); w.addEventListener('hashchange', notify);
        w.addEventListener('scw:navigate', function(){ try{ w.SupportChat && w.SupportChat.recheck && w.SupportChat.recheck(); }catch(_){ } });
        w.SupportChat.__observeSetup = true;
      }catch(_){ }
    }
    var curPath = (w.location && w.location.pathname) || '/';
    var denied = pathMatches(excludePaths, curPath);
    var allowed = !includePaths || includePaths.length===0 || pathMatches(includePaths, curPath);
    if (denied || !allowed) { return; }
    var STR_DEFAULT={
      chatButton:'Message us',
      title:'Support',
      reconnecting:'Reconnecting…',
      offline:'Offline. Check your connection.',
      connecting:'Connecting…',
      retry:'Retry',
      inputPlaceholder:'Type a message…',
      sendLabel:'Send',
      editNamePlaceholder:'Your name',
      saveLabel:'Save',
      cancelLabel:'Cancel',
      confirmYes:'Yes',
      confirmNo:'No',
      editLabel:'Edit',
      clearConfirm:'Clear chat history?',
      closedPrompt:'Conversation closed. Start new?',
      soundOn:'Sound on',
      soundOff:'Sound off',
      vibrationOn:'Vibration on',
      vibrationOff:'Vibration off',
      supportLabel:'Support',
      joinedSuffix:' joined'
    };
    // Merge locale-specific strings if provided via stringsByLocale
    var STR_LOCALE = (function(){ try{ var map = opts && opts.stringsByLocale; if(!map) return null; var k = String(pageLocale||'').toLowerCase(); if(k.length>=2) k = k.slice(0,2); return map[k] || map['default'] || null; }catch(_){ return null } })();
    var STR = (function(){ var base = {}; for(var k in STR_DEFAULT){ base[k]=STR_DEFAULT[k]; }
      if (STR_LOCALE) { for(var k in STR_LOCALE){ if(STR_LOCALE[k]!=null) base[k]=String(STR_LOCALE[k]); } }
      if (opts&&opts.strings){ for(var k in STR_DEFAULT){ if(opts.strings[k]!=null) base[k]=String(opts.strings[k]); } }
      return base; })();
    try{ w.SupportChat = w.SupportChat || {}; w.SupportChat.__strings = STR; w.SupportChat.__locale = String((pageLocale||'')).toLowerCase().slice(0,2)||'default'; }catch(_){ }
    function getS(){ try{ return (w.SupportChat && w.SupportChat.__strings) || STR; }catch(_){ return STR } }
    function prefGet(k,def){ try{ var v=store.getItem(k); return v===null||v===undefined||v===''? def : v; }catch(_){ return def } }
    function prefSet(k,v){ try{ store.setItem(k, v); }catch(_){} }

    var cfg_showSound = (opts&&typeof opts.showSoundToggle==='boolean') ? !!opts.showSoundToggle : true;
    var cfg_showVibrate = (opts&&typeof opts.showVibrationToggle==='boolean') ? !!opts.showVibrationToggle : true;
    // Default prefs: only seed if not already set by the user/browser
    try { if ((opts&&opts.soundDefaultOn===true) && (store.getItem('scw:notify:sound')==null)) { store.setItem('scw:notify:sound','1'); } } catch(_){}
    try { if ((opts&&opts.vibrationDefaultOn===true) && (store.getItem('scw:notify:vibrate')==null)) { store.setItem('scw:notify:vibrate','1'); } } catch(_){}
    var cfg_beepGain = (opts&&typeof opts.soundGain==='number') ? Math.max(0.1, Math.min(5, opts.soundGain)) : 1;
    var initVol = (opts&&typeof opts.soundVolume==='number') ? clamp01(opts.soundVolume) : null;
    if (initVol!=null) { prefSet('scw:notify:volume', String(initVol)); }

    var btn=el('div','scw-btn',STR.chatButton); var badge=el('div','scw-badge','0'); btn.style.position='fixed'; btn.style.bottom='16px'; var pos=(opts&&opts.position||'right')==='left'?'left':'right'; btn.style[pos]='16px'; btn.style[('right'===pos?'left':'right')]='auto'; btn.appendChild(badge);

    var panel=el('div','scw-panel'); panel.style[pos]='16px'; panel.style[('right'===pos?'left':'right')]='auto';
    var head=el('div','scw-head'); var title=el('div','', STR.title); var actions=el('div','scw-actions'); var edit=el('div','scw-edit','✎'); try{ edit.title = (getS().editLabel||STR.editLabel); }catch(_){ }
    var soundBtn=cfg_showSound?el('div','scw-edit'):null; var vibrateBtn=cfg_showVibrate?el('div','scw-edit'):null;
    var minimize=el('div','scw-edit','_'); var clearBtn=el('div','scw-edit','×');
    function updateNotifyIcons(){ var snd=String(prefGet('scw:notify:sound','0'))==='1'; var vib=String(prefGet('scw:notify:vibrate','0'))==='1'; if(soundBtn){ soundBtn.textContent = snd ? '🔔' : '🔕'; soundBtn.title = snd ? STR.soundOn : STR.soundOff; } if(vibrateBtn){ vibrateBtn.textContent = vib ? '📳' : '🔇'; vibrateBtn.title = vib ? STR.vibrationOn : STR.vibrationOff; } }
    if (soundBtn) soundBtn.onclick=function(){ primeAudio(); var cur=String(prefGet('scw:notify:sound','0'))==='1'; prefSet('scw:notify:sound', cur?'0':'1'); updateNotifyIcons(); };
    if (vibrateBtn) vibrateBtn.onclick=function(){ var cur=String(prefGet('scw:notify:vibrate','0'))==='1'; prefSet('scw:notify:vibrate', cur?'0':'1'); updateNotifyIcons(); };
    updateNotifyIcons();
    actions.appendChild(edit); if(soundBtn) actions.appendChild(soundBtn); if(vibrateBtn) actions.appendChild(vibrateBtn); actions.appendChild(minimize); actions.appendChild(clearBtn); head.appendChild(title); head.appendChild(actions);
    var banner=el('div','scw-banner',STR.reconnecting);
    var body=el('div','scw-body');
    var inputWrap=el('div','scw-input'); var input=el('textarea'); input.placeholder=STR.inputPlaceholder; var sendBtn=el('button','', STR.sendLabel); inputWrap.appendChild(input); inputWrap.appendChild(sendBtn);
    panel.appendChild(head); panel.appendChild(banner); panel.appendChild(body); panel.appendChild(inputWrap); d.body.appendChild(btn); d.body.appendChild(panel);
    // expose minimal UI refs for programmatic control
    try { w.SupportChat.__ui = { btn: btn, panel: panel, title: title, input: input, sendBtn: sendBtn, soundBtn: soundBtn, vibrateBtn: vibrateBtn, banner: banner, edit: edit }; w.SupportChat.__built = true; } catch(_){ }

    // Connectivity banner helpers
    function setBanner(msg, withRetry){ banner.style.display='block'; banner.textContent=msg; if(withRetry){ var r=el('span','scw-retry',STR.retry); r.onclick=function(){ ensureConn(true) }; banner.appendChild(r); } }
    function hideBanner(){ banner.style.display='none'; banner.textContent=''; try{ while(banner.firstChild){ banner.removeChild(banner.firstChild); } }catch(_){} }

    // Typing helpers with dot animation
    var typingTimer=null, typingDotsTimer=null, typingBase='';
    function showTyping(_durationMs){ /* disabled */ }
    function hideTyping(){ /* disabled */ }

    // Notification helpers (AudioContext requires a user gesture)
    var audioCtx=null, audioPrimed=false; function getVolume(){ var v=clamp01(prefGet('scw:notify:volume','1')); return v; }
    function primeAudio(){ try{ audioCtx = audioCtx || new (w.AudioContext||w.webkitAudioContext)(); if(audioCtx && audioCtx.state==='suspended'){ audioCtx.resume(); } audioPrimed=true; }catch(_){} }
    try{ d.addEventListener('click', function once(){ primeAudio(); try{ d.removeEventListener('click', once); }catch(_){ } }, { once:true, capture:true }); }catch(_){ }
    function playBeep(){ if(!audioPrimed){ return; } try{ audioCtx = audioCtx || new (w.AudioContext||w.webkitAudioContext)(); if(audioCtx.state==='suspended'){ try{ audioCtx.resume(); }catch(_){} } var o=audioCtx.createOscillator(); var g=audioCtx.createGain(); o.type='sine'; o.frequency.value=1100; var peak=Math.min(1.0, Math.max(0.0002, 0.25*getVolume()*cfg_beepGain)); var t0=audioCtx.currentTime; g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0+0.03); g.gain.linearRampToValueAtTime(0.0001, t0+0.32); o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0+0.34); }catch(_){} }
    function vibrate(){ try{ if(navigator.vibrate) navigator.vibrate(20); }catch(_){} }
    function shouldNotifyOutbound(){ try{ var open = panel.style.display==='flex'; return !open || !d.hasFocus(); }catch(_){ return true } }

    var ws=null, connecting=false, queue=[], unread=0, reconnectAttempts=0, lastLocalEcho='';
    function showBadge(){ badge.style.display = unread>0 ? 'flex' : 'none'; badge.textContent=String(unread) }
    function continuityCheck(){var ts=parseInt(store.getItem('scw:ts')||'0',10)||0;var maxAge=30*24*60*60*1000; if(ts && (Date.now()-ts)>maxAge){ store.removeItem('scw:id'); store.removeItem('scw:token'); }}
    continuityCheck();
    function ensureSession(forceNew){ var id=store.getItem('scw:id')||getCookie('scw_id'); var token=store.getItem('scw:token')||getCookie('scw_token'); if(!forceNew && id && token){ store.setItem('scw:id',id); store.setItem('scw:token',token); return Promise.resolve({conversation_id:id, token:token}) } var forcedLoc=null; try{ forcedLoc=(w.SupportChat&&w.SupportChat.__forcedLocale)||null; }catch(_){ } var raw = forcedLoc || pageLocale; var norm=''; try{ norm=String(raw||'').toLowerCase().slice(0,2); }catch(_){ }
      var sendLoc = (raw && typeof raw==='string' && raw.toLowerCase()!=='default' && /^[a-z]{2}$/.test(norm)) ? norm : undefined;
      return start(origin,store.getItem('scw:name')||undefined,sendLoc).then(function(s){ store.setItem('scw:origin',origin); store.setItem('scw:id',s.conversation_id); store.setItem('scw:token',s.token); setCookie('scw_id', s.conversation_id, 30); setCookie('scw_token', s.token, 30); store.setItem('scw:ts', String(Date.now())); return {conversation_id:s.conversation_id, token:s.token} }) }
    function updateTitle(){ var S=getS(); var name=store.getItem('scw:name'); title.textContent = name?(S.supportLabel+' — '+name):S.title }; updateTitle();

    function clearSession(){ try{ store.removeItem('scw:id'); store.removeItem('scw:token'); setCookie('scw_id','',-1); setCookie('scw_token','',-1);}catch(_){} }
    function loadHistory(){ var id=store.getItem('scw:id'); if(!id) return Promise.resolve(); return fetch(origin + '/v1/conversations/' + encodeURIComponent(id) + '/messages').then(function(r){ if(r.status===404){ throw new Error('gone'); } if(!r.ok) throw new Error('bad'); return r.json() }).then(function(payload){ var status=payload.status; var msgs=payload.messages||[]; body.innerHTML=''; msgs.forEach(function(m){ addMsg(body, m.direction==='INBOUND'?'IN':'OUT', m.text, new Date(m.createdAt).getTime(), m.agent) }); if(status==='CLOSED'){ addSystem(body,'Conversation closed. Start new?', Date.now()); } }).catch(function(){ clearSession(); return ensureSession(true).then(function(s){ body.innerHTML=''; return fetch(origin + '/v1/conversations/' + encodeURIComponent(s.conversation_id) + '/messages').then(function(r){ if(!r.ok) return; return r.json() }).then(function(payload){ if(!payload) return; var msgs=payload.messages||[]; msgs.forEach(function(m){ addMsg(body, m.direction==='INBOUND'?'IN':'OUT', m.text, new Date(m.createdAt).getTime(), m.agent) }); }); }); }) }

    function connectNow(token){ if(connecting) return; connecting=true; if(ws && ws.readyState===1){connecting=false; return;} if(!navigator.onLine){ setBanner(STR.offline, true); } else { setBanner(reconnectAttempts>0? STR.reconnecting : STR.connecting, true); }
      ws = connect(origin, token, function(dir,text,ts,agent,joined){ if(dir==='SYS'){ addSystem(body,text,ts); if(joined){ showTyping(6000); } return;} if(dir==='IN' && lastLocalEcho && text===lastLocalEcho){ lastLocalEcho=''; return;} if(dir==='OUT'){ hideTyping(); } addMsg(body,dir,text,ts,agent); if(panel.style.display!=='flex' && dir==='OUT'){ unread++; showBadge(); } if(dir==='OUT' && shouldNotifyOutbound()){ if(String(prefGet('scw:notify:sound','0'))==='1'){ playBeep(); } if(String(prefGet('scw:notify:vibrate','0'))==='1'){ vibrate(); } } }, function(){ connecting=false; reconnectAttempts=0; hideBanner(); while(queue.length){ try{ ws.send(queue.shift()) }catch(_){ } } }, function(){ connecting=false; reconnectAttempts++; if(!navigator.onLine){ setBanner(STR.offline, true); } else { setBanner(STR.reconnecting, true); showTyping(6000); } if(reconnectAttempts>=3){ clearSession(); ensureSession(true).then(function(s){ loadHistory().then(function(){ connectNow(s.token) }) }); } else { var delay = Math.min(10000, 500 * reconnectAttempts); setTimeout(function(){ ensureConn() }, delay) } });
    }
    function ensureConn(forceImmediate){ ensureSession(false).then(function(s){ if(forceImmediate){ reconnectAttempts=0; } connectNow(s.token) }) }
    function sendText(text){ if(ws && ws.readyState===1){ try{ ws.send(text); }catch(_){ queue.push(text); ensureConn(true); } } else { queue.push(text); ensureConn(true); } lastLocalEcho=text; addMsg(body,'IN',text,Date.now()); showTyping(4000); }

    function openPanel(){ panel.style.display='flex'; store.setItem('scw:ts', String(Date.now())); store.setItem('scw:open','1'); unread=0; showBadge(); ensureSession(false).then(function(s){ loadHistory().then(function(){ connectNow(s.token) }); }); }
    function minimizePanel(){ panel.style.display='none'; try{ store.removeItem('scw:open'); }catch(_){ } }
    function clearSessionAndReset(){ try{ store.removeItem('scw:id'); store.removeItem('scw:token'); store.removeItem('scw:name'); store.removeItem('scw:draft'); setCookie('scw_id','',-1); setCookie('scw_token','',-1);}catch(_){ } body.innerHTML=''; title.textContent='Support'; unread=0; showBadge(); }
    btn.onclick=function(){ primeAudio(); panel.style.display==='flex'?minimizePanel():openPanel() };
    minimize.onclick=minimizePanel;
    clearBtn.onclick=function(){
      // Inline confirmation inside banner area
      var S=getS();
      banner.style.display='block';
      banner.textContent=S.clearConfirm;
      try{ while(banner.firstChild){ banner.removeChild(banner.firstChild); } }catch(_){ }
      banner.textContent=S.clearConfirm+' ';
      var yes=el('button','scw-name-btn', S.confirmYes||'Yes');
      var no=el('button','scw-name-btn scw-name-cancel', S.confirmNo||'No');
      yes.style.marginLeft='8px'; no.style.marginLeft='6px';
      banner.appendChild(yes); banner.appendChild(no);
      no.onclick=function(){ hideBanner(); };
      yes.onclick=function(){ hideBanner(); clearSessionAndReset(); minimizePanel(); };
    };

var editing=false; edit.onclick=function(){ if(editing) return; editing=true; ensureSession(false).then(function(s){ var S=getS(); var current=store.getItem('scw:name')||''; var wrap=el('div','scw-name-edit'); var inp=el('input'); inp.value=current; inp.placeholder=S.editNamePlaceholder; var save=el('button','scw-name-btn',S.saveLabel); var cancel=el('button','scw-name-btn scw-name-cancel',S.cancelLabel); wrap.appendChild(inp); wrap.appendChild(save); wrap.appendChild(cancel); head.insertBefore(wrap, actions); try{ actions.style.display='none'; }catch(_){ } function done(){ try{ head.removeChild(wrap); }catch(_){ } try{ actions.style.display=''; }catch(_){ } editing=false; } cancel.onclick=done; save.onclick=function(){ var name=inp.value.trim(); if(!name){ done(); return; } patchName(origin, store.getItem('scw:id'), (store.getItem('scw:token')||''), name).then(function(){ store.setItem('scw:name',name); updateTitle(); done(); }).catch(function(){ alert('Could not update name right now. Please try later.'); done(); }); }; inp.addEventListener('keydown',function(e){ if(e.key==='Enter') save.onclick(); if(e.key==='Escape') cancel.onclick(); }); setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(_){ } }, 0); }); };

    // Auto-open panel logic
    try {
      if (opts && opts.openOnLoad === true) {
        openPanel();
      } else if (store.getItem('scw:open') === '1') {
        openPanel();
      }
    } catch(_){ }

    function autosize(){ input.style.height='auto'; var h=Math.min(140, Math.max(38, input.scrollHeight)); input.style.height=h+'px'; }
    input.addEventListener('input', function(){ store.setItem('scw:draft', input.value||''); autosize(); });
    sendBtn.onclick=function(){ primeAudio(); var t=input.value.trim();if(!t)return; input.value=''; store.removeItem('scw:draft'); autosize(); sendText(t); };
    input.addEventListener('keydown',function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendBtn.onclick(); } });
    // restore draft
    var draft=store.getItem('scw:draft'); if(draft){ input.value=draft; setTimeout(autosize,0); }

    // Listen to browser connectivity changes
    try{
      w.addEventListener('offline', function(){ setBanner('Offline. Check your connection.', true); });
      w.addEventListener('online', function(){ setBanner('Connecting…', true); ensureConn(true); });
    }catch(_){ }
  }
  w.SupportChat=w.SupportChat||{};w.SupportChat.init=init;
  // Programmatic controls
  w.SupportChat.show = function(){ try{ var ui=w.SupportChat.__ui; if(ui&&ui.btn){ ui.btn.style.display=''; } }catch(_){ } };
  w.SupportChat.hide = function(){ try{ var ui=w.SupportChat.__ui; if(ui&&ui.btn){ ui.btn.style.display='none'; } if(ui&&ui.panel){ ui.panel.style.display='none'; } }catch(_){ } };
  w.SupportChat.recheck = function(){ try{
    var opts=w.SupportChat.__opts||{}; var path=(w.location&&w.location.pathname)||'/';
    function toRegex(p){ if(p && typeof p==='object' && p.source){ return p; } if(typeof p==='string'){ var esc=p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*'); try{ return new RegExp('^'+esc+'$'); }catch(_){ return null } } return null }
    function match(list){ if(!list||!list.length) return false; for(var i=0;i<list.length;i++){ var rx=toRegex(list[i]); if(rx && rx.test(path)) return true; } return false }
    var denied=match(Array.isArray(opts.excludePaths)?opts.excludePaths:null);
    var allowed=!(Array.isArray(opts.includePaths)&&opts.includePaths.length) || match(opts.includePaths);
    if(denied || !allowed){ w.SupportChat.hide(); return; }
    // If UI is not built yet (was previously denied), build now
    if(!w.SupportChat.__built){ w.SupportChat.init(opts); return; }
    // Ensure visible
    w.SupportChat.show();
  }catch(_){ } };
  // Update conversation locale at runtime (PATCH)
  w.SupportChat.setLocale = function(newLocale){ try{
    var loc = (newLocale||'').toString().toLowerCase().slice(0,2); if(!loc) return Promise.resolve();
    // Remember forced locale for future session creation
    try{ w.SupportChat.__forcedLocale = loc; }catch(_){ }
    // Update UI strings live regardless of session state
    try{
      var opts = w.SupportChat.__opts||{}; var map = opts.stringsByLocale||{}; var k=loc; var STR_LOCALE = map[k] || map[k&&k.slice(0,2)] || map['default'] || null;
      var STR_DEFAULT = {
        chatButton:'Message us', title:'Support', reconnecting:'Reconnecting…', offline:'Offline. Check your connection.', connecting:'Connecting…', retry:'Retry', inputPlaceholder:'Type a message…', sendLabel:'Send', editNamePlaceholder:'Your name', saveLabel:'Save', cancelLabel:'Cancel', editLabel:'Edit', clearConfirm:'Clear chat history and start new?', closedPrompt:'Conversation closed. Start new?', soundOn:'Sound on', soundOff:'Sound off', vibrationOn:'Vibration on', vibrationOff:'Vibration off', supportLabel:'Support', joinedSuffix:' joined'
      };
      var STR = {}; for(var kk in STR_DEFAULT){ STR[kk]=STR_DEFAULT[kk]; }
      if (STR_LOCALE) { for(var kk in STR_LOCALE){ if(STR_LOCALE[kk]!=null) STR[kk]=String(STR_LOCALE[kk]); } }
      if (opts.strings){ for(var kk in STR_DEFAULT){ if(opts.strings[kk]!=null) STR[kk]=String(opts.strings[kk]); } }
      var ui = w.SupportChat.__ui || {}; if(ui.btn) ui.btn.textContent = STR.chatButton; if(ui.edit) ui.edit.title = STR.editLabel; if(ui.title) ui.title.textContent = STR.title; if(ui.input) ui.input.placeholder = STR.inputPlaceholder; if(ui.sendBtn) ui.sendBtn.textContent = STR.sendLabel; if(ui.soundBtn){ var sndOn = String((w.localStorage||{}).getItem && (w.localStorage||{}).getItem('scw:notify:sound')||'0')==='1'; ui.soundBtn.title = sndOn?STR.soundOn:STR.soundOff; ui.soundBtn.textContent = sndOn?'🔔':'🔕'; } if(ui.vibrateBtn){ var vibOn = String((w.localStorage||{}).getItem && (w.localStorage||{}).getItem('scw:notify:vibrate')||'0')==='1'; ui.vibrateBtn.title = vibOn?STR.vibrationOn:STR.vibrationOff; ui.vibrateBtn.textContent = vibOn?'📳':'🔇'; }
      // also re-apply titles on header controls to avoid stale English
      try{ if(ui.edit) ui.edit.title = STR.editLabel; }catch(_){ }
      // If name edit is open, update its placeholder and buttons too
      try{
        var head = (ui && ui.title && ui.title.parentElement) ? ui.title.parentElement : null;
        var wrap = head ? head.querySelector('.scw-name-edit') : null;
        if(wrap){
          var inp = wrap.querySelector('input'); if(inp) inp.placeholder = STR.editNamePlaceholder;
          var btns = wrap.getElementsByTagName('button'); if(btns && btns[0]) btns[0].textContent = STR.saveLabel; if(btns && btns[1]) btns[1].textContent = STR.cancelLabel;
        }
      }catch(_){ }
    }catch(_){ }
    // Try to patch server if session exists; otherwise resolve
    var store = w.localStorage||{getItem:function(){},setItem:function(){}};
    var id = store.getItem('scw:id')||''; var token = store.getItem('scw:token')||''; var origin = store.getItem('scw:origin')||'';
    if(!id || !token || !origin) return Promise.resolve();
    return fetch(origin + '/v1/conversations/' + encodeURIComponent(id) + '/locale', { method:'PATCH', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+token }, body: JSON.stringify({ locale: loc }) }).then(function(){ return; })
  }catch(_){ return Promise.resolve(); } };
})();
