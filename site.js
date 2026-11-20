// ===== EDIT THIS BLOCK =====
const CONFIG={
 email:'myhopealivenetwork@gmail.com',
 hero:'',       // optional home-page photo: file path or Google Drive share link
 donateLink:'', // optional online payment page (Paystack, Flutterwave, GoFundMe...)
 formspree:'',  // optional Formspree form URL so the contact form sends without opening email
 turnstileSiteKey:'', // optional Cloudflare Turnstile site key; pair with TURNSTILE_SECRET_KEY in Supabase
 stats:[],      // real figures only, e.g. {n:'250',l:'children supported'}
 phone:'',      // optional public number, e.g. '+234 800 000 0000'
 whatsapp:'',   // optional, digits only with country code, e.g. '2348000000000'
 social:{Facebook:'',Instagram:'',X:'',LinkedIn:'',YouTube:''}, // paste full page URLs
 bank:{bank:'',name:'HopeAlive Foundation for Education and Community Development',number:''}, // the Foundation's own account; shows once number is filled
 gallery:[],    // {src:'images/x.jpg' or a Google Drive share link (Anyone with the link), cap:'Arts for healing'}
 team:[         // p = photo (file path or Drive link), b = optional short bio
  {n:'Hope Kalu',r:'Chairman, Board of Trustees',p:'',b:''},
  {n:'Lazarus Kalu',r:'Trustee',p:'',b:''},
  {n:'Uchechukwu Chikezie',r:'Trustee and Secretary',p:'',b:''}
 ]
};
// ===== SITE CODE =====
const C=CONFIG,$=s=>document.querySelector(s),B=document.body,pg=B.dataset.page;
const hopeDbReady=new Promise(resolve=>{const s=document.createElement('script');s.src='supabase-client.js';s.onload=()=>window.hopeSupabaseReady.then(resolve).catch(()=>resolve(null));s.onerror=()=>resolve(null);document.head.appendChild(s)});
const set=(s,h)=>{const e=$(s);if(e)e.innerHTML=h};
const IMG=u=>{const m=/drive\.google\.com\/.*?(?:\/d\/|[?&]id=)([\w-]+)/.exec(u||'');return m?`https://lh3.googleusercontent.com/d/${m[1]}=w1400`:u};
const COL=['--sun','--coral','--leaf','--plum','--sky'];
const NAV=[['index','Home'],['about','About'],['programmes','Programmes'],['team','Trustees'],['gallery','Gallery'],['blog','Blog'],['contact','Contact']];
const PIL=[
['--coral','Child protection','Ensuring the safety, health and protection of children in homes, schools and communities.'],
['--sun','Educational opportunity','Creating educational opportunities for vulnerable children by mobilising resources.'],
['--plum','Healing through the arts','Using sports, music, dance and drama to support the rehabilitation of traumatised children.'],
['--leaf','Sustainable development','Promoting community-led development that makes use of sustainable technologies.'],
['--sky','Holistic transformation','Offering education, empowerment and exposure to innovation for youth and disadvantaged communities.']];
document.head.insertAdjacentHTML('beforeend','<meta name="theme-color" content="#ffc233"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Ccircle cx=\'16\' cy=\'16\' r=\'14\' fill=\'%23ffc233\' stroke=\'%2314143c\' stroke-width=\'3\'/%3E%3C/svg%3E">');
B.insertAdjacentHTML('afterbegin',`<svg width="0" height="0" style="position:absolute" aria-hidden="true">${['<path d="M0 100V0a100 100 0 0 1 100 100z"/>','<circle cx="50" cy="50" r="50"/>','<path d="M0 100V50a50 50 0 0 1 100 0v50z"/>','<path d="M0 100C0 45 45 0 100 0c0 55-45 100-100 100z"/>','<path d="M50 0c5 35 15 45 50 50-35 5-45 15-50 50-5-35-15-45-50-50 35-5 45-15 50-50z"/>'].map((s,i)=>`<symbol id="s${i+1}" viewBox="0 0 100 100" fill="currentColor">${s}</symbol>`).join('')}</svg><a class="skip" href="#main">Skip to content</a><header><div class="wrap"><nav aria-label="Main"><a class="logo" href="index.html"><span class="dot"></span>HopeAlive</a><button id="bg" aria-expanded="false" aria-controls="menu">Menu</button><ul id="menu">${NAV.map(([f,t])=>`<li><a href="${f}.html"${f==pg||(f=='blog'&&pg=='post')?' aria-current="page"':''}>${t}</a></li>`).join('')}<li><a class="btn" href="get-involved.html">Donate</a></li></ul></nav></div></header>`);
B.insertAdjacentHTML('beforeend',`<footer><div class="wrap"><a class="logo" href="index.html"><span class="dot"></span>HopeAlive</a><p><b>HopeAlive Foundation for Education and Community Development</b></p><p>Incorporated Trustees, CAC IT No. 8700520</p><p>Tax ID (TIN): 33447613-0001</p><p>No 8, Umuozuo Street, Aba, Abia State, Nigeria</p><p class="fl">${NAV.concat([['get-involved','Get involved']]).map(([f,t])=>`<a href="${f}.html">${t}</a>`).join('')}</p><p>&copy; ${new Date().getFullYear()} HopeAlive Foundation. Not-for-profit and non-political.</p></div></footer><div id="lb" role="dialog" aria-label="Photo viewer"><button class="x" aria-label="Close">&times;</button><button class="pv" aria-label="Previous photo">&lsaquo;</button><img alt=""><button class="nx" aria-label="Next photo">&rsaquo;</button><p id="lc"></p></div>`);
const bg=$('#bg'),menu=$('#menu'),lb=$('#lb');
bg.onclick=()=>bg.setAttribute('aria-expanded',menu.classList.toggle('open'));
menu.onclick=e=>{if(e.target.matches('a')){menu.classList.remove('open');bg.setAttribute('aria-expanded','false')}};
let gi=0,galleryItems=C.gallery.slice();
const show=i=>{const n=galleryItems.length;if(!n)return;const x=galleryItems[gi=(i+n)%n];lb.querySelector('img').src=IMG(x.src);$('#lc').textContent=x.cap||'';lb.classList.add('on')};
document.onclick=e=>{const t=e.target,i=t.dataset&&t.dataset.i;
 if(t.tagName=='IMG'&&i!==undefined)show(+i);
 else if(t.matches('.pv'))show(gi-1);
 else if(t.matches('.nx'))show(gi+1);
 else if(t.matches('.cp')){navigator.clipboard.writeText(t.dataset.c);t.textContent='Copied'}
 else if(t==lb||t.matches('.x'))lb.classList.remove('on')};
document.onkeydown=e=>{if(!lb.classList.contains('on'))return;if(e.key=='Escape')lb.classList.remove('on');if(e.key=='ArrowLeft')show(gi-1);if(e.key=='ArrowRight')show(gi+1)};
let tx=0;lb.ontouchstart=e=>{tx=e.touches[0].clientX};lb.ontouchend=e=>{const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>50)show(gi+(d<0?1:-1))};
(async()=>{
const J=async f=>{try{const r=await fetch(f+'?v='+Date.now());return r.ok?await r.json():null}catch(_){return null}};
const db=await hopeDbReady;let st=null,po=null;
let mediaRows=[],settingsLoaded=false,postsLoaded=false;
if(db){try{const [{data:sr,error:se},{data:pr,error:pe}]=await Promise.all([db.from('site_settings').select('settings').eq('id',1).maybeSingle(),db.from('posts').select('*').eq('is_draft',false).order('published_at',{ascending:false})]);if(!se){settingsLoaded=true;st=sr&&sr.settings&&typeof sr.settings==='object'?sr.settings:{}}if(!pe){postsLoaded=true;po=(pr||[]).map(p=>({slug:p.slug,title:p.title,date:p.published_at||'',cat:p.category,tags:p.tags||[],author:p.author,excerpt:p.excerpt,img:p.featured_image,body:p.body_html,media:p.media||[],draft:p.is_draft}))}}catch(_){}try{const {data:mr,error:me}=await db.from('media_assets').select('*').eq('is_published',true).order('created_at',{ascending:false});if(!me&&mr)mediaRows=mr}catch(_){}}
if(!settingsLoaded)st=await J('data/settings.json');if(!postsLoaded)po=await J('data/posts.json');if(st)Object.assign(C,st);galleryItems=[...C.gallery.map(x=>({...x,type:x.type||'image',category:x.category||'General'})),...mediaRows.map(m=>({src:m.public_url,cap:m.display_name||m.filename,description:m.caption||'',alt:m.alt_text||m.display_name||m.filename,category:m.category,type:m.media_type,path:m.storage_path}))];
set('#pill',PIL.map(([c,t,d],i)=>`<li style="--c:var(${c})"><svg aria-hidden="true"><use href="#s${i+1}"/></svg><h3>${t}</h3><p>${d}</p></li>`).join(''));
set('#tiles',PIL.map(([c,t],i)=>`<a class="tile" href="programmes.html" style="--c:var(${c})"><svg aria-hidden="true"><use href="#s${i+1}"/></svg>${t}</a>`).join(''));
set('#crew',C.team.map((t,i)=>`<div><div class="av" style="--c:var(${COL[i%3]})">${t.p?`<img src="${IMG(t.p)}" alt="${t.n}">`:t.n.split(' ').map(w=>w[0]).join('')}</div><h3>${t.n}</h3><p><b>${t.r}</b></p>${t.b?`<p style="margin-top:8px">${t.b}</p>`:''}</div>`).join(''));
const escMedia=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderGallery=filter=>{const available=galleryItems.map((x,i)=>({x,i})),categories=['All',...new Set(galleryItems.map(x=>x.category||'General'))],items=available.filter(v=>filter==='All'||(v.x.category||'General')===filter);const bar=$('#gallery-filters');if(bar){bar.innerHTML=categories.map(c=>'<button type="button" data-gallery-filter="'+escMedia(c)+'" aria-pressed="'+(c===filter)+'">'+escMedia(c)+'</button>').join('');bar.querySelectorAll('[data-gallery-filter]').forEach(b=>b.onclick=()=>renderGallery(b.dataset.galleryFilter))}set('#gal',items.length?items.map(v=>{const x=v.x,i=v.i,cap=x.cap||x.category||'HopeAlive programme';return '<figure>'+(x.type==='video'?'<video controls playsinline preload="metadata" src="'+escMedia(x.src)+'"></video>':'<img data-i="'+i+'" src="'+escMedia(IMG(x.src))+'" alt="'+escMedia(x.alt||cap)+'" loading="lazy">')+(cap?'<figcaption>'+escMedia(cap)+(x.description?'<br><span>'+escMedia(x.description)+'</span>':'')+'</figcaption>':'')+'</figure>'}).join(''):[1,2,3,4,5,6].map(i=>'<figure><svg class="ph" aria-hidden="true"><use href="#s'+((i-1)%5+1)+'"/></svg><figcaption>Photo coming soon</figcaption></figure>').join(''))};
renderGallery('All');
const K=C.bank;
set('#bank',(C.donateLink?`<p><a class="btn" href="${C.donateLink}" target="_blank" rel="noopener">Donate online</a></p>`:'')+(K.number?`<dl><dt>Bank</dt><dd>${K.bank}</dd><dt>Account name</dt><dd>${K.name}</dd><dt>Account number</dt><dd><b>${K.number}</b><button class="cp" data-c="${K.number}">Copy</button></dd></dl>`:C.donateLink?'':'<p>Email us and we’ll share our official account details.</p>'));
const hd=$('.dice');
if(hd&&C.hero)hd.outerHTML=`<div class="arch"><img src="${IMG(C.hero)}" alt="HopeAlive Foundation programme"><svg aria-hidden="true" class="a1"><use href="#s2"/></svg><svg aria-hidden="true" class="a2"><use href="#s1"/></svg></div>`;
set('#stats',C.stats.map(s=>`<div><b>${s.n}</b>${s.l}</div>`).join(''));
set('#strip',galleryItems.map((x,i)=>({x,i})).filter(v=>v.x.type!=='video').slice(0,4).map(v=>'<img data-i="'+v.i+'" src="'+escMedia(IMG(v.x.src))+'" alt="'+escMedia(v.x.cap||'HopeAlive programme photo')+'" loading="lazy">').join(''));
[['#impact',C.stats],['#moments',galleryItems]].forEach(([q,a])=>{const e=$(q);if(e)e.hidden=!a.length});
if(C.whatsapp)B.insertAdjacentHTML('beforeend',`<a class="wa" href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">Chat on WhatsApp</a>`);
document.querySelectorAll('[data-m]').forEach(a=>a.href=`mailto:${C.email}?subject=${encodeURIComponent(a.dataset.m)}`);
const L=[['Email',`<a href="mailto:${C.email}">${C.email}</a>`],['Address','No 8, Umuozuo Street, Aba, Abia State, Nigeria']];
if(C.phone)L.push(['Phone',`<a href="tel:${C.phone.replace(/\s/g,'')}">${C.phone}</a>`]);
if(C.whatsapp)L.push(['WhatsApp',`<a href="https://wa.me/${C.whatsapp}">Message us</a>`]);
const S=Object.entries(C.social).filter(([,u])=>u);
if(S.length)L.push(['Follow us',S.map(([k,u])=>`<a href="${u}" target="_blank" rel="noopener">${k}</a>`).join(', ')]);
set('#details',L.map(([k,v])=>`<p><b>${k}</b><br>${v}</p>`).join(''));
const fm=$('#form');let turnstileToken='';
if(fm&&C.turnstileSiteKey){const widget=document.createElement('div');widget.id='turnstile-widget';const submit=fm.querySelector('button[type="submit"]');submit.before(widget);const ts=document.createElement('script');ts.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';ts.async=true;ts.defer=true;ts.onload=()=>{if(window.turnstile)window.turnstile.render(widget,{sitekey:C.turnstileSiteKey,callback:token=>{turnstileToken=token},'expired-callback':()=>{turnstileToken=''},'error-callback':()=>{turnstileToken=''}})};document.head.appendChild(ts)}
if(fm)fm.onsubmit=async e=>{e.preventDefault();const f=new FormData(fm),status=$('#fs');status.textContent='Sending…';if(C.turnstileSiteKey&&!turnstileToken){status.textContent='Please complete the verification challenge.';return}const payload={sender_name:String(f.get('name')||'').trim(),sender_email:String(f.get('email')||'').trim(),message:String(f.get('msg')||'').trim()};
 if(db){try{const {data,error}=await db.functions.invoke('contact-submit',{body:{...payload,website:String(f.get('website')||''),turnstile_token:turnstileToken}});if(error)throw error;if(data&&data.error)throw Error(data.error);fm.reset();turnstileToken='';if(window.turnstile)window.turnstile.reset();status.textContent='Thank you. Your message has been sent.';return}catch(err){console.error('Supabase contact submission failed',err);status.textContent=err.message||'Sorry, your message could not be sent. Please email us directly.';return}}
 if(C.formspree){try{const r=await fetch(C.formspree,{method:'POST',body:f,headers:{Accept:'application/json'}});if(!r.ok)throw 0;fm.reset();status.textContent='Thank you. Your message has been sent.'}catch(_){status.textContent='Sorry, that did not send. Please email us directly.'}return}
 status.textContent='Sorry, the message could not be sent. Please email us directly.';
};
// ===== BLOG =====
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ALL=(po||[]).filter(p=>!p.draft).sort((a,b)=>b.date.localeCompare(a.date));
const cat=p=>p.cat||p.tag||'General',qs=new URLSearchParams(location.search);
const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const mon=m=>new Date(m+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
const rt=p=>Math.max(1,Math.round(String(p.body||'').replace(/<[^>]+>/g,' ').split(/\s+/).length/200))+' min read';
const postImage=p=>p.img||(p.media||[]).find(m=>m.type==='image')?.url||'';
const postMediaHtml=p=>(p.media||[]).map(m=>m.type==='video'?'<figure><video controls playsinline preload="metadata" src="'+esc(m.url)+'"></video><figcaption>'+esc(m.caption||'')+'</figcaption></figure>':'<figure><img loading="lazy" src="'+esc(IMG(m.url))+'" alt="'+esc(m.caption||p.title)+'"><figcaption>'+esc(m.caption||'')+'</figcaption></figure>').join('');
const lk=(k,v)=>`blog.html?${k}=${encodeURIComponent(v)}`,pu=p=>`post.html?p=${encodeURIComponent(p.slug)}`;
const thumb=(p,i)=>postImage(p)?`<img src="${IMG(postImage(p))}" alt="" loading="lazy">`:`<svg aria-hidden="true"><use href="#s${i%5+1}"/></svg>`;
const row=(p,i)=>`<a class="row" href="${pu(p)}"><div class="th" style="--c:var(${COL[i%5]})">${thumb(p,i)}</div><div><div class="meta"><span>${fmt(p.date)}</span><span class="tag">${esc(cat(p))}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div></a>`;
const card=(p,i)=>`<article class="post"><a class="pimg" href="${pu(p)}" style="--c:var(${COL[i%5]})">${thumb(p,i)}</a><div class="meta"><a class="tag" href="${lk('cat',cat(p))}">${esc(cat(p))}</a><span>${fmt(p.date)}</span><span>${rt(p)}</span></div><h2><a href="${pu(p)}">${esc(p.title)}</a></h2><p>${esc(p.excerpt)}</p><a class="more" href="${pu(p)}">Continue reading</a></article>`;
const cnt=f=>{const m={};ALL.forEach(p=>f(p).forEach(k=>m[k]=(m[k]||0)+1));return Object.entries(m)};
set('#latest',ALL.slice(0,3).map(row).join(''));
set('#side',`<form class="srch" action="blog.html"><input name="q" type="search" placeholder="Search the blog" aria-label="Search the blog"><button class="btn">Search</button></form><div class="wd"><h3>About</h3><p>HopeAlive Foundation protects children, opens doors to education and helps communities thrive.</p></div><div class="wd"><h3>Recent posts</h3><ul>${ALL.slice(0,5).map(p=>`<li><a href="${pu(p)}">${esc(p.title)}</a></li>`).join('')}</ul></div><div class="wd"><h3>Categories</h3><ul>${cnt(p=>[cat(p)]).map(([k,n])=>`<li><a href="${lk('cat',k)}">${esc(k)}</a> (${n})</li>`).join('')}</ul></div><div class="wd"><h3>Tags</h3><p class="cloud">${cnt(p=>p.tags||[]).map(([k])=>`<a class="tag" href="${lk('tag',k)}">${esc(k)}</a>`).join('')}</p></div><div class="wd"><h3>Archives</h3><ul>${cnt(p=>[p.date.slice(0,7)]).sort().reverse().map(([k,n])=>`<li><a href="${lk('m',k)}">${mon(k)}</a> (${n})</li>`).join('')}</ul></div>`);
const bl=$('#posts');
if(bl){const c=qs.get('cat'),t=qs.get('tag'),m=qs.get('m'),q=(qs.get('q')||'').toLowerCase(),N=6,n=Math.max(1,+qs.get('page')||1);
 const L=ALL.filter(p=>(!c||cat(p)==c)&&(!t||(p.tags||[]).includes(t))&&(!m||p.date.startsWith(m))&&(!q||(p.title+p.excerpt+p.body).toLowerCase().includes(q)));
 const tp=Math.max(1,Math.ceil(L.length/N)),pl=k=>{const u=new URLSearchParams(location.search);u.set('page',k);return 'blog.html?'+u};
 const h=c?'Category: '+c:t?'Tag: '+t:m?'Archive: '+mon(m):q?'Search results for “'+qs.get('q')+'”':'';
 bl.innerHTML=(h?`<h2 class="ft">${esc(h)} <a href="blog.html">Clear</a></h2>`:'')+(L.slice((n-1)*N,n*N).map(card).join('')||'<p>No posts found.</p>')+(tp>1?`<nav class="pager" aria-label="Pages">${n>1?`<a href="${esc(pl(n-1))}">Newer posts</a>`:'<span></span>'}<span>Page ${n} of ${tp}</span>${n<tp?`<a href="${esc(pl(n+1))}">Older posts</a>`:'<span></span>'}</nav>`:'')}
const pe=$('#post');let purifier=null;
if(pe){purifier=await new Promise(resolve=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js';script.onload=()=>resolve(window.DOMPurify||null);script.onerror=()=>resolve(null);document.head.appendChild(script)})}
const cleanPostHtml=html=>purifier?purifier.sanitize(String(html||'')):String(html||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(pe){const i=ALL.findIndex(x=>x.slug==qs.get('p')),p=ALL[i];
 if(!p)pe.innerHTML='<h1>Post not found</h1><p style="margin-top:18px">It may have moved. <a href="blog.html"><b>Browse all posts</b></a></p>';
 else{document.title=p.title+' | HopeAlive Foundation';$('meta[name=description]').content=p.excerpt;
  const u=encodeURIComponent(location.href),t=encodeURIComponent(p.title),au=esc(p.author||'HopeAlive Foundation'),o=ALL[i+1],nw=ALL[i-1],more=ALL.filter(x=>x!==p).sort((a,b)=>(cat(b)==cat(p))-(cat(a)==cat(p))).slice(0,3);
  pe.innerHTML=`<nav class="crumbs"><a href="index.html">Home</a> / <a href="blog.html">Blog</a> / <a href="${lk('cat',cat(p))}">${esc(cat(p))}</a></nav><h1>${esc(p.title)}</h1><div class="meta"><span>By ${au}</span><span>${fmt(p.date)}</span><span>${rt(p)}</span></div>${postImage(p)?`<img class="hero-img" src="${IMG(postImage(p))}" alt="">`:''}<div class="body">${cleanPostHtml(p.body)}</div>${(p.media||[]).length?`<div class="post-media-list">${postMediaHtml(p)}</div>`:''}<p class="tags">${(p.tags||[]).map(k=>`<a class="tag" href="${lk('tag',k)}">${esc(k)}</a>`).join('')}</p><p class="share"><b>Share:</b> <a href="https://wa.me/?text=${t}%20${u}">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a><a href="https://x.com/intent/tweet?text=${t}&amp;url=${u}">X</a><button class="cp" data-c="${esc(location.href)}">Copy link</button></p><div class="author"><b>Written by ${au}</b><p>HopeAlive Foundation protects children, opens doors to education and helps communities thrive.</p></div><nav class="pn">${o?`<a href="${pu(o)}"><small>Older post</small>${esc(o.title)}</a>`:'<span></span>'}${nw?`<a href="${pu(nw)}"><small>Newer post</small>${esc(nw.title)}</a>`:'<span></span>'}</nav>${more.length?`<h2 style="margin-top:40px;font-size:30px">Related posts</h2><div class="rows">${more.map(row).join('')}</div>`:''}<div id="cm"></div>`;
  const g=C.giscus;
  if(g&&g.repo){const cm=$('#cm'),sc=document.createElement('script');cm.innerHTML='<h2 style="margin-top:40px;font-size:30px">Comments</h2>';sc.src='https://giscus.app/client.js';Object.entries({'data-repo':g.repo,'data-repo-id':g.repoId,'data-category':g.category,'data-category-id':g.categoryId,'data-mapping':'specific','data-term':p.slug,'data-theme':'light','data-lang':'en',crossorigin:'anonymous'}).forEach(([k,v])=>sc.setAttribute(k,v));sc.async=true;cm.append(sc)}}}
})();
