import {useEffect,useRef,useState} from "react";
import {api} from "./lib/api";

const slides=[
  {title:"Your ₦11,000 monthly plan",text:"₦10,000 goes into the shared pot and ₦1,000 supports the community party fund."},
  {title:"Pay by the 5th",text:"The absolute monthly payment deadline is the 5th of every month."},
  {title:"Late payment means a ₦4,000 fine",text:"Any contribution paid after the 5th automatically carries the immutable flat late-payment fine."},
  {title:"Join correctly",text:"All new community members must register via this webapp and complete the mandatory Rules verification and digital guarantor sign-off to join a circle."}
];
const rules=`1. Monthly contribution is ₦11,000: ₦10,000 into the shared pot + ₦1,000 into the party fund.
2. The absolute monthly payment deadline is the 5th.
3. A payment made after the 5th automatically attracts a flat ₦4,000 late-payment fine.
4. Members must provide truthful registration and bank information.
5. A nominated guarantor must complete the required sign-off process.
6. Members must review these rules completely before accepting them.
7. Payment happens off-platform: send your contribution to the admin and share proof in the community. An admin confirms it here once received.
8. Two members are selected each month to receive a lump-sum payout: ₦100,000 gross, with a flat ₦5,000 service fee deducted on payout day, leaving ₦95,000 cash in hand. This continues until every member in the circle has received a payout once.
9. Monthly contribution mandates remain active even after a member receives a lump-sum disbursal.
10. Members must not attempt to manipulate recipient selection or circle records.
11. Community announcements and payment notices are official records of the circle.
12. After completing this form, an administrator manually verifies your nominated guarantor. You will be notified once you can log in and are placed in a circle.`;

const STEP_LABELS=["Personal","Bank","Email OTP","Guarantor","Rules"];

// A password guidance note shown next to every password field. Static and
// generic on purpose -- never tell someone their *actual* password is good
// or bad, just remind them what makes a password hard to guess.
const PASSWORD_TIP="Use at least 8 characters and mix uppercase, lowercase, numbers and a symbol (e.g. Bright#Sunrise92) so no one can easily guess it. Don't reuse a password from another account.";

// Empty registration form, used both for the initial state and to reset
// the wizard cleanly (e.g. after logout) so a new registration never
// starts from stale, previously-typed data.
const BLANK_FORM={firstName:"",lastName:"",username:"",email:"",password:"",primaryPhone:"",residentialAddress:"",bank:{bankName:"",accountNumber:"",accountName:""}};

/* ============================================================
 * SESSION - the member token lives in sessionStorage, not localStorage.
 * localStorage is shared across every tab of the same browser, so logging
 * in as a second member in a second tab would silently replace the first
 * tab's session. sessionStorage is unique per tab, so two tabs can hold
 * two different logged-in members at once, same as visiting in two
 * separate browsers would. "Have I ever registered on this device" (used
 * only to decide which tab - Login or Register - to default to) is the
 * one thing that's still fine to share across tabs, so that alone stays
 * in localStorage.
 * ============================================================ */
const HAS_REGISTERED_KEY="uy_has_registered";
const THEME_KEY="uy_theme";
const TOKEN_KEY="memberToken";

/* ============================================================
 * THEME - light / dark / system, no extra dependency needed.
 * Tailwind's class-based dark mode toggles a "dark" class on <html>;
 * every dark: utility class in this file reacts to it automatically.
 * ============================================================ */
type Theme="light"|"dark"|"system";
function applyTheme(theme:Theme){
 const isDark=theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
 document.documentElement.classList.toggle("dark",isDark);
}
function useTheme(){
 const [theme,setTheme]=useState<Theme>((localStorage.getItem(THEME_KEY) as Theme)||"system");
 useEffect(()=>{
   applyTheme(theme);
   localStorage.setItem(THEME_KEY,theme);
   if(theme!=="system")return;
   const mq=window.matchMedia("(prefers-color-scheme: dark)");
   const handler=()=>applyTheme("system");
   mq.addEventListener("change",handler);
   return()=>mq.removeEventListener("change",handler);
 },[theme]);
 return [theme,setTheme] as const;
}
function ThemeToggle({theme,setTheme}:{theme:Theme;setTheme:(t:Theme)=>void}){
 const options:{id:Theme;label:string}[]=[{id:"light",label:"Light"},{id:"system",label:"Auto"},{id:"dark",label:"Dark"}];
 return <div className="inline-flex rounded-lg border border-white/30 overflow-hidden text-xs shrink-0">
   {options.map(o=>(
     <button key={o.id} type="button" onClick={()=>setTheme(o.id)}
       className={`px-2.5 py-1.5 font-semibold ${theme===o.id?"bg-white text-blue-900":"text-blue-100 hover:bg-white/10"}`}
     >{o.label}</button>
   ))}
 </div>;
}

function RefreshIcon({spinning}:{spinning?:boolean}){
 return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={spinning?"animate-spin":""}>
   <path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>
 </svg>;
}

const APP_VERSION="1.1.0";

// Configured once you know where things are actually hosted/published:
// - APK_DOWNLOAD_URL: set VITE_APK_DOWNLOAD_URL to your GitHub Release asset
//   URL once the build-android.yml workflow has run at least once, e.g.
//   https://github.com/<owner>/<repo>/releases/latest/download/unique-youths.apk
// The fallback here is just a placeholder so the app doesn't crash before
// that's configured - the button below explains what to do if it's unset.
const APK_DOWNLOAD_URL=(import.meta as any).env?.VITE_APK_DOWNLOAD_URL||"";

function isStandalone(){
 if(typeof window==="undefined")return false;
 // True once installed as a PWA, or running inside the Capacitor Android shell.
 return window.matchMedia?.("(display-mode: standalone)").matches
   || (window.navigator as any).standalone===true
   || !!(window as any).Capacitor;
}

function GetTheApp(){
 const [dismissed,setDismissed]=useState(()=>localStorage.getItem("uy_dismissed_app_banner")==="1");
 const [open,setOpen]=useState<"android"|"ios"|null>(null);
 if(dismissed||isStandalone())return null;

 const dismiss=()=>{localStorage.setItem("uy_dismissed_app_banner","1");setDismissed(true)};

 return <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow border border-blue-100 dark:border-slate-700">
   <div className="flex items-start justify-between gap-3">
     <div className="flex items-center gap-3">
       <img src="/brand/logo-badge.png" alt="" className="w-10 h-10 shrink-0"/>
       <div>
         <h2 className="font-bold text-slate-900 dark:text-white">Get the mobile app</h2>
         <p className="text-sm text-slate-500 dark:text-slate-400">Install Unique Youth on your phone's home screen for faster, app-like access.</p>
       </div>
     </div>
     <button onClick={dismiss} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 text-lg leading-none">×</button>
   </div>
   <div className="flex flex-wrap gap-2 mt-4">
     <button onClick={()=>setOpen(o=>o==="android"?null:"android")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${open==="android"?"bg-blue-800 text-white border-blue-800":"border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"}`}>Android</button>
     <button onClick={()=>setOpen(o=>o==="ios"?null:"ios")} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${open==="ios"?"bg-blue-800 text-white border-blue-800":"border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"}`}>iPhone</button>
   </div>
   {open==="android"&&<div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
     {APK_DOWNLOAD_URL
       ?<a href={APK_DOWNLOAD_URL} className="inline-block bg-red-600 text-white font-semibold px-5 py-3 rounded-lg">Download APK</a>
       :<p className="text-amber-600 dark:text-amber-400">The Android download isn't set up yet — add <code>VITE_APK_DOWNLOAD_URL</code> once the app is published. See <code>MOBILE_APP.md</code>.</p>}
     <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">After downloading, open the file and allow "Install from unknown sources" if prompted — this app isn't on the Play Store, so Android shows that warning for any APK installed this way.</p>
   </div>}
   {open==="ios"&&<div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
     <p>iPhone doesn't support installing apps outside the App Store this way, but Safari can add this site to your home screen as a full app icon:</p>
     <ol className="list-decimal list-inside mt-2 space-y-1">
       <li>Open this page in <b>Safari</b> (not Chrome).</li>
       <li>Tap the <b>Share</b> icon (square with an arrow) at the bottom of the screen.</li>
       <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
       <li>Tap <b>Add</b> — the Unique Youth icon now opens full-screen from your home screen, just like a regular app.</li>
     </ol>
   </div>}
 </div>;
}

function Brand(){
 return <div className="flex items-center gap-3">
   <span className="bg-white rounded-full p-1 shrink-0 flex items-center justify-center">
     <img src="/brand/logo-badge.png" alt="Unique Youth logo" className="w-9 h-9"/>
   </span>
   <div><b className="block leading-tight">Unique Youth</b><span className="text-blue-200 text-xs uppercase tracking-wide">Cooperative Thrift</span></div>
 </div>;
}

function AppFooter(){
 return <footer className="text-center text-sm font-semibold text-slate-600 dark:text-slate-200 py-6 px-4">
   © {new Date().getFullYear()} Unique Youth Cooperative Thrift. All rights reserved.
   <span className="mx-1.5">·</span>v{APP_VERSION}
 </footer>;
}

export default function App(){
 const [slide,setSlide]=useState(0);
 const [step,setStep]=useState(0);
 const [theme,setTheme]=useTheme();
 const [mode,setMode]=useState<"register"|"login">(
   localStorage.getItem(HAS_REGISTERED_KEY)?"login":"register"
 );
 const [msg,setMsg]=useState("");
 const [error,setError]=useState("");
 const [form,setForm]=useState<any>(BLANK_FORM);
 const [confirmPassword,setConfirmPassword]=useState("");
 const [userId,setUserId]=useState("");
 const [otp,setOtp]=useState("");
 const [regToken,setRegToken]=useState("");
 const [memberToken,setMemberToken]=useState(sessionStorage.getItem(TOKEN_KEY)||"");
 const [loginForm,setLoginForm]=useState({usernameOrEmail:"",password:""});
 const [rulesEnd,setRulesEnd]=useState(false);
 const [accepted,setAccepted]=useState(false);
 const [dashboard,setDashboard]=useState<any>(null);
 const [ann,setAnn]=useState<any[]>([]);
 const [guarantor,setGuarantor]=useState({name:"",phone:""});
 const [showForgot,setShowForgot]=useState(false);

 useEffect(()=>{const id=setInterval(()=>setSlide(s=>(s+1)%slides.length),3000);return()=>clearInterval(id)},[]);
 const set=(k:string,v:string)=>setForm((x:any)=>({...x,[k]:v}));
 const setBank=(k:string,v:string)=>setForm((x:any)=>({...x,bank:{...x.bank,[k]:v}}));

 const resetWizard=()=>{
   setStep(0);
   setForm(BLANK_FORM);
   setConfirmPassword("");
   setUserId("");
   setOtp("");
   setRegToken("");
   setGuarantor({name:"",phone:""});
   setAccepted(false);
   setRulesEnd(false);
   setLoginForm({usernameOrEmail:"",password:""});
   setMsg("");
   setError("");
   setShowForgot(false);
 };

 const start=async()=>{
   try{
     setError("");
     if(userId){setStep(2);return}
     const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify(form)});
     setUserId(d.userId);setStep(2);setMsg("Verification code sent to your email.")
   }catch(e:any){setError(e.message)}
 };

 const verify=async()=>{
   try{
     setError("");
     if(regToken){setStep(3);return}
     const d=await api("/api/auth/verify-otp",{method:"POST",body:JSON.stringify({userId,otp})});
     setRegToken(d.registrationToken);setMsg("");setStep(3)
   }catch(e:any){setError(e.message)}
 };

 const finish=async()=>{
   try{
     setError("");
     await api("/api/member/complete-registration",{method:"POST",headers:{Authorization:`Bearer ${regToken}`},body:JSON.stringify({guarantorName:guarantor.name,guarantorPhone:guarantor.phone,rulesAccepted:accepted})});
     localStorage.setItem(HAS_REGISTERED_KEY,"1");
     setLoginForm(l=>({...l,usernameOrEmail:form.username||form.email}));
     setMsg("Registration submitted! An administrator will verify your guarantor, then you can log in below.");
     setMode("login");
   }catch(e:any){setError(e.message)}
 };

 const login=async()=>{
   try{
     setError("");
     const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify(loginForm)});
     sessionStorage.setItem(TOKEN_KEY,d.token);
     localStorage.setItem(HAS_REGISTERED_KEY,"1");
     setMemberToken(d.token);
   }catch(e:any){setError(e.message)}
 };

 const loadDashboard=async()=>{
   try{
     const t=sessionStorage.getItem(TOKEN_KEY)||memberToken;
     const d=await api("/api/member/me",{headers:{Authorization:`Bearer ${t}`}});
     setDashboard(d);
     const a=await api("/api/member/announcements",{headers:{Authorization:`Bearer ${t}`}});
     setAnn(a);
   }catch(e:any){
     if(String(e.message).toLowerCase().includes("token")){sessionStorage.removeItem(TOKEN_KEY);setMemberToken("")}
     setError(e.message);
   }
 };

 useEffect(()=>{if(memberToken)loadDashboard()},[memberToken]);
 useEffect(()=>{if(!memberToken)return;const id=setInterval(loadDashboard,8000);return()=>clearInterval(id)},[memberToken]);

 const onLogout=async()=>{
   try{
     await api("/api/auth/member/logout",{method:"POST",headers:{Authorization:`Bearer ${sessionStorage.getItem(TOKEN_KEY)}`}});
   }catch{
     // Still log out locally even if call fails.
   }
   sessionStorage.removeItem(TOKEN_KEY);
   setMemberToken("");
   setDashboard(null);
   setAnn([]);
   resetWizard();
   setMode("login");
 };

 if(memberToken) return <Dashboard dashboard={dashboard} announcements={ann} onRefresh={loadDashboard} theme={theme} setTheme={setTheme} onLogout={onLogout}/>;

 const goPersonalContinue=()=>{
   setError("");
   if(form.password.length<8){setError("Password must be at least 8 characters.");return}
   if(form.password!==confirmPassword){setError("Passwords do not match. Please re-type your confirmation.");return}
   setStep(1);
 };

 return <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
   <header className="bg-blue-800 text-white px-5 py-4 flex justify-between items-center gap-3 flex-wrap">
     <Brand/>
     <div className="flex items-center gap-2">
       <ThemeToggle theme={theme} setTheme={setTheme}/>
       <div className="flex gap-2">
         <button
           onClick={()=>{setMode("login");setError("");setMsg("")}}
           className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${mode==="login"?"bg-white text-blue-800":"bg-blue-700 text-blue-100"}`}
         >Log In</button>
         <button
           onClick={()=>{resetWizard();setMode("register")}}
           className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${mode==="register"?"bg-white text-blue-800":"bg-blue-700 text-blue-100"}`}
         >Register</button>
       </div>
     </div>
   </header>
   <section className="bg-blue-50 dark:bg-slate-900 p-6 text-center"><div className="max-w-xl mx-auto">
    <div className="h-48 flex flex-col justify-center"><h1 className="text-3xl font-black text-blue-800 dark:text-blue-300">{slides[slide].title}</h1><p className="mt-3 text-slate-600 dark:text-slate-400">{slides[slide].text}</p></div>
    <div className="flex justify-center gap-2">{slides.map((_,i)=><span key={i} className={`h-2 w-8 rounded ${i===slide?"bg-red-600":"bg-blue-200 dark:bg-slate-700"}`}/>)}</div>
   </div></section>
   <main className="max-w-2xl mx-auto p-5">
    {mode==="login"?<>
      {msg&&<div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">{msg}</div>}
      {error&&<div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">{error}</div>}
      <Panel title="Log in to your account">
        <Input label="Email or username" value={loginForm.usernameOrEmail} onChange={(v:string)=>setLoginForm({...loginForm,usernameOrEmail:v})}/>
        <PasswordInput label="Password" value={loginForm.password} onChange={(v:string)=>setLoginForm({...loginForm,password:v})}/>
        <button onClick={login} className="w-full bg-blue-800 text-white font-semibold py-3 rounded-lg hover:bg-blue-900 transition">Log in</button>
        <div className="text-center mt-4">
          <button type="button" className="text-sm text-blue-700 dark:text-blue-300 underline" onClick={()=>setShowForgot(s=>!s)}>Forgot password?</button>
          {showForgot&&<p className="text-sm text-slate-500 dark:text-slate-300 mt-2">There's no self-service password reset yet. Contact an administrator directly (call, message, or in person) and they can reset it for you.</p>}
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-300 mt-4">New here? <button type="button" className="text-blue-700 dark:text-blue-300 font-semibold underline" onClick={()=>{resetWizard();setMode("register")}}>Register instead</button></p>
      </Panel>
    </>:<>
      <div className="flex justify-between mb-5 text-xs font-bold flex-wrap gap-2">{STEP_LABELS.map((x,i)=><span className={step===i?"text-red-600":"text-slate-400 dark:text-slate-500"} key={x}>{i+1}. {x}</span>)}</div>
      {msg&&<div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">{msg}</div>}
      {error&&<div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">{error}</div>}
      {step===0&&<Panel title="Personal information">
        {["firstName","lastName","username","email","primaryPhone"].map(k=><Input key={k} label={k} value={form[k]} onChange={(v:string)=>set(k,v)}/>)}
        <PasswordInput label="Password" value={form.password} onChange={(v:string)=>set("password",v)}/>
        <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword}/>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">{PASSWORD_TIP}</p>
        <Input label="Residential address" value={form.residentialAddress} onChange={(v:string)=>set("residentialAddress",v)}/>
        <button onClick={goPersonalContinue} className="w-full bg-blue-800 text-white font-semibold py-3 rounded-lg hover:bg-blue-900 transition">Continue</button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-300 mt-4">Already registered? <button type="button" className="text-blue-700 dark:text-blue-300 font-semibold underline" onClick={()=>setMode("login")}>Log in instead</button></p>
      </Panel>}
      {step===1&&<Panel title="Bank details">
        <Input label="Bank name" value={form.bank.bankName} onChange={(v:string)=>setBank("bankName",v)}/>
        <Input label="Account number" value={form.bank.accountNumber} onChange={(v:string)=>setBank("accountNumber",v)}/>
        <Input label="Account name" value={form.bank.accountName} onChange={(v:string)=>setBank("accountName",v)}/>
        <StepNav onBack={()=>setStep(0)}>
          <button onClick={start} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition">Register &amp; Send OTP</button>
        </StepNav>
      </Panel>}
      {step===2&&<Panel title="Verify your email">
        <p className="text-slate-600 dark:text-slate-300">We sent a 6-digit verification code to <b>{form.email}</b>.</p>
        <Input label="OTP" value={otp} onChange={setOtp}/>
        <StepNav onBack={()=>setStep(1)}>
          <button onClick={verify} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition">Verify OTP</button>
        </StepNav>
        <button className="mt-3 w-full py-3 border dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={async()=>{try{setMsg((await api("/api/auth/resend-otp",{method:"POST",body:JSON.stringify({userId})})).message)}catch(e:any){setError(e.message)}}}>Resend OTP</button>
        <p className="text-xs text-slate-400 dark:text-slate-400 mt-3 text-center">Didn't get your OTP? Contact an admin directly - they can generate a fresh code for you.</p>
      </Panel>}
      {step===3&&<Panel title="Digital guarantor nomination">
        <Input label="Guarantor full name" value={guarantor.name} onChange={(v:string)=>setGuarantor({...guarantor,name:v})}/>
        <Input label="Guarantor phone" value={guarantor.phone} onChange={(v:string)=>setGuarantor({...guarantor,phone:v})}/>
        <StepNav onBack={()=>setStep(2)}>
          <button onClick={()=>setStep(4)} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition">Continue to Rules</button>
        </StepNav>
      </Panel>}
      {step===4&&<Panel title="Rules Lock Area">
        <div onScroll={e=>{const x=e.currentTarget;setRulesEnd(x.scrollTop+x.clientHeight>=x.scrollHeight-4)}} className="h-72 overflow-y-auto border-2 dark:border-slate-700 rounded p-4 whitespace-pre-line text-sm">{rules}</div>
        <label className={`flex gap-2 mt-4 ${rulesEnd?"":"opacity-50"}`}><input type="checkbox" disabled={!rulesEnd} checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I have read and agree to the Unique Youth rules.</label>
        <StepNav onBack={()=>setStep(3)}>
          <button disabled={!rulesEnd||!accepted} onClick={finish} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 transition disabled:opacity-30 disabled:cursor-not-allowed">Register &amp; Join Circle</button>
        </StepNav>
      </Panel>}
    </>}
   </main>
   <AppFooter/>
 </div>;
}

function StepNav({onBack,children}:{onBack:()=>void;children:any}){
 return <div className="flex gap-3 mt-2">
   <button type="button" onClick={onBack} className="shrink-0 px-5 py-3 rounded-lg font-semibold border dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
     Back
   </button>
   {children}
 </div>;
}

function Panel({title,children}:any){return <div className="border dark:border-slate-700 rounded-2xl shadow-sm p-5 dark:bg-slate-900"><h2 className="text-2xl font-bold mb-5">{title}</h2>{children}</div>}
function Input({label,value,onChange,type="text"}:any){return <label className="block mb-3"><span className="text-sm font-semibold capitalize">{label}</span><input className="mt-1 w-full border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" type={type} value={value} onChange={e=>onChange(e.target.value)} required/></label>}

function PasswordInput({label,value,onChange}:any){
 const [visible,setVisible]=useState(false);
 return <label className="block mb-3">
   <span className="text-sm font-semibold">{label}</span>
   <span className="mt-1 flex items-stretch border dark:border-slate-600 dark:bg-slate-800 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
     <input
       className="w-full p-3 outline-none dark:bg-slate-800 dark:text-white"
       type={visible?"text":"password"}
       value={value}
       onChange={e=>onChange(e.target.value)}
       required
     />
     <button
       type="button"
       onClick={()=>setVisible(v=>!v)}
       className="px-3 text-xs font-semibold text-slate-500 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap"
       tabIndex={-1}
     >{visible?"Hide":"Show"}</button>
   </span>
 </label>;
}

const STATUS_COPY:Record<string,{title:string,text:string}> = {
  awaiting_guarantor_review:{title:"Awaiting guarantor review",text:"An administrator is verifying your guarantor. You'll be able to see your circle position once this is done."},
  awaiting_slot_assignment:{title:"Almost there!",text:"Your guarantor has been verified. An administrator will place you into a circle slot shortly."},
  rejected:{title:"Registration not approved",text:"Your guarantor could not be verified. Please contact an administrator for details."}
};

const STATUS_FONT={fontFamily:"'FreeMono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"};

function Ticker({announcements}:any){
 const hasItems=announcements&&announcements.length>0;
 const text=hasItems?announcements.map((a:any)=>a.description).join("     •     "):"No new announcements";
 const duration=Math.max(14,Math.min(90,text.length*0.19));
 return <div className="bg-slate-900 text-white overflow-hidden py-2">
   {hasItems
     ?<div className="inline-block whitespace-nowrap animate-marquee" style={{animationDuration:`${duration}s`}}>{text}</div>
     :<div className="px-4 text-slate-400">{text}</div>}
 </div>;
}

function Card({t,v}:{t:string;v:string}){
 return <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
   <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t}</p>
   <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{v}</p>
 </div>;
}

function ProfilePage({dashboard,onSaved,onDone}:any){
 const [firstName,setFirstName]=useState(dashboard?.user?.firstName||"");
 const [lastName,setLastName]=useState(dashboard?.user?.lastName||"");
 const [phone,setPhone]=useState(dashboard?.user?.primaryPhone||"");
 const [msg,setMsg]=useState("");
 const [error,setError]=useState("");

 const saveProfile=async(e:any)=>{
   e.preventDefault();
   try{
     setError("");
     await api("/api/member/profile",{method:"PUT",body:JSON.stringify({firstName,lastName,primaryPhone:phone})});
     setMsg("Profile updated successfully!");
     onSaved?.();
   }catch(e:any){setError(e.message)}
 };

 return <main className="max-w-4xl mx-auto p-5">
   <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow">
     <div className="flex justify-between items-center mb-4">
       <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Profile Settings</h2>
       <button onClick={onDone} className="text-sm text-blue-700 dark:text-blue-300 font-semibold underline">Back to Dashboard</button>
     </div>
     {msg&&<div className="p-3 mb-3 rounded bg-green-50 text-green-700">{msg}</div>}
     {error&&<div className="p-3 mb-3 rounded bg-red-50 text-red-700">{error}</div>}
     <form onSubmit={saveProfile} className="space-y-4">
       <Input label="First Name" value={firstName} onChange={setFirstName}/>
       <Input label="Last Name" value={lastName} onChange={setLastName}/>
       <Input label="Phone Number" value={phone} onChange={setPhone}/>
       <button type="submit" className="px-5 py-3 bg-blue-800 text-white rounded-lg font-semibold">Save Changes</button>
     </form>
   </div>
 </main>;
}

function Dashboard({dashboard,announcements,onLogout,onRefresh,theme,setTheme}:any){
 const [view,setView]=useState<"home"|"profile">("home");
 const [refreshing,setRefreshing]=useState(false);
 const status=dashboard?.user?.registrationStatus;
 const isActive=status==="active";
 const isVerified=status==="awaiting_slot_assignment"||status==="active";
 const profileDone=!!dashboard?.user?.profileCompletedAt;

 const manualRefresh=async()=>{
   setRefreshing(true);
   try{await onRefresh?.()}finally{setTimeout(()=>setRefreshing(false),400)}
 };

 const paid=dashboard?.ledgers?.filter((x:any)=>x.isPaid).length||0;
 const mp=dashboard?.monthProgress;

 return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
  <header className="bg-blue-800 text-white p-4 flex justify-between items-center gap-3 flex-wrap">
    <Brand/>
    <div className="flex items-center gap-4 flex-wrap">
      <ThemeToggle theme={theme} setTheme={setTheme}/>
      {isVerified && <button onClick={()=>setView(v=>v==="profile"?"home":"profile")} className="text-sm font-semibold flex items-center gap-2">
        {dashboard?.user?.avatarDataUrl
          ?<img src={dashboard.user.avatarDataUrl} className="w-7 h-7 rounded-full object-cover border-2 border-white/50" alt="Your avatar"/>
          :<span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs">{(dashboard?.user?.firstName||"?")[0]}</span>}
        {view==="profile"?"Dashboard":"Profile"}
      </button>}
      <button onClick={manualRefresh} className="text-sm font-semibold flex items-center gap-1.5" title="Refresh my dashboard">
        <RefreshIcon spinning={refreshing}/> Refresh
      </button>
      <button onClick={onLogout} className="text-sm font-semibold">Logout</button>
    </div>
  </header>

  <Ticker announcements={announcements}/>

  {view==="profile"?<ProfilePage dashboard={dashboard} onSaved={onRefresh} onDone={()=>setView("home")}/>:
  <main className="max-w-6xl mx-auto p-5">
   <h1 className="text-3xl font-black text-slate-900 dark:text-white">Welcome, {dashboard?.user?.firstName||"..."}</h1>

   <GetTheApp/>

   {!isActive && status && (
     <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border-l-4 border-red-600" style={STATUS_FONT}>
       <h2 className="text-xl font-bold text-slate-900 dark:text-white">{STATUS_COPY[status]?.title||"Pending"}</h2>
       <p className="text-slate-600 dark:text-slate-200 mt-1 font-bold">
         {status==="awaiting_slot_assignment"&&profileDone
           ?"Your guarantor has been verified. An administrator will place you into a circle slot shortly."
           :STATUS_COPY[status]?.text}
       </p>
       {isVerified && !profileDone && <p className="text-slate-600 dark:text-slate-200 mt-3 text-sm font-bold">While you wait, you can <button className="text-blue-700 dark:text-blue-300 underline" onClick={()=>setView("profile")}>set up your profile</button>.</p>}
     </div>
   )}

   {isActive && <>
    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-5">
      <Card t="Monthly mandate" v="₦11,000"/>
      <Card t="Pot contribution" v="₦10,000"/>
      <Card t="Party fund" v="₦1,000"/>
      <Card t="Late fine" v="₦4,000"/>
    </div>

    {mp && <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">This month's contribution target</h2>
        {mp.met
          ?<span className="text-green-600 dark:text-green-400 font-bold text-sm">Target met! 🎉</span>
          :<span className="text-slate-500 dark:text-slate-300 font-semibold text-sm">In progress</span>}
      </div>
      <p className="text-slate-600 dark:text-slate-300 mt-1">
        ₦{mp.collected.toLocaleString()} of ₦{mp.target.toLocaleString()} collected · {mp.paidCount} of {mp.memberCount} members paid
      </p>
      <div className="mt-3 h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-4 rounded-full transition-all ${mp.met?"bg-green-600":"bg-blue-700"}`} style={{width:`${mp.percentage}%`}}/>
      </div>
    </div>}

    <div className="grid md:grid-cols-2 gap-5 mt-5">
     <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
      <h2 className="font-bold text-xl text-slate-900 dark:text-white">My payment history</h2>
      <p className="text-slate-600 dark:text-slate-300">Confirmed months: {paid}</p>
      <div className="mt-4 bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-200">
        Send your ₦11,000 to the admin's account and share your receipt in the WhatsApp community. An admin will confirm it here once received.
      </div>
     </section>
    </div>
   </>}
  </main>}
  <AppFooter/>
 </div>;
}