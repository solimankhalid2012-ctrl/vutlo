import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import Header from "../components/common/Header.jsx";
import Footer from "../components/common/Footer.jsx";
import { useLang } from "../context/LangContext.jsx";
import { postContact } from "../services/api.js";

/** تواصل — نموذج حقيقي POST /api/contact + دعم 24/7 */
export default function Contact() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [f, setF] = useState({ name: "", email: "", message: "" });
  const [state, setState] = useState("idle"); // idle|sending|done|error
  const [msg, setMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault(); setState("sending"); setMsg("");
    try {
      await postContact(f);
      setState("done"); setMsg(ar ? "✅ وصلت رسالتك — نرد خلال 24 ساعة." : "✅ Message received — we reply within 24h.");
      setF({ name: "", email: "", message: "" });
    } catch (err) { setState("error"); setMsg("⚠️ " + err.message); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <Helmet><title>{ar ? "تواصل معنا" : "Contact"} — VideoVault Pro</title></Helmet>
      <Header />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-black">✉️ {ar ? "تواصل معنا 24/7" : "Contact us 24/7"}</h1>
        <form onSubmit={submit} className="card mt-6 space-y-2">
          <input value={f.name} onChange={set("name")} placeholder={ar ? "الاسم" : "Name"} className="input-smart" />
          <input value={f.email} onChange={set("email")} placeholder="Email" dir="ltr" className="input-smart text-left" />
          <textarea value={f.message} onChange={set("message")} placeholder={ar ? "رسالتك…" : "Your message…"} rows={5} className="input-smart" />
          {msg && <p className={`text-sm ${state === "done" ? "text-mint" : "text-red-300"}`}>{msg}</p>}
          <button disabled={state === "sending"} className="btn-primary w-full">{state === "sending" ? "⏳…" : ar ? "إرسال" : "Send"}</button>
        </form>
        <p className="mt-3 text-center text-xs text-white/40" dir="ltr">support@videovaultpro.com</p>
      </main>
      <Footer />
    </>
  );
}
