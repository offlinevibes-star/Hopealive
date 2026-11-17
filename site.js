// ===== EDIT THIS BLOCK =====
const CONFIG={
 email:'myhopealivenetwork@gmail.com',
 hero:'',       // optional home-page photo: file path or Google Drive share link
 donateLink:'', // optional online payment page (Paystack, Flutterwave, GoFundMe...)
 formspree:'',  // optional Formspree form URL so the contact form sends without opening email
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
let gi=0;
const show=i=>{const n=C.gallery.length,x=C.gallery[gi=(i+n)%n];lb.querySelector('img').src=IMG(x.src);$('#lc').textContent=x.cap||'';lb.classList.add('on')};
document.onclick=e=>{const t=e.target,i=t.dataset&&t.dataset.i;
 if(t.tagName=='IMG'&&i!==undefined)show(+i);
 else if(t.matches('.pv'))show(gi-1);
 else if(t.matches('.nx'))show(gi+1);
 else if(t.matches('.cp')){navigator.clipboard.writeText(t.dataset.c);t.textContent='Copied'}
 else if(t==lb||t.matches('.x'))lb.classList.remove('on')};
document.onkeydown=e=>{if(!lb.classList.contains('on'))return;if(e.key=='Escape')lb.classList.remove('on');if(e.key=='ArrowLeft')show(gi-1);if(e.key=='ArrowRight')show(gi+1)};
let tx=0;lb.ontouchstart=e=>{tx=e.touches[0].clientX};lb.ontouchend=e=>{const d=e.changedTouches[0].clientX-tx;if(Math.abs(d)>50)show(gi+(d<0?1:-1))};
set('#pill',PIL.map(([c,t,d],i)=>`<li style="--c:var(${c})"><svg aria-hidden="true"><use href="#s${i+1}"/></svg><h3>${t}</h3><p>${d}</p></li>`).join(''));
set('#tiles',PIL.map(([c,t],i)=>`<a class="tile" href="programmes.html" style="--c:var(${c})"><svg aria-hidden="true"><use href="#s${i+1}"/></svg>${t}</a>`).join(''));
set('#crew',C.team.map((t,i)=>`<div><div class="av" style="--c:var(${COL[i%3]})">${t.p?`<img src="${IMG(t.p)}" alt="${t.n}">`:t.n.split(' ').map(w=>w[0]).join('')}</div><h3>${t.n}</h3><p><b>${t.r}</b></p>${t.b?`<p style="margin-top:8px">${t.b}</p>`:''}</div>`).join(''));
set('#gal',C.gallery.length?C.gallery.map((x,i)=>`<figure><img data-i="${i}" src="${IMG(x.src)}" alt="${x.cap||'HopeAlive programme photo'}" loading="lazy">${x.cap?`<figcaption>${x.cap}</figcaption>`:''}</figure>`).join(''):[1,2,3,4,5,6].map(i=>`<figure><svg class="ph" aria-hidden="true"><use href="#s${(i-1)%5+1}"/></svg><figcaption>Photo coming soon</figcaption></figure>`).join(''));
const K=C.bank;
set('#bank',(C.donateLink?`<p><a class="btn" href="${C.donateLink}" target="_blank" rel="noopener">Donate online</a></p>`:'')+(K.number?`<dl><dt>Bank</dt><dd>${K.bank}</dd><dt>Account name</dt><dd>${K.name}</dd><dt>Account number</dt><dd><b>${K.number}</b><button class="cp" data-c="${K.number}">Copy</button></dd></dl>`:C.donateLink?'':'<p>Email us and we’ll share our official account details.</p>'));
const hd=$('.dice');
if(hd&&C.hero)hd.outerHTML=`<div class="arch"><img src="${IMG(C.hero)}" alt="HopeAlive Foundation programme"><svg aria-hidden="true" class="a1"><use href="#s2"/></svg><svg aria-hidden="true" class="a2"><use href="#s1"/></svg></div>`;
set('#stats',C.stats.map(s=>`<div><b>${s.n}</b>${s.l}</div>`).join(''));
set('#strip',C.gallery.slice(0,4).map((x,i)=>`<img data-i="${i}" src="${IMG(x.src)}" alt="${x.cap||'HopeAlive programme photo'}" loading="lazy">`).join(''));
[['#impact',C.stats],['#moments',C.gallery]].forEach(([q,a])=>{const e=$(q);if(e)e.hidden=!a.length});
if(C.whatsapp)B.insertAdjacentHTML('beforeend',`<a class="wa" href="https://wa.me/${C.whatsapp}" target="_blank" rel="noopener">Chat on WhatsApp</a>`);
document.querySelectorAll('[data-m]').forEach(a=>a.href=`mailto:${C.email}?subject=${encodeURIComponent(a.dataset.m)}`);
const L=[['Email',`<a href="mailto:${C.email}">${C.email}</a>`],['Address','No 8, Umuozuo Street, Aba, Abia State, Nigeria']];
if(C.phone)L.push(['Phone',`<a href="tel:${C.phone.replace(/\s/g,'')}">${C.phone}</a>`]);
if(C.whatsapp)L.push(['WhatsApp',`<a href="https://wa.me/${C.whatsapp}">Message us</a>`]);
const S=Object.entries(C.social).filter(([,u])=>u);
if(S.length)L.push(['Follow us',S.map(([k,u])=>`<a href="${u}" target="_blank" rel="noopener">${k}</a>`).join(', ')]);
set('#details',L.map(([k,v])=>`<p><b>${k}</b><br>${v}</p>`).join(''));
const fm=$('#form');
if(fm)fm.onsubmit=async e=>{e.preventDefault();const f=new FormData(fm),st=$('#fs');
 if(C.formspree){st.textContent='Sending…';try{const r=await fetch(C.formspree,{method:'POST',body:f,headers:{Accept:'application/json'}});if(!r.ok)throw 0;fm.reset();st.textContent='Thank you. Your message has been sent.'}catch(_){st.textContent='Sorry, that did not send. Please email us directly.'}return}
 location.href=`mailto:${C.email}?subject=${encodeURIComponent('Message from '+f.get('name'))}&body=${encodeURIComponent(f.get('msg')+'\n\n'+f.get('name')+', '+f.get('email'))}`};
// ===== BLOG =====
const P=(typeof POSTS!='undefined'?POSTS:[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
const row=(p,i)=>`<a class="row" href="post.html?p=${p.slug}"><div class="th" style="--c:var(${COL[i%5]})">${p.img?`<img src="${IMG(p.img)}" alt="">`:`<svg aria-hidden="true"><use href="#s${i%5+1}"/></svg>`}</div><div><div class="meta"><span>${fmt(p.date)}</span><span class="tag">${p.tag}</span></div><h3>${p.title}</h3><p>${p.excerpt}</p></div></a>`;
set('#latest',P.slice(0,3).map(row).join(''));
const rt=p=>Math.max(1,Math.round(p.body.replace(/<[^>]+>/g,' ').split(/\s+/).length/200))+' min read';
const bl=$('#posts');
if(bl){const ch=$('#chips'),q=$('#q');let tg='All';
 const draw=()=>{const s=q.value.toLowerCase();bl.innerHTML=P.filter(p=>(tg=='All'||p.tag==tg)&&(p.title+p.excerpt+p.body).toLowerCase().includes(s)).map(row).join('')||'<p style="padding:24px 0">No posts match. Try another search or topic.</p>';[...ch.children].forEach(b=>b.setAttribute('aria-pressed',b.textContent==tg))};
 ch.innerHTML=['All',...new Set(P.map(p=>p.tag))].map(t=>`<button>${t}</button>`).join('');
 ch.onclick=e=>{if(e.target.tagName=='BUTTON'){tg=e.target.textContent;draw()}};q.oninput=draw;draw()}
const pe=$('#post');
if(pe){const p=P.find(x=>x.slug==new URLSearchParams(location.search).get('p'));
 if(!p)pe.innerHTML='<h1>Post not found</h1><p style="margin-top:18px">It may have moved. <a href="blog.html"><b>Browse all posts</b></a></p>';
 else{document.title=p.title+' | HopeAlive Foundation';$('meta[name=description]').content=p.excerpt;
  const u=encodeURIComponent(location.href),t=encodeURIComponent(p.title),more=P.filter(x=>x!==p).sort((a,b)=>(b.tag==p.tag)-(a.tag==p.tag)).slice(0,2);
  pe.innerHTML=`<div class="meta"><span>${fmt(p.date)}</span><span class="tag">${p.tag}</span><span>${rt(p)}</span></div><h1>${p.title}</h1>${p.img?`<img src="${IMG(p.img)}" alt="">`:''}<div class="body">${p.body}</div><p class="share"><b>Share:</b> <a href="https://wa.me/?text=${t}%20${u}">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a><a href="https://x.com/intent/tweet?text=${t}&url=${u}">X</a><button class="cp" data-c="${location.href}">Copy link</button></p>${more.length?`<h2 style="margin-top:56px;font-size:30px">Keep reading</h2><div class="rows">${more.map(row).join('')}</div>`:''}`}}
