/* سوريا عقارات — ربط قاعدة البيانات الفعلية */
(() => {
  "use strict";

  const SUPABASE_URL = "https://pqacxzqgwlejpaaavhme.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_f0mnZcJCJFGQaASQx-Q4yw_5z-hSVWL";
  const STORAGE_BUCKET = "property-media";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  function detectMediaFile(original) {
    const ext = (original.name.split(".").pop() || "").toLowerCase();
    const byExtension = {
      jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp", gif:"image/gif",
      mp4:"video/mp4", m4v:"video/mp4", webm:"video/webm", mov:"video/quicktime",
      "3gp":"video/3gpp", "3gpp":"video/3gpp", avi:"video/x-msvideo",
      mkv:"video/x-matroska", mpg:"video/mpeg", mpeg:"video/mpeg",
      ogv:"video/ogg", ts:"video/mp2t"
    };
    const reported = (original.type || "").toLowerCase();
    const mime = (reported.startsWith("image/") || reported.startsWith("video/"))
      ? reported
      : (byExtension[ext] || reported);
    const isImage = mime.startsWith("image/") || ["jpg","jpeg","png","webp","gif"].includes(ext);
    const isVideo = mime.startsWith("video/") || ["mp4","m4v","webm","mov","3gp","3gpp","avi","mkv","mpg","mpeg","ogv","ts"].includes(ext);
    if (!isImage && !isVideo) throw new Error("صيغة الملف غير مدعومة: " + original.name);
    const safeMime = mime && mime !== "application/octet-stream" ? mime : (byExtension[ext] || (isVideo ? "video/mp4" : "image/jpeg"));
    const file = original.type === safeMime ? original : new File([original], original.name, { type: safeMime, lastModified: original.lastModified });
    return { file, isImage, isVideo, mime: safeMime };
  }

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

    // متابعة المنصة للزوار دون إنشاء حساب: معرّف عشوائي محفوظ على هذا المتصفح فقط.
    const FOLLOW_TOKEN_KEY = "syriaRealEstatePlatformFollowTokenV1";
    function getPlatformFollowToken() {
      let token = localStorage.getItem(FOLLOW_TOKEN_KEY);
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(FOLLOW_TOKEN_KEY, token);
      }
      return token;
    }
    async function refreshPlatformFollowers() {
      const countEl = $("platformFollowerCount");
      const button = $("platformFollowButton");
      if (!countEl || !button) return;
      const token = getPlatformFollowToken();
      const { data: count, error } = await db.rpc("platform_follower_count");
      if (error) {
        countEl.textContent = "غير متاح حالياً";
        console.warn("تعذر تحميل عدد متابعي المنصة:", error.message);
        return;
      }
      countEl.textContent = Number(count || 0).toLocaleString("ar");
      const followed = localStorage.getItem(FOLLOW_TOKEN_KEY + ":active") === "1";
      button.textContent = followed ? "✓ تتابع المنصة" : "＋ متابعة المنصة";
      button.setAttribute("aria-pressed", followed ? "true" : "false");
      button.dataset.followToken = token;
    }
    $("platformFollowButton")?.addEventListener("click", async () => {
      const button = $("platformFollowButton");
      const message = $("platformFollowMessage");
      if (!button || button.disabled) return;
      const token = getPlatformFollowToken();
      const wasFollowing = localStorage.getItem(FOLLOW_TOKEN_KEY + ":active") === "1";
      button.disabled = true;
      if (message) message.textContent = "جارٍ تحديث المتابعة...";
      try {
        const { data: count, error } = await db.rpc("platform_set_follow", {
          p_follower_token: token,
          p_following: !wasFollowing
        });
        if (error) throw error;
        localStorage.setItem(FOLLOW_TOKEN_KEY + ":active", wasFollowing ? "0" : "1");
        if ($("platformFollowerCount")) $("platformFollowerCount").textContent = Number(count || 0).toLocaleString("ar");
        button.textContent = wasFollowing ? "＋ متابعة المنصة" : "✓ تتابع المنصة";
        button.setAttribute("aria-pressed", wasFollowing ? "false" : "true");
        if (message) message.textContent = wasFollowing ? "تم إلغاء متابعتك للمنصة." : "شكراً لمتابعتك سوريا عقارات!";
      } catch (error) {
        if (message) message.textContent = "تعذر تحديث المتابعة الآن. حاول مرة أخرى.";
        console.error("Platform follow error:", error);
      } finally {
        button.disabled = false;
      }
    });
    refreshPlatformFollowers().catch(error => console.error("Follower count:", error));

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
      if (isAdmin) { await loadPendingListings(); await loadCommunityAdmin(); }
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

    async function prepareImageForUpload(file) {
      if (!file?.type?.startsWith("image/") || file.type === "image/gif") return file;
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.76));
        if (!blob || blob.size >= file.size * 0.92) return file;
        return new File([blob], file.name.replace(/\\.[^.]+$/, "") + ".webp", { type: "image/webp", lastModified: Date.now() });
      } catch (error) {
        console.warn("تعذر ضغط الصورة:", file.name, error);
        return file;
      } finally { bitmap?.close?.(); }
    }

    const SOCIAL_GUEST_KEY = "syriaRealEstateSocialGuestV1";
    function socialGuestId() {
      let id = localStorage.getItem(SOCIAL_GUEST_KEY);
      if (!id) { id = crypto.randomUUID(); localStorage.setItem(SOCIAL_GUEST_KEY, id); }
      return id;
    }
    const socialGuest = socialGuestId();

    async function renderListings(listings) {
      const grid = $("propertyGrid");
      if (!grid) return;
      if (!listings.length) {
        grid.innerHTML = `
          <div class="empty-state"><h3>لا توجد عقارات معتمدة حالياً</h3>
          <p>يمكنك إضافة عقارك، وسيظهر بعد مراجعة الإدارة والموافقة عليه.</p></div>`;
        return;
      }

      // الصور المضغوطة تُقدّم مباشرة من التخزين؛ نتجنب طلب تحويلات الخطة المدفوعة.
      const mediaPaths = [...new Set(listings.flatMap(p => (p.listing_media || []).map(item => item.storage_path).filter(Boolean)))];
      const signedMap = new Map();
      const listingIds = listings.map(p => p.id);
      const mediaPromise = (async () => {
        for (let i = 0; i < mediaPaths.length; i += 100) {
          const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrls(mediaPaths.slice(i, i + 100), 604800);
          if (error) console.warn("تعذر إنشاء بعض روابط الوسائط:", error.message);
          (data || []).forEach(item => { if (item?.path && item?.signedUrl) signedMap.set(item.path, item.signedUrl); });
        }
      })();
      const socialPromise = listingIds.length ? Promise.all([
        db.from("listing_likes").select("listing_id").in("listing_id", listingIds),
        db.from("listing_comments").select("listing_id").in("listing_id", listingIds),
        db.from("listing_likes").select("listing_id").eq("guest_id", socialGuest).in("listing_id", listingIds),
        db.from("listing_view_totals").select("listing_id,views,image_views,video_views").in("listing_id", listingIds)
      ]) : Promise.resolve([{data:[]},{data:[]},{data:[]},{data:[]}]);
      const [socialResults] = await Promise.all([socialPromise, mediaPromise]);
      const [likesResult, commentsResult, myLikesResult, viewsResult] = socialResults;
      const viewCounts = new Map((viewsResult.data || []).map(x => [x.listing_id, {
        views: Number(x.views || 0), image_views: Number(x.image_views || 0), video_views: Number(x.video_views || 0)
      }]));
      if (viewsResult.error) console.warn("تعذر تحميل إحصائيات المشاهدات:", viewsResult.error.message);
      let listingViewIncrement = 0;
      if (listingIds.length) {
        const impressionRows = listingIds.map(listing_id => ({ listing_id, event_type: "listing" }));
        const impressionResult = await db.from("listing_views").insert(impressionRows);
        if (impressionResult.error) console.warn("تعذر تسجيل مشاهدات الإعلانات:", impressionResult.error.message);
        else listingViewIncrement = 1;
      }
      if (likesResult.error) console.warn("تعذر تحميل الإعجابات:", likesResult.error.message);
      if (commentsResult.error) console.warn("تعذر تحميل التعليقات:", commentsResult.error.message);
      const likeCounts = new Map(), commentCounts = new Map();
      (likesResult.data || []).forEach(x => likeCounts.set(x.listing_id, (likeCounts.get(x.listing_id)||0)+1));
      (commentsResult.data || []).forEach(x => commentCounts.set(x.listing_id, (commentCounts.get(x.listing_id)||0)+1));
      const myLiked = new Set((myLikesResult.data || []).map(x=>x.listing_id));
      const cards = listings.map((p, listingIndex) => {
        const media = [...(p.listing_media || [])]
          .sort((a,b) => (a.sort_order || 0) - (b.sort_order || 0));
        const mediaItems = media.map((item, mediaIndex) => {
          const url = signedMap.get(item.storage_path) || "";
          if (!url) return "";
          if (item.media_type === "image") {
            const priority = listingIndex === 0 && mediaIndex === 0;
            return `<a class="property-media-item" href="${escapeHTML(url)}" target="_blank" rel="noopener">
              <img src="${escapeHTML(url)}" alt="${escapeHTML(item.alt_text || p.title)}"
                data-track-image="${escapeHTML(item.id)}" loading="${priority ? "eager" : "lazy"}" decoding="async"
                ${priority ? 'fetchpriority="high"' : ""}></a>`;
          }
          if (item.media_type === "video") {
            return `<div class="property-media-item"><video src="${escapeHTML(url)}" data-track-video="${escapeHTML(item.id)}" controls playsinline preload="metadata"></video><a class="text-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">إذا لم يعمل تشغيل الفيديو، افتحه هنا</a></div>`;
          }
          return "";
        });
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
        const shareUrl = window.location.origin + window.location.pathname + "?listing=" + encodeURIComponent(p.id) + "#property-" + encodeURIComponent(p.id);
        const whatsapp = `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
        return `
          <article id="property-${escapeHTML(p.id)}" class="property-card property-post">
            <div class="property-post-head">
              <span class="property-post-mark">⌂</span>
              <div><strong>${escapeHTML(p.title)}</strong>
                <small>${escapeHTML(p.governorate || "")}${p.city ? " — " + escapeHTML(p.city) : ""}${p.neighborhood ? " — " + escapeHTML(p.neighborhood) : ""}</small></div>
              <span class="property-badge">${escapeHTML(purposeLabel[p.listing_type] || p.listing_type || "عقار")}</span>
            </div>
            ${mediaMarkup}
            <div class="property-info">
              <div class="property-meta">
                <span>${escapeHTML(typeLabel[p.property_type] || p.property_type || "عقار")}</span>
                ${p.area_m2 ? `<span>${escapeHTML(p.area_m2)} م²</span>` : ""}
                ${p.bedrooms ? `<span>${escapeHTML(p.bedrooms)} غرف</span>` : ""}
              </div>
              <p class="property-description">${escapeHTML(p.description || "")}</p>
              <p class="property-price">${price}</p>
              <div class="property-view-stats" aria-label="إحصائيات المشاهدة">
                <span>👁 <strong data-listing-views="${escapeHTML(p.id)}">${(viewCounts.get(p.id)?.views || 0) + listingViewIncrement}</strong> مشاهدة</span>
                <span>📷 <strong data-image-views="${escapeHTML(p.id)}">${viewCounts.get(p.id)?.image_views || 0}</strong></span>
                <span>🎬 <strong data-video-views="${escapeHTML(p.id)}">${viewCounts.get(p.id)?.video_views || 0}</strong></span>
              </div>
              <div class="property-social-actions" aria-label="التفاعل مع الإعلان">
                <button class="social-action ${myLiked.has(p.id) ? "is-liked" : ""}" type="button" data-like-listing="${escapeHTML(p.id)}" aria-pressed="${myLiked.has(p.id)}">❤️ إعجاب <span data-like-count="${escapeHTML(p.id)}">${likeCounts.get(p.id)||0}</span></button>
                <button class="social-action" type="button" data-comments-toggle="${escapeHTML(p.id)}">💬 تعليق <span data-comment-count="${escapeHTML(p.id)}">${commentCounts.get(p.id)||0}</span></button>
                <button class="social-action" type="button" data-share-url="${escapeHTML(shareUrl)}" data-share-text="${escapeHTML(shareText)}">↗ مشاركة</button>
              </div>
              <div class="property-post-actions">
                ${phone}
                <a class="btn btn-light property-share" href="${whatsapp}" target="_blank" rel="noopener">واتساب</a>
              </div>
              <section class="listing-comments" id="comments-${escapeHTML(p.id)}" hidden>
                <form class="listing-comment-form" data-comment-form="${escapeHTML(p.id)}">
                  <input name="display_name" maxlength="60" placeholder="اسمك (اختياري)">
                  <textarea name="body" rows="2" maxlength="1000" required placeholder="اكتب تعليقك أو استفسارك..."></textarea>
                  <button class="btn btn-primary" type="submit">نشر التعليق</button>
                  <small>التعليقات ظاهرة للجميع. يرجى عدم نشر أرقام أو معلومات خاصة.</small>
                </form>
                <div class="listing-comment-list" data-comment-list="${escapeHTML(p.id)}"></div>
              </section>
              ${media.length ? `<small class="media-count">📷 ${media.filter(x => x.media_type === "image").length} صور · 🎥 ${media.filter(x => x.media_type === "video").length} فيديو</small>` : ""}
            </div>
          </article>`;
      });
      grid.innerHTML = cards.join("");
      const recordMediaView = async (mediaId, eventType, listingId) => {
        const result = await db.from("listing_views").insert({ listing_id: listingId, media_id: mediaId, event_type: eventType });
        if (result.error) { console.warn("تعذر تسجيل مشاهدة الوسائط:", result.error.message); return; }
        const counterName = eventType === "image" ? "image" : "video";
        const counter = grid.querySelector('[data-' + counterName + '-views="' + CSS.escape(listingId) + '"]');
        if (counter) counter.textContent = String(Number(counter.textContent || 0) + 1);
      };
      grid.querySelectorAll("[data-track-image]").forEach(img => {
        const track = () => {
          if (img.dataset.viewTracked === "1") return;
          img.dataset.viewTracked = "1";
          const listingId = img.closest(".property-post")?.id?.replace("property-", "");
          if (listingId) recordMediaView(img.dataset.trackImage, "image", listingId);
        };
        if (img.complete && img.naturalWidth > 0) track();
        else img.addEventListener("load", track, { once: true });
      });
      grid.querySelectorAll("[data-track-video]").forEach(video => {
        video.addEventListener("play", () => {
          const listingId = video.closest(".property-post")?.id?.replace("property-", "");
          if (listingId) recordMediaView(video.dataset.trackVideo, "video", listingId);
        });
      });
      grid.querySelectorAll("[data-like-listing]").forEach(button => button.addEventListener("click", async () => {
        const id=button.dataset.likeListing;
        if(button.getAttribute("aria-pressed")==="true") return;
        button.disabled=true;
        try {
          const r=await db.from("listing_likes").upsert({listing_id:id,guest_id:socialGuest},{onConflict:"listing_id,guest_id",ignoreDuplicates:true});
          if(r.error) throw r.error;
          button.setAttribute("aria-pressed","true");
          button.classList.add("is-liked");
          const count=button.querySelector("span");
          count.textContent=String(Number(count.textContent||0)+1);
        } catch(error) { alert("تعذر تسجيل الإعجاب: "+error.message); }
        finally { button.disabled=false; }
      }));
      grid.querySelectorAll("[data-comments-toggle]").forEach(button => button.addEventListener("click", async () => {
        const id=button.dataset.commentsToggle, panel=grid.querySelector("#comments-"+CSS.escape(id));
        if(!panel)return;
        panel.hidden=!panel.hidden;
        if(panel.hidden)return;
        const list=panel.querySelector("[data-comment-list]");
        list.innerHTML="<p>جارٍ تحميل التعليقات...</p>";
        const r=await db.from("listing_comments").select("id,display_name,body,created_at").eq("listing_id",id).order("created_at",{ascending:false}).limit(100);
        if(r.error){list.textContent="تعذر تحميل التعليقات: "+r.error.message;return;}
        list.innerHTML=(r.data||[]).map(x=>'<article class="listing-comment"><strong>'+escapeHTML(x.display_name||"زائر")+'</strong><p>'+escapeHTML(x.body)+'</p><small>'+new Date(x.created_at).toLocaleString("ar")+'</small></article>').join("") || "<p>لا توجد تعليقات بعد. كن أول من يعلّق.</p>";
      }));
      grid.querySelectorAll("[data-comment-form]").forEach(form => form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const id=form.dataset.commentForm, body=form.elements.body.value.trim();
        const displayName=form.elements.display_name.value.trim()||"زائر";
        if(!body)return;
        const button=form.querySelector('button[type="submit"]');button.disabled=true;
        const r=await db.from("listing_comments").insert({listing_id:id,guest_id:socialGuest,display_name:displayName,body});
        if(r.error){alert("تعذر نشر التعليق: "+r.error.message);button.disabled=false;return;}
        const list=grid.querySelector('[data-comment-list="'+CSS.escape(id)+'"]');
        if(list){
          const item=document.createElement("article"); item.className="listing-comment";
          const author=document.createElement("strong"); author.textContent=displayName;
          const message=document.createElement("p"); message.textContent=body;
          const time=document.createElement("small"); time.textContent=new Date().toLocaleString("ar");
          item.append(author,message,time); list.prepend(item);
        }
        form.reset();
        const counter=grid.querySelector('[data-comment-count="'+CSS.escape(id)+'"]');
        if(counter)counter.textContent=String(Number(counter.textContent||0)+1);
        button.disabled=false;
      }));
      grid.querySelectorAll("[data-share-url]").forEach(button => {
        button.addEventListener("click", async () => {
          const url = button.dataset.shareUrl;
          const title = button.dataset.shareText || "إعلان عقاري من سوريا عقارات";
          try {
            if (navigator.share) {
              await navigator.share({ title: "سوريا عقارات", text: title, url });
            } else if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(title + " — " + url);
              button.textContent = "✓ تم نسخ الرابط";
            } else {
              window.prompt("انسخ رابط الإعلان:", url);
            }
          } catch (error) {
            if (error?.name !== "AbortError") window.prompt("انسخ رابط الإعلان:", url);
          }
        });
      });
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
      const { data: statsRows, error: statsError } = await db.from("listing_view_totals")
        .select("views,image_views,video_views");
      const platformStats = (statsRows || []).reduce((sum, x) => ({
        views: sum.views + Number(x.views || 0),
        imageViews: sum.imageViews + Number(x.image_views || 0),
        videoViews: sum.videoViews + Number(x.video_views || 0)
      }), { views: 0, imageViews: 0, videoViews: 0 });
      if (statsError) console.warn("تعذر تحميل إحصائيات المنصة:", statsError.message);
      const uploadOptions = !allError && allListings?.length
        ? allListings.map(x => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.title)} — ${x.status === "approved" ? "منشور" : "قيد المراجعة"}</option>`).join("")
        : "";
      panel.innerHTML = `
        <div style="display:grid;gap:14px">
          <section class="property-card property-view-stats" style="padding:16px;display:flex;gap:18px;flex-wrap:wrap">
            <strong>إحصائيات المنصة:</strong>
            <span>👁 ${platformStats.views.toLocaleString("en-US")} مشاهدة إعلانات</span>
            <span>📷 ${platformStats.imageViews.toLocaleString("en-US")} مشاهدة صور</span>
            <span>🎬 ${platformStats.videoViews.toLocaleString("en-US")} تشغيل فيديو</span>
          </section>
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
            <hr><h3>تسريع الصور القديمة</h3>
            <p>يضغط الصور الموجودة إلى WebP ويحافظ على الملفات الأصلية كنسخة احتياطية.</p>
            <button class="btn btn-outline" id="optimizeOldImagesButton" type="button">تحسين الصور القديمة الآن</button>
            <p id="optimizeOldImagesMessage" aria-live="polite"></p>
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
      $("optimizeOldImagesButton")?.addEventListener("click", async (event) => {
        if (!isAdmin) return;
        const button=event.currentTarget, message=$("optimizeOldImagesMessage");
        button.disabled=true;
        try {
          const {data:rows,error}=await db.from("listing_media").select("id,listing_id,storage_path,media_type,alt_text").eq("media_type","image");
          if(error) throw error;
          let done=0,skipped=0;
          for(let i=0;i<(rows||[]).length;i++){
            const row=rows[i]; if(message) message.textContent="جارٍ تحسين الصورة "+(i+1)+" من "+rows.length+"...";
            const downloaded=await db.storage.from(STORAGE_BUCKET).download(row.storage_path);
            if(downloaded.error) throw downloaded.error;
            const source=new File([downloaded.data],row.alt_text||"photo.jpg",{type:downloaded.data.type||"image/jpeg"});
            const optimized=await prepareImageForUpload(source);
            if(optimized===source||optimized.size>=downloaded.data.size*.95){skipped++;continue;}
            const newPath="admin/"+row.listing_id+"/optimized-"+row.id+".webp";
            const uploaded=await db.storage.from(STORAGE_BUCKET).upload(newPath,optimized,{cacheControl:"31536000",upsert:true,contentType:optimized.type});
            if(uploaded.error) throw uploaded.error;
            const updated=await db.from("listing_media").update({storage_path:newPath}).eq("id",row.id);
            if(updated.error) throw updated.error;
            done++;
          }
          if(message) message.textContent="اكتمل: تم ضغط "+done+" صورة، و"+skipped+" لم تحتج ضغطاً. النسخ الأصلية محفوظة.";
          await loadListings();
        } catch(error){if(message) message.textContent="توقف التحسين: "+(error.message||"خطأ غير معروف");}
        finally{button.disabled=false;}
      });
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
            const original = files[i];
            const detected = detectMediaFile(original);
            const file = detected.isImage ? await prepareImageForUpload(detected.file) : detected.file;
            if (file.size > MAX_FILE_SIZE) throw new Error("حجم الملف أكبر من 50 ميغابايت: " + original.name);
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `admin/${listingId}/${Date.now()}-${i}-${safeName}`;
            const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
              cacheControl: "31536000", upsert: false, contentType: detected.isImage && file.type ? file.type : detected.mime
            });
            if (uploadError) throw uploadError;
            rows.push({
              listing_id: listingId, owner_id: null,
              media_type: detected.isImage ? "image" : "video",
              storage_path: path, sort_order: i, alt_text: original.name
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
        const original = files[index];
        const detected = detectMediaFile(original);
        const isImage = detected.isImage;
        const file = isImage ? await prepareImageForUpload(detected.file) : detected.file;
        if (file.size > MAX_FILE_SIZE) throw new Error(`حجم الملف ${original.name} أكبر من 50 ميغابايت.`);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${currentUser.id}/${listingId}/${Date.now()}-${index}-${safeName}`;
        const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
          cacheControl:"31536000", upsert:false, contentType:isImage && file.type ? file.type : detected.mime
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



    const GUEST_ADS_KEY = "syriaRealEstateGuestAdsV1";
    function makeGuestToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");}
    function getGuestAds(){try{const v=JSON.parse(localStorage.getItem(GUEST_ADS_KEY)||"[]");return Array.isArray(v)?v.filter(x=>x&&x.id&&x.token):[];}catch(_){return [];}}
    function saveGuestAd(id,token){const ads=getGuestAds().filter(x=>x.id!==id);ads.unshift({id,token,savedAt:new Date().toISOString()});localStorage.setItem(GUEST_ADS_KEY,JSON.stringify(ads.slice(0,50)));}
    function forgetGuestAd(id){localStorage.setItem(GUEST_ADS_KEY,JSON.stringify(getGuestAds().filter(x=>x.id!==id)));}
    const guestCategories=[["sale|apartment","شقة للبيع"],["rent|apartment","شقة للإيجار"],["sale|house","منزل أو فيلا للبيع"],["rent|house","منزل أو فيلا للإيجار"],["sale|land","أرض للبيع"],["investment|land","أرض للاستثمار"],["sale|commercial","محل تجاري للبيع"],["rent|commercial","محل تجاري للإيجار"],["sale|office","مكتب للبيع"],["rent|office","مكتب للإيجار"],["sale|warehouse","مستودع للبيع"],["rent|warehouse","مستودع للإيجار"],["investment|other","فرصة استثمارية أخرى"]];
    const guestGovernorates=["دمشق","ريف دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","إدلب","درعا","السويداء","القنيطرة","دير الزور","الرقة","الحسكة"];
    function guestOptions(items,selected){return items.map(x=>'<option value="'+escapeHTML(x[0])+'" '+(selected===x[0]?'selected':'')+'>'+escapeHTML(x[1])+'</option>').join("");}
    async function uploadGuestFiles(id,token,files){
      if(files.length>8)throw new Error("يمكن إرفاق 8 ملفات كحد أقصى.");
      for(let i=0;i<files.length;i++){
        const original=files[i],detected=detectMediaFile(original),isImage=detected.isImage,isVideo=detected.isVideo;
        const file=isImage?await prepareImageForUpload(detected.file):detected.file;
        if(file.size>MAX_FILE_SIZE)throw new Error("حجم الملف "+file.name+" يتجاوز 50 ميغابايت.");
        const ext=(file.name.split(".").pop()||"file").toLowerCase().replace(/[^a-z0-9]/g,"")||"file";
        const safeName=(file.name.replace(/[^a-zA-Z0-9._-]/g,"-").slice(-70)||("media."+ext));
        const path="guest/"+id+"/"+crypto.randomUUID()+"-"+safeName;
        const up=await db.storage.from(STORAGE_BUCKET).upload(path,file,{cacheControl:"31536000",upsert:false,contentType:isImage && file.type ? file.type : detected.mime});
        if(up.error)throw new Error("تعذر رفع "+file.name+": "+up.error.message);
        const linked=await db.rpc("guest_add_media",{p_listing_id:id,p_token:token,p_storage_path:path,p_media_type:isImage?"image":"video",p_alt_text:file.name,p_sort_order:i});
        if(linked.error)throw new Error("تم رفع الملف لكن تعذر ربطه بالإعلان: "+linked.error.message);
      }
    }
    async function renderMyGuestAds(){
      const box=$("myGuestAds");if(!box)return;
      const ads=getGuestAds();
      if(!ads.length){box.innerHTML='<p class="empty-state">لا توجد إعلانات محفوظة على هذا الجهاز بعد. عند نشر إعلانك سيظهر هنا تلقائياً.</p>';return;}
      box.innerHTML='<p>إعلاناتك المحفوظة على هذا الجهاز:</p><div class="my-guest-list">'+ads.map((x,i)=>'<div class="my-guest-row"><span>إعلان '+(i+1)+'</span><button class="btn btn-outline" type="button" data-guest-open="'+escapeHTML(x.id)+'">فتح الإعلان وإدارته</button></div>').join("")+'</div>';
    }
    async function openGuestListing(id,token){
      const panel=$("guestManagePanel");if(!panel)return;panel.textContent="جارٍ تحميل إعلانك...";
      const r=await db.rpc("guest_get_listing",{p_listing_id:id,p_token:token});
      if(r.error||!r.data){panel.textContent="تعذر العثور على الإعلان المحفوظ على هذا الجهاز.";return;}
      const p=r.data;
      const mediaRows=Array.isArray(p.media)?p.media:[];
      const mediaCards=await Promise.all(mediaRows.map(async m=>{
        const url=await signedMediaUrl(m.storage_path);
        const preview=m.media_type==="image"
          ? '<img src="'+escapeHTML(url)+'" alt="'+escapeHTML(m.alt_text||"صورة الإعلان")+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:10px">'
          : '<video src="'+escapeHTML(url)+'" controls playsinline style="width:100%;max-height:150px;border-radius:10px"></video>';
        return '<div class="guest-media-edit-item" style="display:grid;gap:6px;border:1px solid #ddd;border-radius:12px;padding:8px;min-width:130px;max-width:180px">'+preview+
          '<button class="btn btn-outline" type="button" data-remove-media="'+escapeHTML(m.id)+'">حذف هذه الوسائط</button></div>';
      }));
      panel.innerHTML='<div class="guest-edit-card"><h3>إدارة إعلانك</h3><p>حالة الإعلان: <strong>'+(p.status==="approved"?"منشور":p.status==="pending"?"قيد المراجعة":"غير منشور")+'</strong></p>'+
       '<form id="guestEditForm" class="guest-edit-form">'+
       '<section class="guest-edit-group"><h4>1 — معلومات العقار</h4><div class="field"><label>عنوان الإعلان</label><input id="guestEditTitle" required maxlength="180" value="'+escapeHTML(p.title)+'"></div>'+
       '<div class="field"><label>تفاصيل العقار</label><textarea id="guestEditDescription" rows="4">'+escapeHTML(p.description||"")+'</textarea></div></section>'+
       '<section class="guest-edit-group"><h4>2 — الموقع ونوع الإعلان</h4><div class="field"><label>المحافظة</label><select id="guestEditGovernorate" required>'+guestOptions(guestGovernorates.map(v=>[v,v]),p.governorate)+'</select></div>'+
       '<div class="field"><label>نوع الإعلان</label><select id="guestEditCategory" required>'+guestOptions(guestCategories,p.listing_type+"|"+p.property_type)+'</select></div></section>'+
       '<section class="guest-edit-group"><h4>3 — التواصل والصور</h4><div class="field"><label>رقم التواصل</label><input id="guestEditPhone" type="tel" value="'+escapeHTML(p.contact_phone||"")+'"></div>'+
       '<div class="field"><label>الصور والفيديو الحالية</label><div class="guest-media-edit-list" style="display:flex;gap:10px;flex-wrap:wrap">'+(mediaCards.join("")||'<small>لا توجد صور مرفقة حالياً.</small>')+'</div></div>'+
       '<div class="field"><label>إضافة صور أو فيديو جديد</label><input id="guestEditFiles" type="file" accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v,.webm,.mov,.3gp,.3gpp,.avi,.mkv,.mpg,.mpeg,.ogv,.ts" multiple><small>يمكن إضافة حتى 8 ملفات في كل مرة، 50 ميغابايت للملف.</small></div></section>'+
       '<div class="guest-edit-actions"><button class="btn btn-primary" type="submit">حفظ التعديلات</button><button class="btn btn-outline" id="guestDeleteButton" type="button">حذف الإعلان كاملاً</button></div><p id="guestEditMessage" aria-live="polite"></p></form></div>';
      panel.querySelectorAll("button[data-remove-media]").forEach(btn=>btn.addEventListener("click",async()=>{
        if(!window.confirm("حذف هذه الصورة أو الفيديو من المنشور؟"))return;
        btn.disabled=true;
        try {
          const category=$("guestEditCategory").value.split("|");
          const saved=await db.rpc("guest_update_listing",{p_listing_id:id,p_token:token,
            p_title:$("guestEditTitle").value.trim(),p_description:$("guestEditDescription").value.trim(),
            p_listing_type:category[0],p_property_type:category[1],
            p_governorate:$("guestEditGovernorate").value,p_contact_phone:$("guestEditPhone").value.trim()});
          if(saved.error||!saved.data)throw new Error(saved.error?.message||"تعذر تجهيز الإعلان للتعديل.");
          const removed=await db.rpc("guest_remove_media",{p_listing_id:id,p_token:token,p_media_id:btn.dataset.removeMedia});
          if(removed.error||!removed.data)throw new Error(removed.error?.message||"تعذر التحقق من صلاحية حذف الوسائط.");
          btn.closest(".guest-media-edit-item")?.remove();
          setMessage("guestEditMessage","تم حذف الصورة أو الفيديو من المنشور، وأُرسل الإعلان للمراجعة قبل ظهوره مجدداً.");
          await loadListings();await renderMyGuestAds();
        } catch(err) {
          btn.disabled=false;
          setMessage("guestEditMessage","تعذر حذف الوسائط: "+err.message,true);
        }
      }));
      $("guestEditForm").addEventListener("submit",async ev=>{ev.preventDefault();const c=$("guestEditCategory").value.split("|"),b=ev.submitter,files=Array.from($("guestEditFiles").files||[]);if(b)b.disabled=true;
        try{
          const u=await db.rpc("guest_update_listing",{p_listing_id:id,p_token:token,p_title:$("guestEditTitle").value.trim(),p_description:$("guestEditDescription").value.trim(),p_listing_type:c[0],p_property_type:c[1],p_governorate:$("guestEditGovernorate").value,p_contact_phone:$("guestEditPhone").value.trim()});
          if(u.error||!u.data)throw new Error(u.error?.message||"تعذر حفظ التعديلات.");
          if(files.length)await uploadGuestFiles(id,token,files);
          setMessage("guestEditMessage","تم حفظ التعديلات وإرسالها للمراجعة. ستظهر بعد موافقة الإدارة.");
          await loadListings();await renderMyGuestAds();
        }catch(err){setMessage("guestEditMessage","تعذر إكمال العملية: "+err.message,true);}finally{if(b)b.disabled=false;}
      });
      $("guestDeleteButton").addEventListener("click",async()=>{if(!window.confirm("هل تريد حذف هذا الإعلان نهائياً؟"))return;const b=$("guestDeleteButton");b.disabled=true;
        const d=await db.rpc("guest_delete_listing",{p_listing_id:id,p_token:token});
        if(d.error||!d.data){setMessage("guestEditMessage","تعذر الحذف: "+(d.error?.message||"تعذر التحقق من الإعلان"),true);b.disabled=false;return;}
        forgetGuestAd(id);panel.innerHTML="<p>تم حذف الإعلان.</p>";await renderMyGuestAds();await loadListings();
      });
      panel.scrollIntoView({behavior:"smooth",block:"center"});
    }
    $("myGuestAds")?.addEventListener("click",async ev=>{
      const b=ev.target.closest("button[data-guest-open]");if(!b)return;
      const ad=getGuestAds().find(x=>x.id===b.dataset.guestOpen);if(ad)await openGuestListing(ad.id,ad.token);
    });
    function inferGuestListing(text){
      const raw=text.trim();
      const first=(raw.split(/[\n،؛.!؟]/).map(x=>x.trim()).find(Boolean)||"").slice(0,120);
      const governorates=["ريف دمشق","دمشق","حلب","حمص","حماة","اللاذقية","طرطوس","إدلب","درعا","السويداء","القنيطرة","دير الزور","الرقة","الحسكة"];
      const governorate=governorates.find(x=>raw.includes(x))||"غير محدد";
      const purpose=/إيجار|للإيجار|للايجار|إيجاراً|مستأجر/.test(raw)?"rent":/استثمار|استثماري/.test(raw)?"investment":"sale";
      let type="other";
      if(/شقة/.test(raw))type="apartment";
      else if(/فيلا|منزل|بيت/.test(raw))type="house";
      else if(/أرض|ارض/.test(raw))type="land";
      else if(/محل|تجاري/.test(raw))type="commercial";
      else if(/مكتب/.test(raw))type="office";
      else if(/مستودع|هنغار/.test(raw))type="warehouse";
      const westernDigits = raw
        .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      // ابحث عن رقم الهاتف داخل كل سطر/عبارة، ولا تلتقط الأسعار أو المساحات كأنها هاتف.
      const phoneLabels = /هاتف|موبايل|جوال|للتواصل|اتصال|واتساب|واتس|رقم التواصل|رقم الهاتف/i;
      const phonePattern = /(?:\+|00)?\s*\d(?:[\d\s().-]{3,18}\d)/g;
      const phoneCandidates = [];
      westernDigits.split(/[\r\n،,؛;.!؟]/).forEach(line => {
        const labeled = phoneLabels.test(line);
        for (const match of line.matchAll(phonePattern)) {
          const value = match[0].replace(/[^\d+]/g, "");
          const digitCount = value.replace(/\D/g, "").length;
          if (digitCount >= 7 && digitCount <= 15) {
            phoneCandidates.push({ value, priority: labeled ? 0 : 1 });
          }
        }
      });
      phoneCandidates.sort((a, b) => a.priority - b.priority);
      const phone = phoneCandidates[0]?.value || null;
      return {title:first||"إعلان عقاري جديد",governorate,purpose,type,phone};
    }
    $("propertyForm")?.addEventListener("submit",async ev=>{
      ev.preventDefault();
      const description=$("listingDetails").value.trim(),files=Array.from($("listingFiles")?.files||[]);
      if(!description||description.length<5){setMessage("formMessage","اكتب تفاصيل الإعلان أولاً.",true);return;}
      if(files.length>8){setMessage("formMessage","يمكن إرفاق 8 ملفات كحد أقصى.",true);return;}
      const inferred=inferGuestListing(description);
      const b=ev.submitter||$("propertyForm").querySelector('button[type="submit"]');if(b)b.disabled=true;
      setMessage("formMessage","جارٍ إرسال الإعلان...");
      const token=makeGuestToken();
      try{
        const r=await db.rpc("guest_create_listing",{p_token:token,p_title:inferred.title,p_description:description,p_listing_type:inferred.purpose,p_property_type:inferred.type,p_governorate:inferred.governorate,p_contact_phone:inferred.phone});
        if(r.error)throw r.error;
        const id=r.data;saveGuestAd(id,token);
        if(files.length){setMessage("formMessage","تم إرسال بيانات الإعلان. جارٍ رفع الصور والفيديو...");await uploadGuestFiles(id,token,files);}
        $("propertyForm").reset();setMessage("formMessage","تم استلام إعلانك بنجاح. سيظهر بعد موافقة الإدارة، وستجده في قسم «إعلاناتي» على هذا الجهاز.");
        await renderMyGuestAds();await loadListings();
        $("my-listings")?.scrollIntoView({behavior:"smooth",block:"center"});
      }catch(err){console.error(err);setMessage("formMessage","تعذر إكمال النشر: "+(err.message||"خطأ غير معروف")+". إعلانك قد يكون محفوظاً؛ افتح قسم إعلاناتي لإكماله.",true);await renderMyGuestAds();}
      finally{if(b)b.disabled=false;}
    });

    const COMMUNITY_TOKEN_KEY="syriaRealEstateCommunityGuestV1", COMMUNITY_NAME_KEY="syriaRealEstateCommunityNameV1";
    function communityToken(){let t=localStorage.getItem(COMMUNITY_TOKEN_KEY);if(!t){t=crypto.randomUUID();localStorage.setItem(COMMUNITY_TOKEN_KEY,t);}return t;}
    if($("communityDisplayName"))$("communityDisplayName").value=localStorage.getItem(COMMUNITY_NAME_KEY)||"";
    const communityTypeLabel=t=>({general:"منشور عام",property:"عرض عقاري",question:"سؤال واستفسار",offer:"فرصة أو طلب"})[t]||"منشور";
    async function loadCommunityFeed(){
      const feed=$("communityFeed");if(!feed)return;feed.innerHTML='<p class="empty-state">جارٍ تحميل المنشورات...</p>';
      const {data:posts,error}=await db.from("community_posts").select("*").eq("status","approved").order("is_pinned",{ascending:false}).order("created_at",{ascending:false}).limit(60);
      if(error){feed.textContent="تعذر تحميل المنشورات: "+error.message;return;}
      if(!posts?.length){feed.innerHTML='<div class="empty-state"><h3>كن أول من ينشر في المجتمع</h3><p>اكتب منشورك وسيظهر بعد موافقة الإدارة.</p></div>';return;}
      const ids=posts.map(p=>p.id),[cr,rr]=await Promise.all([db.from("community_post_comments").select("*").in("post_id",ids).order("created_at",{ascending:true}),db.from("community_post_reactions").select("post_id,guest_token,reaction").in("post_id",ids)]);
      const cb=new Map(),rb=new Map();(cr.data||[]).forEach(c=>{if(!cb.has(c.post_id))cb.set(c.post_id,[]);cb.get(c.post_id).push(c);});(rr.data||[]).forEach(r=>{if(!rb.has(r.post_id))rb.set(r.post_id,[]);rb.get(r.post_id).push(r);});
      const token=communityToken(),savedName=localStorage.getItem(COMMUNITY_NAME_KEY)||"";
      feed.innerHTML=posts.map(p=>{const cs=cb.get(p.id)||[],rs=rb.get(p.id)||[],mine=rs.some(r=>r.guest_token===token);
        return '<article class="community-post"><header class="community-post-header"><div class="community-avatar">'+escapeHTML((p.display_name||"ز").slice(0,1))+'</div><div><strong>'+escapeHTML(p.display_name)+'</strong><small>'+communityTypeLabel(p.post_type)+' · '+new Date(p.created_at).toLocaleString("ar",{dateStyle:"medium",timeStyle:"short"})+'</small></div>'+(p.is_pinned?'<span class="community-pinned">📌 مثبت</span>':'')+'</header><div class="community-post-body">'+escapeHTML(p.body).replace(/\n/g,"<br>")+'</div><div class="community-post-stats"><span>👍 '+rs.length+' إعجاب</span><span>'+cs.length+' تعليق</span></div><div class="community-post-actions"><button type="button" data-community-like="'+p.id+'" class="'+(mine?'is-active':'')+'">'+(mine?'♥ أعجبني':'♡ إعجاب')+'</button><button type="button" data-community-focus="'+p.id+'">💬 تعليق</button><button type="button" data-community-report="'+p.id+'">⚑ إبلاغ</button></div><div class="community-comments">'+cs.map(c=>'<div class="community-comment"><strong>'+escapeHTML(c.display_name)+'</strong><p>'+escapeHTML(c.body)+'</p></div>').join("")+'</div><form class="community-comment-form" data-community-comment="'+p.id+'"><input name="display_name" maxlength="60" minlength="2" placeholder="اسمك المستعار" value="'+escapeHTML(savedName)+'" required><input name="body" maxlength="2000" placeholder="اكتب تعليقاً..." required><button class="btn btn-outline" type="submit">إرسال</button></form></article>';
      }).join("");
    }
    async function loadCommunityAdmin(){
      const box=$("communityAdminPanel");if(!box)return;if(!isAdmin){box.innerHTML="";return;}
      const [pr,br]=await Promise.all([db.from("community_posts").select("*").eq("status","pending").order("created_at",{ascending:true}),db.from("community_post_reports").select("*").eq("status","open").order("created_at",{ascending:false}).limit(30)]);
      if(pr.error){box.textContent="تعذر تحميل منشورات المراجعة: "+pr.error.message;return;}
      const ps=pr.data||[],rs=br.data||[];
      box.innerHTML='<section class="community-admin-card"><h3>مراجعة منشورات المجتمع ('+ps.length+')</h3>'+(ps.length?ps.map(p=>'<article class="community-admin-row"><strong>'+escapeHTML(p.display_name)+' · '+communityTypeLabel(p.post_type)+'</strong><p>'+escapeHTML(p.body).replace(/\n/g,"<br>")+'</p><div><button class="btn btn-primary" data-community-admin="approve" data-id="'+p.id+'">موافقة ونشر</button><button class="btn btn-outline" data-community-admin="reject" data-id="'+p.id+'">رفض</button><button class="btn btn-outline" data-community-admin="delete" data-id="'+p.id+'">حذف</button></div></article>').join(""):'<p>لا توجد منشورات بانتظار المراجعة.</p>')+'<h3>بلاغات المجتمع ('+rs.length+')</h3>'+(rs.length?rs.map(r=>'<article class="community-admin-row"><p>منشور: '+r.post_id+' · '+escapeHTML(r.reason)+'</p><button class="btn btn-outline" data-community-report-done="'+r.id+'">تمت المراجعة</button></article>').join(""):'<p>لا توجد بلاغات مفتوحة.</p>')+'</section>';
    }
    $("communityPostForm")?.addEventListener("submit",async ev=>{ev.preventDefault();const name=$("communityDisplayName").value.trim(),body=$("communityPostBody").value.trim(),type=$("communityPostType").value,b=ev.submitter;if(!name||!body)return;if(b)b.disabled=true;setMessage("communityPostMessage","جارٍ إرسال منشورك للمراجعة...");try{localStorage.setItem(COMMUNITY_NAME_KEY,name);const {data,error}=await db.rpc("community_create_guest_post",{p_guest_token:communityToken(),p_display_name:name,p_body:body,p_post_type:type});if(error)throw error;$("communityPostBody").value="";setMessage("communityPostMessage","وصل منشورك بنجاح! سيظهر للجميع بعد موافقة الإدارة.");}catch(e){setMessage("communityPostMessage","تعذر إرسال المنشور: "+e.message,true);}finally{if(b)b.disabled=false;}});
    $("communityRefreshButton")?.addEventListener("click",loadCommunityFeed);
    $("communityFeed")?.addEventListener("click",async ev=>{const like=ev.target.closest("[data-community-like]"),focus=ev.target.closest("[data-community-focus]"),report=ev.target.closest("[data-community-report]");if(focus){document.querySelector('[data-community-comment="'+focus.dataset.communityFocus+'"] input[name="body"]')?.focus();return;}if(like){const id=like.dataset.communityLike,t=communityToken();like.disabled=true;const old=await db.from("community_post_reactions").select("post_id").eq("post_id",id).eq("guest_token",t).maybeSingle();const r=old.data?await db.from("community_post_reactions").delete().eq("post_id",id).eq("guest_token",t):await db.from("community_post_reactions").insert({post_id:id,guest_token:t,reaction:"like"});if(r.error)window.alert("تعذر تحديث الإعجاب: "+r.error.message);await loadCommunityFeed();return;}if(report){const reason=window.prompt("ما سبب الإبلاغ عن المنشور؟");if(!reason?.trim())return;const r=await db.from("community_post_reports").insert({post_id:report.dataset.communityReport,guest_token:communityToken(),reason:reason.trim()});if(r.error)window.alert("تعذر إرسال البلاغ: "+r.error.message);else window.alert("تم إرسال البلاغ للإدارة.");}});
    $("communityFeed")?.addEventListener("submit",async ev=>{const f=ev.target.closest("form[data-community-comment]");if(!f)return;ev.preventDefault();const name=f.elements.display_name.value.trim(),body=f.elements.body.value.trim(),id=f.dataset.communityComment,b=f.querySelector("button");b.disabled=true;try{localStorage.setItem(COMMUNITY_NAME_KEY,name);const {error}=await db.from("community_post_comments").insert({post_id:id,guest_token:communityToken(),display_name:name,body});if(error)throw error;await loadCommunityFeed();}catch(e){window.alert("تعذر نشر التعليق: "+e.message);}finally{b.disabled=false;}});
    $("communityAdminPanel")?.addEventListener("click",async ev=>{const b=ev.target.closest("[data-community-admin],[data-community-report-done]");if(!b||!isAdmin)return;b.disabled=true;try{if(b.dataset.communityReportDone){const {error}=await db.from("community_post_reports").update({status:"reviewed"}).eq("id",b.dataset.communityReportDone);if(error)throw error;}else{const id=b.dataset.id,act=b.dataset.communityAdmin;if(act==="delete"){if(!window.confirm("حذف المنشور نهائياً؟")){b.disabled=false;return;}const {error}=await db.from("community_posts").delete().eq("id",id);if(error)throw error;}else{const {error}=await db.from("community_posts").update({status:act==="approve"?"approved":"rejected"}).eq("id",id);if(error)throw error;}}await loadCommunityAdmin();await loadCommunityFeed();}catch(e){window.alert("تعذر تنفيذ الإجراء: "+e.message);b.disabled=false;}});

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
    await loadCommunityFeed();
    await renderMyGuestAds();
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