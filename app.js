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
          <span class="eyebrow">حسابك العقاري</span>
          <h2>حسابك على سوريا عقارات</h2>
          <p>سجّل الدخول لإضافة إعلاناتك ومتابعة طلباتك.</p>
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
            <button class="btn btn-outline" id="signUpButton" type="button">إنشاء حساب</button>
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
      if (!data?.length) {
        panel.textContent = "لا توجد طلبات نشر معلّقة حالياً.";
        return;
      }
      panel.innerHTML = `
        <div style="display:grid;gap:14px">
          <h3>طلبات النشر المعلقة (${data.length})</h3>
          ${data.map(p => `
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
            </article>`).join("")}
        </div>`;
    }

    $("adminMessage")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-listing-action]");
      if (!button || !isAdmin) return;
      const id = button.dataset.listingId;
      const action = button.dataset.listingAction;
      const nextStatus = action === "approve" ? "approved" : "rejected";
      const confirmText = action === "approve"
        ? "تأكيد الموافقة على الإعلان ونشره للعامة؟"
        : "تأكيد رفض طلب النشر؟";
      if (!window.confirm(confirmText)) return;
      button.disabled = true;
      const { error } = await db.from("listings")
        .update({ status: nextStatus }).eq("id", id).eq("status", "pending");
      if (error) {
        window.alert("تعذر تحديث الطلب: " + error.message);
        button.disabled = false;
        return;
      }
      await loadPendingListings();
      await loadListings();
    });

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

    $("propertyForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("listingMedia")?.files || []);
      if (files.length) {
        setMessage("formMessage", "إرسال العقارات النصية متاح الآن دون حساب. رفع الصور والفيديو سيُفعّل بعد استكمال إعداد التخزين الآمن.", true);
        return;
      }
      const title = $("listingTitle")?.value.trim() || "";
      const governorate = $("listingCity")?.value || "";
      const category = $("listingCategory")?.value || "";
      const [listingType, propertyType] = category.split("|");
      const contactPhone = $("listingPhone")?.value.trim() || "";
      const description = $("listingDetails")?.value.trim() || "";
      if (!title || !governorate || !listingType || !propertyType || !contactPhone) {
        setMessage("formMessage", "أدخل عنوان الإعلان والمحافظة ونوع الإعلان ورقم التواصل.", true);
        return;
      }
      if (title.length < 5) {
        setMessage("formMessage", "عنوان الإعلان يجب ألا يقل عن 5 أحرف.", true);
        return;
      }
      const button = event.submitter || $("propertyForm").querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      setMessage("formMessage", "جارٍ حفظ الإعلان...");
      let savedId = null;
      try {
        const { data, error } = await db.from("listings").insert({
          owner_id: null,
          title, description, listing_type: listingType, property_type: propertyType,
          country: "سوريا", governorate, city: governorate,
          price: null, currency: "USD", contact_phone: contactPhone, status: "pending"
        }).select("id").single();
        if (error) throw error;
        savedId = data.id;
        $("propertyForm").reset();
        setMessage("formMessage", "تم استلام إعلانك بنجاح دون الحاجة إلى حساب. سيبقى قيد المراجعة ولن يظهر للعامة إلا بعد موافقة الإدارة.");
      } catch (error) {
        console.error("submit listing:", error);
        setMessage("formMessage", (savedId ? "تم حفظ الإعلان لكن تعذر إكمال المرفقات: " : "تعذر إرسال الإعلان: ") +
          (error.message || "خطأ غير معروف"), true);
      } finally {
        if (button) button.disabled = false;
      }
    });

    $("aiPrepareButton")?.addEventListener("click", () => {
      const text = $("aiDescription")?.value.trim() || "";
      if (!text) return setMessage("aiResult", "اكتب وصف العقار أولاً.");
      setMessage("aiResult", `مسودة وصفك:\n\n${text}\n\nالمعلومات التي يُفضّل استكمالها: المحافظة والمنطقة، السعر والعملة، المساحة، عدد الغرف والحمامات، الطابق، وحالة العقار.\n\nتنبيه: هذه أداة تنظيم نص محلية وليست خدمة ذكاء اصطناعي متصلة حالياً.`);
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