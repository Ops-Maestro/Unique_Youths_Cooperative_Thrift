import {useEffect,useRef,useState,type ChangeEvent} from "react";
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
const BLANK_FORM={firstName:"",lastName:"",username:"",email:"",password:"",primaryPhone:"",residentialAddress:"",bank:{bankName:"",accountNumber:"",accountName:""},otpChannel:"email"};

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
// A persistent ID for this browser/device - deliberately separate from
// the session token (which lives in sessionStorage and is per-tab). This
// stays in localStorage across logins/logouts so the backend can tell "a
// device we've seen before" from "a genuinely new device," for the
// new-device email alert.
function getDeviceId(){
 let id=localStorage.getItem("uy_device_id");
 if(!id){id=crypto.randomUUID();localStorage.setItem("uy_device_id",id)}
 return id;
}
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
 const [open,setOpen]=useState<"android"|"ios"|null>(null);
 const [dismissed,setDismissed]=useState<boolean>(() => {
   try{
     return localStorage.getItem("uy_dismissed_get_the_app")==="1";
   }catch{
     return false;
   }
 });

 if(isStandalone() || dismissed)return null;

 const dismiss=()=>{
   setDismissed(true);
   localStorage.setItem("uy_dismissed_get_the_app","1");
 };

 return <div className="relative mt-5 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow border border-blue-100 dark:border-slate-700">
   <button
     type="button"
     onClick={dismiss}
     aria-label="Dismiss mobile app message"
     title="Dismiss"
     className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none"
   >
     ×
   </button>

   <div className="flex items-center gap-3 pr-8">
     <img src="/brand/logo-badge.png" alt="" className="w-10 h-10 shrink-0"/>
     <div>
       <h2 className="font-bold text-slate-900 dark:text-white">Get the mobile app</h2>
       <p className="text-sm text-slate-500 dark:text-slate-400">
         Install Unique Youth on your phone's home screen for faster, app-like access.
       </p>
     </div>
   </div>

   <div className="flex flex-wrap gap-2 mt-4">
     <button
       onClick={()=>setOpen(o=>o==="android"?null:"android")}
       className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
         open==="android"
           ?"bg-blue-800 text-white border-blue-800"
           :"border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
       }`}
     >
       Android
     </button>

     <button
       onClick={()=>setOpen(o=>o==="ios"?null:"ios")}
       className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
         open==="ios"
           ?"bg-blue-800 text-white border-blue-800"
           :"border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
       }`}
     >
       iPhone
     </button>
   </div>

   {open==="android"&&
     <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
       {APK_DOWNLOAD_URL
         ?<a
             href={APK_DOWNLOAD_URL}
             className="inline-block bg-red-600 text-white font-semibold px-5 py-3 rounded-lg"
           >
             Download APK
           </a>
         :<p className="text-amber-600 dark:text-amber-400">
             The Android download isn't set up yet — add <code>VITE_APK_DOWNLOAD_URL</code> once the app is published. See <code>MOBILE_APP.md</code>.
           </p>
       }

       <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
         After downloading, open the file and allow "Install from unknown sources" if prompted — this app isn't on the Play Store, so Android shows that warning for any APK installed this way.
       </p>
     </div>
   }

   {open==="ios"&&
     <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
       <p>
         iPhone doesn't support installing apps outside the App Store this way, but Safari can add this site to your home screen as a full app icon:
       </p>

       <ol className="list-decimal list-inside mt-2 space-y-1">
         <li>Open this page in <b>Safari</b> (not Chrome).</li>
         <li>Tap the <b>Share</b> icon (square with an arrow) at the bottom of the screen.</li>
         <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
         <li>Tap <b>Add</b> — the Unique Youth icon now opens full-screen from your home screen, just like a regular app.</li>
       </ol>
     </div>
   }
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
 // "register" shows the multi-step signup wizard below. "login" shows the
 // sign-in form. Both are reachable at any time from the header tabs, so a
 // returning member is never stuck on the wizard with no way to log in.
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

 // Fully resets every piece of wizard/login state back to a clean slate.
 // Called on logout so clicking "Register" afterwards never resumes a
 // previous session's half-filled form or leftover step - no page refresh
 // needed to get a blank form.
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
     // Already registered and OTP already sent (e.g. they clicked Back to
     // review their bank details, then Forward again) - don't re-register.
     if(userId){setStep(2);return}
     const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify(form)});
     setUserId(d.userId);setStep(2);setMsg(d.message||"Verification code sent.")
   }catch(e:any){setError(e.message)}
 };

 const verify=async()=>{
   try{
     setError("");
     // Already verified (e.g. they browsed Back to the OTP screen and
     // forward again) - don't try to consume the OTP a second time.
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
     const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({...loginForm,deviceId:getDeviceId()})});
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
     // Still log out locally even if the activity-log call fails.
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
       {/* Always-visible tabs so a returning/logged-out member can reach the
           login form without having to click through the registration wizard. */}
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
        <form onSubmit={e=>{e.preventDefault();login()}}>
          <Input label="Email or username" value={loginForm.usernameOrEmail} onChange={(v:string)=>{setLoginForm({...loginForm,usernameOrEmail:v});setError("")}}/>
          <PasswordInput label="Password" value={loginForm.password} onChange={(v:string)=>{setLoginForm({...loginForm,password:v});setError("")}} enterKeyHint="go"/>
          <button type="submit" className="btn">Log in</button>
        </form>
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
        <label className="block mb-4">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">How should we send your verification code?</span>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={()=>set("otpChannel","email")} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border ${form.otpChannel==="email"?"bg-blue-800 text-white border-blue-800":"border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>Email (free)</button>
            <button type="button" onClick={()=>set("otpChannel","sms")} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold border ${form.otpChannel==="sms"?"bg-blue-800 text-white border-blue-800":"border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>SMS to my phone</button>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Email is the default and doesn't cost anything to send. Pick SMS only if you'd rather get the code as a text message.</p>
        </label>
        <PasswordInput label="Password" value={form.password} onChange={(v:string)=>set("password",v)}/>
        <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword}/>
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">{PASSWORD_TIP}</p>
        <Input label="Residential address" value={form.residentialAddress} onChange={(v:string)=>set("residentialAddress",v)}/>
        <button onClick={goPersonalContinue} className="btn">Continue</button>
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
      {step===2&&<Panel title={form.otpChannel==="sms"?"Verify your phone number":"Verify your email"}>
        <p className="text-slate-600 dark:text-slate-300">We sent a 6-digit verification code to {form.otpChannel==="sms"?<b>{form.primaryPhone}</b>:<b>{form.email}</b>}.</p>
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
 </div>
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

function PasswordInput({label,value,onChange,enterKeyHint}:any){
 const [visible,setVisible]=useState(false);
 return <label className="block mb-3">
   <span className="text-sm font-semibold">{label}</span>
   <span className="mt-1 flex items-stretch border dark:border-slate-600 dark:bg-slate-800 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
     <input
       className="w-full p-3 outline-none dark:bg-slate-800 dark:text-white"
       type={visible?"text":"password"}
       value={value}
       onChange={e=>onChange(e.target.value)}
       enterKeyHint={enterKeyHint}
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
  awaiting_guarantor_review:{title:"Awaiting guarantor review",text:"An administrator is verifying your nominated guarantor. You'll be able to see your circle position once this is done."},
  awaiting_slot_assignment:{title:"Almost there!",text:"Your guarantor has been verified. An administrator will place you into a circle slot shortly."},
  rejected:{title:"Registration not approved",text:"Your guarantor could not be verified. Please contact an administrator for details."}
};

// A monospace, bold treatment for this specific status banner, per request.
// Falls back gracefully through other monospace fonts if FreeMono isn't
// installed on the device.
const STATUS_FONT={fontFamily:"'FreeMono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"};

function Ticker({announcements}:{announcements:any[]}){
 const tickerItems=announcements?.filter((a:any)=>a.type!=="party_banner"&&a.type!=="app_update")||[];
 const hasItems=tickerItems.length>0;
 const text=hasItems?tickerItems.map((a:any)=>a.description).join("     •     "):"No new announcements";
 // Scale the scroll duration with how much text there is, so adding more
 // announcements doesn't make everything whip by faster - it always moves
 // at roughly the same reading speed (~55px/sec).
 const duration=Math.max(14,Math.min(90,text.length*0.19));
 return <div className="bg-slate-900 text-white overflow-hidden py-2">
   {hasItems
     ?<div className="inline-block whitespace-nowrap animate-marquee" style={{animationDuration:`${duration}s`}}>{text}</div>
     :<div className="px-4 text-slate-400">{text}</div>}
 </div>;
}

function AppUpdateBanner({announcements}:{announcements:any[]}){
 const appUpdates=announcements?.filter(
   (a:any)=>a.type==="app_update"
 )||[];

 if(!appUpdates.length)return null;

 return (
   <div className="bg-red-700 text-white px-4 py-3 border-b border-red-800 shadow-md">
     <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
       {appUpdates.map((update:any,idx:number)=>{
         const description=String(update.description||"");

         // Find the GitHub/APK URL in the announcement.
         const urlMatch=description.match(/https?:\/\/[^\s]+/i);
         const downloadUrl=urlMatch?.[0]||"";

         // Keep the announcement text but remove the raw URL from it.
         const message=downloadUrl
           ?description.replace(downloadUrl,"").trim()
           :description;

         return (
           <div
             key={update._id||idx}
             className="text-sm font-medium text-center sm:text-left flex-1"
           >
             🚀{" "}
             <span className="font-bold underline">
               App Update Available:
             </span>{" "}
             <span>{message}</span>

             {downloadUrl&&(
               <>
                 {" "}
                 <a
                   href={downloadUrl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="underline font-bold text-yellow-200 hover:text-white"
                 >
                   APK
                 </a>
               </>
             )}
           </div>
         );
       })}
     </div>
   </div>
 );
}

function PartyBanner({announcements}:{announcements:any[]}){
 const [dismissed,setDismissed]=useState<string[]>(()=>{
   try{
     return JSON.parse(
       localStorage.getItem("uy_dismissed_party_banners")||"[]"
     );
   }catch{
     return [];
   }
 });

 const banner=announcements?.find(
   (a:any)=>
     a.type==="party_banner" &&
     !dismissed.includes(a._id)
 );

 if(!banner)return null;

 const dismiss=()=>{
   const next=[...dismissed,banner._id];
   setDismissed(next);
   localStorage.setItem(
     "uy_dismissed_party_banners",
     JSON.stringify(next)
   );
 };

 return (
   <div className="fixed inset-0 z-40 flex items-center justify-center p-5 bg-black/70">
     <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full p-12 text-center border-4 border-double border-red-600/50 dark:border-red-400/50">

       <button
         onClick={dismiss}
         aria-label="Close"
         className="absolute top-4 right-5 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-2xl leading-none font-bold"
       >
         ×
       </button>

       <span className="block text-6xl text-red-600/20 dark:text-red-400/20 font-black leading-none">
         "
       </span>

       <h2 className="text-3xl sm:text-4xl font-black text-red-700 dark:text-red-400 -mt-4 uppercase tracking-wide">
         🎉 Party Time!
       </h2>

       <p className="text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 mt-8 leading-relaxed">
         {banner.description}
       </p>

       {(banner.venue || banner.eventDate) && (
         <div className="mt-8 space-y-5 text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100">
           {banner.venue && (
             <div className="flex items-start justify-center gap-3">
               <span className="text-2xl shrink-0">📍</span>
               <span>{banner.venue}</span>
             </div>
           )}

           {banner.eventDate && (
             <div className="flex items-start justify-center gap-3">
               <span className="text-2xl shrink-0">🗓️</span>
               <span>
                 {new Date(banner.eventDate).toLocaleString(
                   undefined,
                   {
                     dateStyle:"medium",
                     timeStyle:"short"
                   }
                 )}
               </span>
             </div>
           )}
         </div>
       )}

       <span className="block text-6xl text-red-600/20 dark:text-red-400/20 font-black leading-none rotate-180 mt-6">
         "
       </span>

       <div className="flex items-center justify-center gap-3 mt-8 pt-6 border-t dark:border-slate-700">
         <img
           src="/brand/logo-badge.png"
           alt=""
           className="w-12 h-12"
         />

         <div className="text-left">
           <p className="font-black text-lg text-slate-900 dark:text-white leading-tight">
             Unique Youth
           </p>

           <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
             Cooperative Thrift Club
           </p>
         </div>
       </div>
     </div>
   </div>
 );
}

function BroadcastModal({announcements}:{announcements:any[]}){
 const broadcasts=announcements?.filter(
   (a:any)=>
     a.isBroadcast &&
     a.type!=="party_banner" &&
     a.type!=="app_update"
 )||[];

 if(!broadcasts.length)return null;

 const text=broadcasts
   .map((a:any)=>a.description)
   .join("     •     ");

 const duration=Math.min(
   60,
   Math.max(20,broadcasts.length*10)
 );

 return (
   <div className="bg-gradient-to-r from-red-600 to-red-700 text-white overflow-hidden py-4">
     <div
       className="inline-block whitespace-nowrap animate-marquee font-black text-lg"
       style={{animationDuration:`${duration}s`}}
     >
       {text}
     </div>
   </div>
 );
}

function Dashboard({dashboard,announcements,onLogout,onRefresh,theme,setTheme}:any){
 const [view,setView]=useState<"home"|"profile">("home");
 const [refreshing,setRefreshing]=useState(false);
 const status=dashboard?.user?.registrationStatus;
 const isActive=status==="active";
 // "Verified by the admin" = guarantor already checked, whether or not a
 // slot has been assigned yet. That's when the Profile tab unlocks.
 const isVerified=status==="awaiting_slot_assignment"||status==="active";
 const profileDone=!!dashboard?.user?.profileCompletedAt;

 const manualRefresh=async()=>{
   setRefreshing(true);
   try{await onRefresh?.()}finally{setTimeout(()=>setRefreshing(false),400)}
 };

 const paid=dashboard?.ledgers?.filter((x:any)=>x.isPaid).length||0;
 const mp=dashboard?.monthProgress;
 const circle=dashboard?.circle;

 return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
  <AppUpdateBanner announcements={announcements}/>
  <header className="bg-blue-800 text-white p-4 flex justify-between items-center gap-3 flex-wrap">
    <Brand/>
    <div className="flex items-center gap-3 flex-wrap justify-end w-full sm:w-auto">
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
  <PartyBanner announcements={announcements}/>
  <BroadcastModal announcements={announcements}/>

  {view==="profile"?<ProfilePage dashboard={dashboard} onSaved={onRefresh} onDone={()=>setView("home")}/>:
  <main className="max-w-6xl mx-auto p-5">
   <div className="flex items-center gap-3 flex-wrap">
     <h1 className="text-3xl font-black text-slate-900 dark:text-white">Welcome, {dashboard?.user?.firstName||"..."}</h1>
     {dashboard?.user?.isOnline && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2.5 py-1 rounded-full">
       <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/><span className="relative inline-flex rounded-full w-2 h-2 bg-green-500"/></span>
       You're online
     </span>}
   </div>

   <GetTheApp/>

   {!isActive && status && (
     <div className="mt-5 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow border-l-4 border-red-600" style={STATUS_FONT}>
       <h2 className="text-xl font-bold text-slate-900 dark:text-white">{STATUS_COPY[status]?.title||"Pending"}</h2>
       <p className="text-slate-600 dark:text-slate-200 mt-1 font-bold">
         {status==="awaiting_slot_assignment"&&profileDone
           // Profile's already done - drop the "set up your profile" prompt
           // entirely instead of nagging about something already finished.
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

    {/* Live feed: how much of this month's ₦11,000-per-member target has
        actually come in, updated every time the dashboard refreshes. */}
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

    {/* Late fee - always its own separate transaction, never folded into
        the contribution target above. Only shows up if the admin has
        actually imposed one. */}
    {dashboard?.lateFee && <div className={`mt-5 rounded-2xl p-5 shadow border-l-4 ${dashboard.lateFee.status==="paid"?"bg-green-50 dark:bg-green-950 border-green-500":"bg-amber-50 dark:bg-amber-950 border-amber-500"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Late fee</h2>
        {dashboard.lateFee.status==="paid"
          ?<span className="text-green-700 dark:text-green-400 font-bold text-sm">Paid ✓</span>
          :<span className="text-amber-700 dark:text-amber-400 font-bold text-sm">Owed</span>}
      </div>
      <p className="text-slate-600 dark:text-slate-300 mt-1">
        ₦{dashboard.lateFee.amount.toLocaleString()} {dashboard.lateFee.status==="paid"?"paid on":"outstanding since"} {new Date(dashboard.lateFee.status==="paid"?dashboard.lateFee.paidAt:dashboard.lateFee.imposedAt).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}
      </p>
      {dashboard.lateFee.status!=="paid" && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">This is separate from your monthly contribution. Pay via bank transfer like usual and send proof to the admin — they'll mark it paid here.</p>}
    </div>}

    <div className="grid md:grid-cols-2 gap-5 mt-5">
     <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
      <h2 className="font-bold text-xl text-slate-900 dark:text-white">My payment history</h2>
      <p className="text-slate-600 dark:text-slate-300">Confirmed months: {paid}</p>
      <div className="mt-4 bg-blue-50 dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-200">
        Send your ₦11,000 to the admin's account and share your receipt in the WhatsApp community. An admin will confirm it here once it's received - it'll show up in this list automatically.
      </div>
     </section>

     <section className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow">
      <h2 className="font-bold text-xl text-slate-900 dark:text-white">Your circle</h2>
      {circle ? <>
        <div className="mt-3 flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-blue-800 text-white flex flex-col items-center justify-center shrink-0">
            <span className="text-[10px] uppercase tracking-wide text-blue-200">Your number</span>
            <span className="text-3xl font-black">{circle.myNumber ?? "—"}</span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <p><b className="text-slate-900 dark:text-white">{circle.name}</b> · Cycle {circle.cycleNumber}</p>
            <p className="mt-1">{circle.size} of {circle.baselineSize} slots filled — {circle.slotsRemaining} remaining.</p>
            {circle.myDisbursed && <p className="mt-1 text-red-600 dark:text-red-400 font-semibold">You've already received your payout this cycle.</p>}
          </div>
        </div>
      </> : <p className="text-slate-500 dark:text-slate-400 mt-2">Not assigned to a circle yet.</p>}
     </section>
    </div>
   </>}
  </main>}
  <AppFooter/>
 </div>
}
function Card({t,v}:any){return <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow"><p className="text-slate-500 dark:text-slate-300 text-sm">{t}</p><b className="text-2xl text-slate-900 dark:text-white">{v}</b></div>}

const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];

function resizeImageFile(file:File,maxSize=320):Promise<string>{
 return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>{
     const img=new Image();
     img.onload=()=>{
       let {width,height}=img;
       if(width>height){if(width>maxSize){height=Math.round(height*maxSize/width);width=maxSize}}
       else{if(height>maxSize){width=Math.round(width*maxSize/height);height=maxSize}}
       const canvas=document.createElement("canvas");
       canvas.width=width;canvas.height=height;
       const ctx=canvas.getContext("2d");
       if(!ctx){reject(new Error("Could not process image"));return}
       ctx.drawImage(img,0,0,width,height);
       resolve(canvas.toDataURL("image/jpeg",0.82));
     };
     img.onerror=()=>reject(new Error("Could not read that image"));
     img.src=String(reader.result);
   };
   reader.onerror=()=>reject(new Error("Could not read that file"));
   reader.readAsDataURL(file);
 });
}

function ProfilePage({dashboard,onSaved,onDone}:any){
 const u=dashboard?.user||{};
 const circle=dashboard?.circle;
 const [avatarPreview,setAvatarPreview]=useState<string|null>(u.avatarDataUrl||null);
 const [day,setDay]=useState(u.dateOfBirthDay?String(u.dateOfBirthDay):"");
 const [month,setMonth]=useState(u.dateOfBirthMonth?String(u.dateOfBirthMonth):"");
 const [busy,setBusy]=useState(false);
 const [msg,setMsg]=useState("");
 const [err,setErr]=useState("");

 const onPickFile=async(e:ChangeEvent<HTMLInputElement>)=>{
   const file=e.target.files?.[0];
   if(!file)return;
   setErr("");
   try{
     const dataUrl=await resizeImageFile(file);
     setAvatarPreview(dataUrl);
   }catch(ex:any){setErr(ex.message)}
 };

 const save=async()=>{
   setErr("");setMsg("");setBusy(true);
   try{
     const body:any={};
     if(avatarPreview&&avatarPreview!==u.avatarDataUrl)body.avatarDataUrl=avatarPreview;
     if(day)body.dateOfBirthDay=Number(day);
     if(month)body.dateOfBirthMonth=Number(month);
     const res=await api("/api/member/profile",{method:"PUT",headers:{Authorization:`Bearer ${sessionStorage.getItem("memberToken")}`},body:JSON.stringify(body)});
     await onSaved?.();
     if(res.justCompleted){
       // Profile just went from incomplete to complete - head back to the
       // dashboard automatically instead of leaving them stranded here.
       onDone?.();
     }else{
       setMsg("Profile saved.");
     }
   }catch(ex:any){setErr(ex.message)}
   finally{setBusy(false)}
 };

 const rows=[
   ["Full name",`${u.firstName||""} ${u.lastName||""}`.trim()||"—"],
   ["Residential address",u.residentialAddress||"—"],
   ["Phone number",u.primaryPhone||"—"],
   ["Circle number",circle?.myNumber?`Slot ${circle.myNumber}${circle.name?` · ${circle.name} (Cycle ${circle.cycleNumber})`:""}`:"Not yet assigned"],
   ["Date of birth",u.dateOfBirthDay&&u.dateOfBirthMonth?`${u.dateOfBirthDay} ${MONTH_NAMES[u.dateOfBirthMonth-1]}`:"Not set yet"]
 ];

 return <main className="max-w-3xl mx-auto p-5">
   <div className="flex items-center justify-between mb-5">
     <h1 className="text-3xl font-black text-slate-900 dark:text-white">My Profile</h1>
     <button type="button" onClick={()=>onDone?.()} className="text-sm font-semibold text-blue-700 dark:text-blue-300 underline">Back to dashboard</button>
   </div>
   {msg&&<div className="p-3 mb-3 rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">{msg}</div>}
   {err&&<div className="p-3 mb-3 rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">{err}</div>}

   <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow flex items-center gap-5">
     {avatarPreview
       ?<img src={avatarPreview} alt="Your avatar" className="w-24 h-24 rounded-full object-cover border-4 border-blue-100 dark:border-blue-900"/>
       :<div className="w-24 h-24 rounded-full bg-blue-800 text-white flex items-center justify-center text-3xl font-black">{(u.firstName||"?")[0]}</div>}
     <div>
       <label className="inline-block bg-white dark:bg-slate-800 border border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700">
         Choose photo
         <input type="file" accept="image/*" className="hidden" onChange={onPickFile}/>
       </label>
       <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">JPG or PNG. It'll be resized automatically.</p>
     </div>
   </div>

   <div className="bg-white dark:bg-slate-900 rounded-2xl shadow mt-5 overflow-hidden overflow-x-auto">
     <table className="w-full text-sm">
       <tbody>
         {rows.map(([label,value])=>(
           <tr key={label} className="border-b dark:border-slate-700 last:border-0">
             <td className="p-4 font-semibold text-slate-500 dark:text-slate-300 w-1/3 align-top">{label}</td>
             <td className="p-4 text-slate-900 dark:text-white">{value}</td>
           </tr>
         ))}
       </tbody>
     </table>
   </div>

   <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow mt-5">
     <h2 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">Set your date of birth</h2>
     <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Day and month only — no year needed.</p>
     <div className="flex gap-3 flex-wrap">
       <label className="block">
         <span className="text-sm font-semibold">Day</span>
         <input type="number" min={1} max={31} value={day} onChange={e=>setDay(e.target.value)} className="mt-1 w-24 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3"/>
       </label>
       <label className="block">
         <span className="text-sm font-semibold">Month</span>
         <select value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 border dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg p-3">
           <option value="">Select</option>
           {MONTH_NAMES.map((m,i)=><option key={m} value={i+1}>{m}</option>)}
         </select>
       </label>
     </div>
     <button onClick={save} disabled={busy} className="btn mt-5 disabled:opacity-50">{busy?"Saving...":"Save profile"}</button>
   </div>
 </main>;
}