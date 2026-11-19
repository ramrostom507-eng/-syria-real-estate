/* سوريا عقارات — ربط قاعدة البيانات الفعلية */
(() => {
  "use strict";

  const SUPABASE_URL = "https://pqacxzqgwlejpaaavhme.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_f0mnZcJCJFGQaASQx-Q4yw_5z-hSVWL";
  const STORAGE_BUCKET = "property-media";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);

  const purposeMap = { "بيع":"sale", "إيجار":"rent", "استثمار":"investment" };
  const typeMap = {
    "شقة":"apartment", "منزل":"house", "فيلا":"house", "أرض":"land",
    "محل تجاري":"commercial", "مكتب":"office", "مستودع":"warehouse",
    "عقار آخر":"other"
  };
  const purposeLabel = { sale:"للبيع", rent:"للإيجار", investment:"استثمار" };
  const typeLabel = {
    apartment:"شقة", house:"منزل أو فيلا", land:"أرض", commercial:"عقار تجاري",
    office:"مكتب", warehouse:"مستودع", farm:"مزرعة", building:"مبنى", other:"عقار آخر"
  };

  function setMessage(id, text, isError = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#b42318" : "#16794b";
  }

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase);
    const sources = [
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
      "https://unpkg.com/@supabase/supabase-js@2"
    ];
    return new Promise((resolve, reject) => {
      let index = 0;
      const tryNext = () => {
        if (window.supabase?.createClient) return resolve(window.supabase);
        if (index >= sources.length) {
          return reject(new Error("تعذر تحميل مكتبة الاتصال من مصدريها. قد يكون مانع الإعلانات أو الشبكة يحجب مواقع المكتبات."));
        }
        const script = document.createElement("script");
        script.src = sources[index++];
        script.async = true;
        script.onload = () => window.supabase?.createClient
          ? resolve(window.supabase)
          : tryNext();
        script.onerror = tryNext;
        document.head.appendChild(script);
      };
      tryNext();
    });
  }

  async function testSupabaseConnection() {
    try {
      const response = await fetch(SUPABASE_URL + "/auth/v1/health", {
        method: "GET",
        headers: { apikey: SUPABASE_ANON_KEY },
        cache: "no-store"
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return true;
    } catch (error) {
      console.error("Supabase network check:", error);
      throw new Error("المتصفح لا يستطيع الوصول إلى خادم التسجيل. جرّب إيقاف VPN أو مانع الإعلانات مؤقتاً أو فتح الموقع من متصفح آخر. التفاصيل: " + (error.message || "NetworkError"));
    }
  }

  async function main() {
    const lib = await loadSupabaseLibrary();
    await testSupabaseConnection();
    const db = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    let currentUser = null;
    let isAdmin = false;

    const loginSection = $("login");
    if (loginSection) {
      loginSection.innerHTML = `
        <div>
          <span class="eyebrow">دخول الإدارة</span>
          <h2>لوحة إدارة سوريا عقارات</h2>
          <p>هذا الدخول للمدير فقط. يمكنك نشر إعلانك وتعديله دون حساب.</p>
        </div>
        <div style="max-width:430px;width:100%">
          <input id="accountName" type="text" autocomplete="name" placeholder="الاسم الكامل"
            style="width:100%;margin:6px 0;padding:12px">
          <input id="accountEmail" type="email" autocomplete="email" placeholder="البريد الإلكتروني"
            style="width:100%;margin:6px 0;padding:12px">
          <input id="accountPassword" type="password" autocomplete="current-password"
            placeholder="كلمة المرور (6 أحرف على الأقل)" style="width:100%;margin:6px 0;padding:12px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-primary" id="signInButton" type="button">تسجيل الدخول</button>
            <button class="btn btn-outline" id="signOutButton" type="button" hidden>تسجيل الخروج</button>
          </div>
          <p id="accountMessage" aria-live="polite"></p>
        </div>`;
    }

    function renderAccount() {
      if ($("signInButton")) $("signInButton").hidden = !!currentUser;
      if ($("signUpButton")) $("signUpButton").hidden = !!currentUser;
      if ($("signOutButton")) $("signOutButton").hidden = !currentUser;
      if ($("adminNavButton")) $("adminNavButton").hidden = !isAdmin;
      setMessage("accountMessage", currentUser
        ? `تم تسجيل الدخول: ${currentUser.email || ""}`
        : "يمكنك تسجيل الدخول أو إنشاء حساب جديد.");
    }

    async function refreshAdminState() {
      isAdmin = false;
      if (currentUser) {
        const { data, error } = await db.from("profiles")
          .select("role,is_active").eq("id", currentUser.id).maybeSingle();
        if (error) console.warn("تعذر فحص صلاحية الإدارة:", error.message);
        isAdmin = !!data && data.role === "admin" && data.is_active === true;
      }
      renderAccount();
      if (isAdmin) await loadPendingListings();
      else {
        if ($("adminNavButton")) $("adminNavButton").hidden = true;
        if ($("adminMessage")) $("adminMessage").textContent = currentUser
          ? "هذا الحساب لا يملك صلاحية الإدارة."
          : "سجّل الدخول بحساب المدير لعرض طلبات النشر.";
      }
    }

    async function refreshUser() {
      const { data, error } = await db.auth.getUser();
      if (error) console.warn("auth.getUser:", error.message);
      currentUser = data?.user || null;
      renderAccount();
      await refreshAdminState();
    }

    $("signUpButton")?.addEventListener("click", async () => {
      const email = $("accountEmail")?.value.trim();
      const password = $("accountPassword")?.value || "";
      const fullName = $("accountName")?.value.trim() || "";
      if (!email || password.length < 6) {
        setMessage("accountMessage", "أدخل البريد الإلكتروني وكلمة مرور من 6 أحرف على الأقل.", true);
        return;
      }
      const button = $("signUpButton");
      button.disabled = true;
      setMessage("accountMessage", "جارٍ إنشاء الحساب...");
      try {
        const { data, error } = await db.auth.signUp({
          email, password, options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        if (data.session && data.user) {
          currentUser = data.user;
          renderAccount();
          setMessage("accountMessage", "تم إنشاء الحساب وتسجيل الدخول بنجاح.");
        } else {
          setMessage("accountMessage", "تم إرسال طلب إنشاء الحساب. تحقق من بريدك الإلكتروني إذا كان تأكيد البريد مفعّلاً، ثم سجّل الدخول.");
        }
      } catch (error) {
        console.error("signUp error:", error);
        const detail = error instanceof TypeError || /Failed to fetch|NetworkError|fetch/i.test(error.message || "")
          ? "تعذر على المتصفح الوصول إلى خدمة التسجيل. تحقق من الاتصال أو VPN أو مانع الإعلانات ثم أعد المحاولة."
          : (error.message || "خطأ غير معروف");
        setMessage("accountMessage", "تعذر إنشاء الحساب: " + detail, true);
      } finally {
        button.disabled = false;
      }
    });

    $("signInButton")?.addEventListener("click", async () => {
      const email = $("accountEmail")?.value.trim();
      const password = $("accountPassword")?.value || "";
      if (!email || !password) {
        setMessage("accountMessage", "أدخل البريد الإلكتروني وكلمة المرور.", true);
        return;
      }
      const button = $("signInButton");
      button.disabled = true;
      setMessage("accountMessage", "جارٍ تسجيل الدخول...");
      try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        renderAccount();
        await refreshAdminState();
        await loadListings();
      } catch (error) {
        setMessage("accountMessage", "تعذر تسجيل الدخول: " + (error.message || "خطأ غير معروف"), true);
      } finally {
        button.disabled = false;
      }
    });

    $("signOutButton")?.addEventListener("click", async () => {
      const { error } = await db.auth.signOut();
      if (error) {
        setMessage("accountMessage", "تعذر تسجيل الخروج: " + error.message, true);
        return;
      }
      currentUser = null;
      isAdmin = false;
      renderAccount();
      await refreshAdminState();
      await loadListings();
    });

    async function signedMediaUrl(path) {
      if (!path) return "";
      const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
      if (error) {
        console.warn("تعذر إنشاء رابط وسائط:", error.message);
        return "";
      }
      return data?.signedUrl || "";
    }

    async function renderListings(listings) {
      const grid = $("propertyGrid");
      if (!grid) return;
      if (!listings.length) {
        grid.innerHTML = `
          <div class="empty-state"><h3>لا توجد عقارات معتمدة حالياً</h3>
          <p>يمكنك إضافة عقارك، وسيظهر بعد مراجعة الإدارة والموافقة عليه.</p></div>`;
        return;
      }

      const cards = await Promise.all(listings.map(async (p) => {
        const media = [...(p.listing_media || [])].sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));
        const mediaItems = await Promise.all(media.map(async (item) => {
          const url = await signedMediaUrl(item.storage_path);
          if (!url) return "";
          if (item.media_type === "image") {
            return `<a class="property-media-item" href="${escapeHTML(url)}" target="_blank" rel="noopener">
              <img src="${escapeHTML(url)}" alt="${escapeHTML(item.alt_text || p.title)}" loading="lazy"></a>`;
          }
          if (item.media_type === "video") {
            return `<div class="property-media-item"><video src="${escapeHTML(url)}" controls playsinline preload="metadata"></video></div>`;
          }
          return "";
        }));
        const gallery = mediaItems.filter(Boolean).join("");
        const mediaMarkup = gallery
          ? `<div class="property-media-gallery" aria-label="صور وفيديوهات العقار">${gallery}</div>`
          : `<div class="property-placeholder" aria-label="لا توجد صور مرفقة">⌂</div>`;
        const price = p.price !== null && p.price !== undefined
          ? `${escapeHTML(Number(p.price).toLocaleString("en-US"))} ${escapeHTML(p.currency || "")}`
          : "السعر عند الاستفسار";
        const phone = p.contact_phone
          ? `<a class="btn btn-outline property-contact" href="tel:${escapeHTML(p.contact_phone)}">اتصل بالمعلن</a>`
          : "";
        const shareText = [p.title, p.governorate, p.city, price].filter(Boolean).join(" — ");
        const shareUrl = window.location.origin + window.location.pathname + "#properties";
        const whatsapp = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
        return `
          <article class="property-card property-post">
            <div class="property-post-head">
              <span class="property-post-mark">⌂</span>
              <div><strong>${escapeHTML(p.title)}</strong>
                <small>${escapeHTML(p.governorate || "")}${p.city ? " — " + escapeHTML(p.city) : ""}${p.neighborhood ? " — " + escapeHTML(p.neighborhood) : ""}</small></div>
              <span class="property-badge">${escapeHTML(purposeLabel[p.listing_type] || p.listing_type || "عقار")}</span>
            </div>
            ${mediaMarkup}
            <div class="property-info">
              <div class="property-meta">
                <span> ${escapeHTML(typeLabel[p.property_type] || p.property_type || "عقار")}</span>
                ${p.area_m2 ? `<span>${escapeHTML(p.area_m2)} م²</span>` : ""}
                ${p.bedrooms ? `<span>${escapeHTML(p.bedrooms)} غرف</span>` : ""}
              </div>
              <p class="property-description">${escapeHTML(p.description || "")}</p>
              <p class="property-price">${price}</p>
              <div class="property-post-actions">
                ${phone}
                <a class="btn btn-light property-share" href="${whatsapp}" target="_blank" rel="noopener">مشاركة عبر واتساب</a>
              </div>
              ${media.length ? `<small class="media-count">📷 ${media.filter(x => x.media_type === "image").length} صور · 🎥 ${media.filter(x => x.media_type === "video").length} فيديو</small>` : ""}
            </div>
          </article>`;
      }));
      grid.innerHTML = cards.join("");
    }

    const listingSelect = "*, listing_media(id, media_type, storage_path, sort_order)";
    async function loadListings() {
      const grid = $("propertyGrid");
      if (grid) grid.innerHTML = "<p>جارٍ تحميل العقارات...</p>";
      const { data, error } = await db.from("listings")
        .select(listingSelect).eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("loadListings:", error);
        if (grid) grid.innerHTML = `<p>تعذر تحميل العقارات: ${escapeHTML(error.message)}</p>`;
        return;
      }
      await renderListings(data || []);
    }

    async function loadPendingListings() {
      const panel = $("adminMessage");
      if (!panel || !isAdmin) return;
      panel.innerHTML = "<p>جارٍ تحميل طلبات النشر المعلقة...</p>";
      const { data, error } = await db.from("listings")
        .select(listingSelect).eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("loadPendingListings:", error);
        panel.textContent = "تعذر تحميل الطلبات: " + error.message;
        return;
      }
      const { data: allListings, error: allError } = await db.from("listings")
        .select(listingSelect).in("status", ["approved","pending"])
        .order("created_at", { ascending: false });
      const uploadOptions = !allError && allListings?.length
        ? allListings.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.title)} — ${x.status === "approved" ? "منشور" : "قيد المراجعة"}</option>`).join("")
        : "";
      panel.innerHTML = `
        <div style="display:grid;gap:14px">
          <section class="property-card" style="padding:16px">
            <h3>إضافة صور إلى إعلان موجود</h3>
            <p>اختر الإعلان ثم ارفع الصور الأصلية من جهازك. ستظهر الصور على الإعلان بعد اكتمال الرفع.</p>
            <form id="adminMediaForm" style="display:grid;gap:10px">
              <label for="adminMediaListing">الإعلان</label>
              <select id="adminMediaListing" required>${uploadOptions}</select>
              <label for="adminMediaFiles">صور أو فيديو العقار</label>
              <input id="adminMediaFiles" type="file" accept="image/*,video/*" multiple required>
              <small>حتى 8 ملفات في المرة الواحدة، وحجم أقصى 50 ميغابايت للملف.</small>
              <button class="btn btn-primary" type="submit" ${uploadOptions ? "" : "disabled"}>رفع وربط الصور بالإعلان</button>
              <p id="adminMediaMessage" aria-live="polite"></p>
            </form>
          </section>
          <h3>طلبات النشر المعلقة (${data?.length || 0})</h3>
          ${data?.length ? data.map(p => `
            <article class="property-card" style="padding:16px">
              <h3>${escapeHTML(p.title)}</h3>
              <p>${escapeHTML(p.governorate || "")} — ${escapeHTML(p.city || "")}</p>
              <p>${escapeHTML(p.description || "")}</p>
              <p>النوع: ${escapeHTML(typeLabel[p.property_type] || p.property_type || "")}
                | العملية: ${escapeHTML(purposeLabel[p.listing_type] || p.listing_type || "")}</p>
              <p>السعر: ${p.price == null ? "غير محدد" : escapeHTML(p.price) + " " + escapeHTML(p.currency || "")}
                | هاتف التواصل: ${escapeHTML(p.contact_phone || "")}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" type="button" data-listing-action="approve" data-listing-id="${escapeHTML(p.id)}">✓ موافقة ونشر</button>
                <button class="btn btn-outline" type="button" data-listing-action="reject" data-listing-id="${escapeHTML(p.id)}">رفض الطلب</button>
              </div>
            </article>`).join("") : "<p>لا توجد طلبات نشر معلّقة حالياً.</p>"}

          <h3>إدارة الإعلانات المنشورة والمعلقة (${allListings?.length || 0})</h3>
          ${allListings?.length ? allListings.map(p => `
            <article class="property-card admin-listing-row" style="padding:14px">
              <strong>${escapeHTML(p.title)}</strong><p>${escapeHTML(p.governorate||"")} — ${escapeHTML(p.city||"")} · ${p.status==="approved"?"منشور":"قيد المراجعة"}</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-outline" type="button" data-listing-action="edit" data-listing-id="${escapeHTML(p.id)}">تعديل</button>
                <button class="btn btn-outline" type="button" data-listing-action="delete" data-listing-id="${escapeHTML(p.id)}">حذف نهائي</button>
              </div>
            </article>`).join("") : "<p>لا توجد إعلانات حالياً.</p>"}
        </div>`;
      $("adminMediaForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!isAdmin) return;
        const listingId = $("adminMediaListing")?.value;
        const files = Array.from($("adminMediaFiles")?.files || []);
        const msg = $("adminMediaMessage");
        const submit = event.submitter;
        if (!listingId || !files.length) return;
        if (files.length > 8) {
          if (msg) msg.textContent = "يمكن رفع 8 ملفات كحد أقصى في المرة الواحدة.";
          return;
        }
        if (submit) submit.disabled = true;
        if (msg) msg.textContent = "جارٍ رفع الصور وربطها بالإعلان...";
        try {
          const rows = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) throw new Error("نوع ملف غير مدعوم: " + file.name);
            if (file.size > MAX_FILE_SIZE) throw new Error("حجم الملف أكبر من 50 ميغابايت: " + file.name);
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `admin/${listingId}/${Date.now()}-${i}-${safeName}`;
            const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
              cacheControl: "3600", upsert: false, contentType: file.type
            });
            if (uploadError) throw uploadError;
            rows.push({
              listing_id: listingId, owner_id: null,
              media_type: file.type.startsWith("image/") ? "image" : "video",
              storage_path: path, sort_order: i, alt_text: file.name
            });
          }
          const { error: insertError } = await db.from("listing_media").insert(rows);
          if (insertError) throw insertError;
          if (msg) msg.textContent = "تم رفع " + rows.length + " ملفات وربطها بالإعلان بنجاح.";
          $("adminMediaForm").reset();
          await loadListings();
        } catch (error) {
          console.error("admin media upload:", error);
          if (msg) msg.textContent = "تعذر إكمال الرفع: " + (error.message || "خطأ غير معروف");
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    }


    $("adminMessage")?.addEventListener("click",async ev=>{const btn=ev.target.closest("button[data-listing-action]");if(!btn||!isAdmin)return;const id=btn.dataset.listingId,action=btn.dataset.listingAction;
      if(action==="edit"){const r=await db.from("listings").select("title,description,contact_phone").eq("id",id).maybeSingle();if(r.error||!r.data){window.alert("تعذر تحميل الإعلان.");return;}
        const title=window.prompt("عنوان الإعلان:",r.data.title);if(title===null)return;const description=window.prompt("تفاصيل الإعلان:",r.data.description||"");if(description===null)return;const phone=window.prompt("رقم التواصل:",r.data.contact_phone||"");if(phone===null)return;
        btn.disabled=true;const u=await db.from("listings").update({title:title.trim(),description:description.trim(),contact_phone:phone.trim()}).eq("id",id);if(u.error)window.alert("تعذر التعديل: "+u.error.message);await loadPendingListings();await loadListings();return;}
      if(action==="delete"){if(!window.confirm("حذف الإعلان نهائياً؟ لا يمكن التراجع عن هذه الخطوة."))return;btn.disabled=true;const m=await db.from("listing_media").select("storage_path").eq("listing_id",id);if(m.error){window.alert("تعذر فحص الصور: "+m.error.message);btn.disabled=false;return;}
        const paths=(m.data||[]).map(x=>x.storage_path).filter(Boolean);if(paths.length){const rm=await db.storage.from(STORAGE_BUCKET).remove(paths);if(rm.error){window.alert("تعذر حذف الصور: "+rm.error.message);btn.disabled=false;return;}}
        const d=await db.from("listings").delete().eq("id",id);if(d.error){window.alert("تعذر الحذف: "+d.error.message);btn.disabled=false;return;}await loadPendingListings();await loadListings();return;}
      const status=action==="approve"?"approved":"rejected";if(!window.confirm(action==="approve"?"الموافقة على الإعلان ونشره؟":"رفض طلب النشر؟"))return;btn.disabled=true;
      const u=await db.from("listings").update({status}).eq("id",id).eq("status","pending");if(u.error){window.alert("تعذر تحديث الطلب: "+u.error.message);btn.disabled=false;return;}await loadPendingListings();await loadListings();});
    $("searchForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      let query = db.from("listings").select(listingSelect)
        .eq("status", "approved").order("created_at", { ascending: false });
      const purpose = $("purpose")?.value || "";
      const type = $("propertyType")?.value || "";
      const governorate = $("city")?.value || "";
      if (purpose) query = query.eq("listing_type", purposeMap[purpose] || purpose);
      if (type) query = query.eq("property_type", typeMap[type] || type);
      if (governorate) query = query.eq("governorate", governorate);
      const { data, error } = await query;
      if (error) {
        setMessage("formMessage", "تعذر تنفيذ البحث: " + error.message, true);
        return;
      }
      await renderListings(data || []);
      $("properties")?.scrollIntoView({ behavior:"smooth", block:"start" });
    });

    async function uploadFiles(files, listingId) {
      const rows = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) throw new Error(`الملف ${file.name} ليس صورة أو فيديو مدعوماً.`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`حجم الملف ${file.name} أكبر من 50 ميغابايت.`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${currentUser.id}/${listingId}/${Date.now()}-${index}-${safeName}`;
        const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
          cacheControl:"3600", upsert:false, contentType:file.type
        });
        if (uploadError) throw new Error(`فشل رفع ${file.name}: ${uploadError.message}`);
        rows.push({
          listing_id: listingId, owner_id: currentUser.id,
          media_type: isImage ? "image" : "video",
          storage_path: path, sort_order: index, alt_text: file.name
        });
      }
      if (rows.length) {
        const { error } = await db.from("listing_media").insert(rows);
        if (error) throw new Error("تم رفع الملفات لكن تعذر ربطها بالإعلان: " + error.message);
      }
    }


    function makeGuestToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");}
    const guestCategories=[["sale|apartment","شقة للبيع"],["rent|apartment","شقة للإيجار"],["sale|house","منزل أو فيلا للبيع"],["rent|house","منزل أو فيلا للإيجار"],["sale|land","أرض للبيع"],["investment|land","أرض للاستثمار"],["sale|commercial","محل تجاري للبيع"],["rent|commercial","محل تجاري للإيجار"],["sale|office","مكتب للبيع"],["rent|office","مكتب للإيجار"],["sale|warehouse","مستودع للبيع"],["rent|warehouse","مستودع للإيجار"],["investment|other","فرصة استثمارية أخرى"]];
    const guestGovernorates=["دمشق","ريف دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","إدلب","درعا","السويداء","القنيطرة","دير الزور","الرقة","الحسكة"];
    function guestOptions(items,selected){return items.map(x=>'<option value="'+escapeHTML(x[0])+'" '+(selected===x[0]?'selected':'')+'>'+escapeHTML(x[1])+'</option>').join("");}
    async function openGuestListing(id,token){
      const panel=$("guestManagePanel");if(!panel)return;panel.textContent="جارٍ التحقق من رمز الإعلان...";
      const r=await db.rpc("guest_get_listing",{p_listing_id:id,p_token:token});
      if(r.error){panel.textContent="تعذر تحميل الإعلان: "+r.error.message;return;}
      const p=r.data;if(!p){panel.textContent="رقم الإعلان أو رمز الإدارة غير صحيح.";return;}
      panel.innerHTML='<div class="guest-edit-card"><h3>إدارة إعلانك</h3><p>الحالة: <strong>'+(p.status==="approved"?"منشور":p.status==="pending"?"قيد المراجعة":"غير منشور")+'</strong></p>'+
       '<form id="guestEditForm" class="guest-edit-form"><div class="field"><label>عنوان الإعلان</label><input id="guestEditTitle" required maxlength="120" value="'+escapeHTML(p.title)+'"></div>'+
       '<div class="field"><label>المحافظة</label><select id="guestEditGovernorate" required>'+guestOptions(guestGovernorates.map(v=>[v,v]),p.governorate)+'</select></div>'+
       '<div class="field"><label>نوع الإعلان</label><select id="guestEditCategory" required>'+guestOptions(guestCategories,p.listing_type+"|"+p.property_type)+'</select></div>'+
       '<div class="field"><label>رقم التواصل</label><input id="guestEditPhone" type="tel" required value="'+escapeHTML(p.contact_phone||"")+'"></div>'+
       '<div class="field"><label>التفاصيل</label><textarea id="guestEditDescription" rows="4">'+escapeHTML(p.description||"")+'</textarea></div>'+
       '<div class="guest-edit-actions"><button class="btn btn-primary" type="submit">حفظ التعديلات</button><button class="btn btn-outline" id="guestDeleteButton" type="button">حذف الإعلان</button></div><p id="guestEditMessage"></p></form></div>';
      $("guestEditForm").addEventListener("submit",async ev=>{ev.preventDefault();const c=$("guestEditCategory").value.split("|"),b=ev.submitter;if(b)b.disabled=true;
        const u=await db.rpc("guest_update_listing",{p_listing_id:id,p_token:token,p_title:$("guestEditTitle").value.trim(),p_description:$("guestEditDescription").value.trim(),p_listing_type:c[0],p_property_type:c[1],p_governorate:$("guestEditGovernorate").value,p_contact_phone:$("guestEditPhone").value.trim()});
        if(u.error||!u.data){setMessage("guestEditMessage","تعذر الحفظ: "+(u.error?.message||"رمز غير صحيح"),true);if(b)b.disabled=false;return;}
        setMessage("guestEditMessage","تم حفظ التعديلات. سيعود الإعلان للمراجعة قبل ظهوره مجدداً.");await loadListings();if(b)b.disabled=false;});
      $("guestDeleteButton").addEventListener("click",async()=>{if(!window.confirm("هل تريد حذف الإعلان نهائياً؟"))return;const b=$("guestDeleteButton");b.disabled=true;
        const d=await db.rpc("guest_delete_listing",{p_listing_id:id,p_token:token});if(d.error||!d.data){setMessage("guestEditMessage","تعذر الحذف: "+(d.error?.message||"رمز غير صحيح"),true);b.disabled=false;return;}
        panel.innerHTML="<p>تم حذف إعلانك بنجاح.</p>";$("guestLookupForm").reset();await loadListings();});
    }
    $("guestLookupForm")?.addEventListener("submit",async ev=>{ev.preventDefault();const id=$("guestListingId").value.trim(),token=$("guestListingToken").value.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(token)){setMessage("guestLookupMessage","رمز الإدارة غير مكتمل.",true);return;}setMessage("guestLookupMessage","جارٍ فتح إعلانك...");await openGuestListing(id,token);setMessage("guestLookupMessage","");});
    $("propertyForm")?.addEventListener("submit",async ev=>{ev.preventDefault();const title=$("listingTitle").value.trim(),governorate=$("listingCity").value,c=$("listingCategory").value.split("|"),phone=$("listingPhone").value.trim(),description=$("listingDetails").value.trim();
      if(!title||title.length<5||!governorate||!c[0]||!c[1]||!phone){setMessage("formMessage","أدخل العنوان والمحافظة ونوع الإعلان ورقم التواصل بشكل صحيح.",true);return;}
      const b=ev.submitter||$("propertyForm").querySelector('button[type="submit"]');if(b)b.disabled=true;setMessage("formMessage","جارٍ إرسال الإعلان للمراجعة...");const token=makeGuestToken();
      try{const r=await db.rpc("guest_create_listing",{p_token:token,p_title:title,p_description:description,p_listing_type:c[0],p_property_type:c[1],p_governorate:governorate,p_contact_phone:phone});if(r.error)throw r.error;
        $("propertyForm").reset();const box=$("guestCredentials");if(box)box.innerHTML='<div class="guest-credentials-card"><h3>تم استلام إعلانك بنجاح ✓</h3><p>إعلانك قيد مراجعة الإدارة. احتفظ برقم الإعلان ورمز الإدارة لتعديله أو حذفه لاحقاً.</p><label>رقم الإعلان</label><code>'+escapeHTML(r.data)+'</code><button type="button" class="btn btn-outline" data-copy-value="'+escapeHTML(r.data)+'">نسخ رقم الإعلان</button><label>رمز الإدارة الخاص — لا تشاركه مع أحد</label><code>'+escapeHTML(token)+'</code><button type="button" class="btn btn-primary" data-copy-value="'+escapeHTML(token)+'">نسخ رمز الإدارة</button><p>إذا فقدت الرمز فلن نستطيع إثبات ملكيتك للإعلان. احتفظ به في مكان آمن.</p></div>';
        setMessage("formMessage","تم استلام إعلانك. سيظهر بعد موافقة الإدارة.");box?.scrollIntoView({behavior:"smooth",block:"center"});
      }catch(err){console.error(err);setMessage("formMessage","تعذر إرسال الإعلان: "+(err.message||"خطأ غير معروف"),true);}finally{if(b)b.disabled=false;}});
    $("guestCredentials")?.addEventListener("click",async ev=>{const b=ev.target.closest("button[data-copy-value]");if(!b)return;try{await navigator.clipboard.writeText(b.dataset.copyValue);b.textContent="تم النسخ ✓";}catch(_){window.prompt("انسخ النص التالي:",b.dataset.copyValue);}});
    let generatedPropertyAd = "";
    $("aiPrepareButton")?.addEventListener("click", () => {
      const raw = $("aiDescription")?.value.trim() || "";
      if (!raw) {
        setMessage("aiResult", "اكتب وصف العقار أولاً حتى نصنع لك الإعلان.");
        return;
      }
      const clean = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
      const firstSentence = clean.split(/[.!؟\n]/).map(x => x.trim()).find(Boolean) || "عقار معروض";
      generatedPropertyAd =
        "🏡 إعلان عقاري\n" +
        firstSentence + "\n\n" +
        "📍 تفاصيل العقار\n" + clean + "\n\n" +
        "📞 للاستفسار والتواصل\nيرجى التواصل مباشرة مع المعلن عبر بيانات الاتصال المرفقة بالإعلان.\n\n" +
        "منصة عقارات سوريا — فرصتك العقارية تبدأ من هنا.";
      const result = $("aiResult");
      if (result) {
        result.textContent = generatedPropertyAd +
          "\n\nقبل النشر، تأكد من إضافة رقم التواصل والمحافظة، وأرفق صوراً واضحة للعقار.";
        result.style.whiteSpace = "pre-wrap";
      }
      if ($("aiCopyButton")) $("aiCopyButton").hidden = false;
    });
    $("aiCopyButton")?.addEventListener("click", async () => {
      if (!generatedPropertyAd) return;
      try {
        await navigator.clipboard.writeText(generatedPropertyAd);
        setMessage("aiResult", generatedPropertyAd + "\n\n✓ تم نسخ الإعلان. يمكنك لصقه في نموذج إضافة العقار.");
      } catch (_) {
        const field = document.createElement("textarea");
        field.value = generatedPropertyAd;
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        setMessage("aiResult", generatedPropertyAd + (copied ? "\n\n✓ تم نسخ الإعلان." : "\n\nحدد النص وانسخه يدوياً."));
      }
    });

    if ($("currentYear")) $("currentYear").textContent = new Date().getFullYear();
    $("menuToggle")?.addEventListener("click", () => $("mainNav")?.classList.toggle("open"));

    await refreshUser();
    await loadListings();
    db.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      refreshAdminState().catch(error => console.error("admin refresh:", error));
    });
    console.info("تم تشغيل سوريا عقارات وربطها بقاعدة البيانات الصحيحة.");
  }

  main().catch((error) => {
    console.error("Syria Real Estate initialization:", error);
    setMessage("formMessage", "تعذر تشغيل المنصة: " + error.message, true);
    setMessage("accountMessage", "تعذر الاتصال بالخدمة: " + error.message, true);
  });
})();