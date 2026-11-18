/* Public Supabase browser client. RLS and Auth enforce permissions; never put a secret/service_role key here. */
(function(){
  const url='https://thnrxtxhkmfqnoooqcwc.supabase.co';
  const key='sb_publishable_9Rdbl86dfIb00Z32M5VOEQ_gjqRODYk';
  window.hopeSupabaseReady=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload=()=>{try{window.hopeSupabase=window.supabase.createClient(url,key);resolve(window.hopeSupabase)}catch(e){reject(e)}};
    s.onerror=()=>reject(new Error('Could not load Supabase client'));
    document.head.appendChild(s);
  });
})();