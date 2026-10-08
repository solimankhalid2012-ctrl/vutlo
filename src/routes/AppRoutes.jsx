import React, { Suspense, lazy, useLayoutEffect } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import Home from "../pages/Home.jsx";
import { PageTransition } from "../components/common/Reveal.jsx";
import Loader from "../components/common/Loader.jsx";
import { isLang } from "../hooks/useLanguage.js";
import { useLang } from "../context/LangContext.jsx";

// تحميل كسول لبقية الصفحات (سرعة < 1.5s)
const Download = lazy(() => import("../pages/Download.jsx"));
const Lab = lazy(() => import("../pages/Lab.jsx"));
const History = lazy(() => import("../pages/History.jsx"));
const Features = lazy(() => import("../pages/Features.jsx"));
const About = lazy(() => import("../pages/About.jsx"));
const Contact = lazy(() => import("../pages/Contact.jsx"));
const Privacy = lazy(() => import("../pages/Privacy.jsx"));
const Terms = lazy(() => import("../pages/Terms.jsx"));
const Blog = lazy(() => import("../pages/Blog.jsx"));
// لوحة الإدارة
const AdminLogin = lazy(() => import("../pages/admin/Login.jsx"));
const AdminDashboard = lazy(() => import("../pages/admin/Dashboard.jsx"));
const AdminUsers = lazy(() => import("../pages/admin/Users.jsx"));
const AdminAnalytics = lazy(() => import("../pages/admin/Analytics.jsx"));
// حسابات المستخدمين + مقال
const Login = lazy(() => import("../pages/Login.jsx"));
const Register = lazy(() => import("../pages/Register.jsx"));
const Post = lazy(() => import("../pages/Post.jsx"));

/**
 * /:lang — كان يعرض الرئيسية فقط ويتجاهل المعامل، فيظهر /en بالعربية.
 * الآن: نحقق أن المسار لغة مدعومة فعلاً، نطبّقها على السياق فوراً،
 * ثم ننظّف المسار إلى "/" حتى لا تبقى النسخة العربية على الرابط الإنجليزي.
 * أي مسار غير معروف (خطأ مطبعي) يُعاد توجيهه للرئيسية بدل كسر الموقع.
 */
function LangRoute() {
  const { lang: code = "" } = useParams(); // اسم المعامل في المسار هو :lang
  const { lang, changeLang } = useLang();
  const wanted = code.toLowerCase();
  const valid = isLang(wanted);

  // useLayoutEffect لا useEffect: <Navigate> يستبدل المسار في مرحلة effects،
  // وهي قبل مرور المؤجل — فلو تأخّرنا كانت المكوّن يُفكّك قبل أن تُطبَّق اللغة.
  useLayoutEffect(() => {
    if (valid && lang !== wanted) changeLang(wanted);
  }, [valid, wanted, lang, changeLang]);

  return <Navigate to="/" replace />;
}

export default function AppRoutes() {
  const location = useLocation();
  return (
    <Suspense fallback={<Loader label="Vutlo…" />}>
      <PageTransition pathname={location.pathname}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/:lang" element={<LangRoute />} />
          <Route path="/download" element={<Download />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/history" element={<History />} />
          <Route path="/features" element={<Features />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/blog/:slug" element={<Post />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageTransition>
    </Suspense>
  );
}
