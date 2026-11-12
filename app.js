
/* سوريا عقارات - ربط Supabase */
(function () {
  "use strict";

  const SUPABASE_URL = "https://nmhizdassdyhrccvpvqy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_yxvweCkQLtPMiFWnkxzA-w_MUyRiKcv";
  const BUCKET = "property-media";

  const statusMessage = (text, error = false) => {
    const el = document.getElementById("formMessage");
    if (el) {
      el.textContent = text;
      el.style.color = error ? "#b42318" : "#16794b";
    }
  };

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) {
        resolve(window.supabase);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = () => {
        if (window.supabase?.createClient) resolve(window.supabase);
        else reject(new Error("تعذر تحميل مكتبة Supabase"));
      };
      script.onerror = () => reject(new Error("تعذر الاتصال بمكتبة Supabase"));
      document.head.appendChild(script);
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  async function start() {
    const library = await loadSupabase();
    const db = library.createClient(SUPABASE_URL, SUPABASE_KEY);

    let currentUser = null;

    /* إضافة واجهة الحساب */
    const loginSection = document.getElementById("login");
    if (loginSection) {
      loginSection.innerHTML = `
        <div>
          <span class="eyebrow">حسابك العقاري</span>
          <h2>حسابك على سوريا عقارات</h2>
          <p>سجّل الدخول لإضافة إعلاناتك ومتابعة طلباتك.</p>
        </div>
        <div style="max-width:420px;width:100%">
          <input id="accountName" placeholder="الاسم الكامل" style="width:100%;margin:6px 0;padding:12px">
          <input id="accountEmail" type="email" placeholder="البريد الإلكتروني" required style="width:100%;margin:6px 0;padding:12px">
          <input id="accountPassword" type="password" placeholder="كلمة المرور" required style="width:100%;margin:6px 0;padding:12px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-primary" id="signInButton" type="button">تسجيل الدخول</button>
            <button class="btn btn-outline" id="signUpButton" type="button">إنشاء حساب</button>
            <button class="btn btn-outline" id="signOutButton" type="button" hidden>خروج</button>
          </div>
          <p id="accountMessage" aria-live="polite"></p>
        </div>`;
    }

    const accountMessage = text => {
      const el = document.getElementById("accountMessage");
      if (el) el.textContent = text;
    };

    function updateAccountUI() {
      const signedIn = !!currentUser;
      const signIn = document.getElementById("signInButton");
      const signUp = document.getElementById("signUpButton");
      const signOut = document.getElementById("signOutButton");

      if (signIn) signIn.hidden = signedIn;
      if (signUp) signUp.hidden = signedIn;
      if (signOut) signOut.hidden = !signedIn;

      accountMessage(signedIn
        ? "تم تسجيل الدخول: " + currentUser.email
        : "يمكنك تسجيل الدخول أو إنشاء حساب جديد.");
    }

    async function refreshUser() {
      const { data, error } = await db.auth.getUser();
      if (error) console.warn(error.message);
      currentUser = data?.user || null;
      updateAccountUI();
    }

    document.getElementById("signUpButton")?.addEventListener("click", async () => {
      const email = document.getElementById("accountEmail").value.trim();
      const password = document.getElementById("accountPassword").value;
      const name = document.getElementById("accountName").value.trim();

      if (!email || password.length < 6) {
        accountMessage("أدخل البريد وكلمة مرور من 6 أحرف على الأقل.");
        return;
      }

      accountMessage("جارٍ إنشاء الحساب...");
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });

      if (error) return accountMessage("تعذر إنشاء الحساب: " + error.message);

      if (data.session) {
        currentUser = data.user;
        updateAccountUI();
        accountMessage("تم إنشاء الحساب وتسجيل الدخول.");
      } else {
        accountMessage("تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا طُلب تأكيده، ثم سجّل الدخول.");
      }
    });

    document.getElementById("signInButton")?.addEventListener("click", async () => {
      const email = document.getElementById("accountEmail").value.trim();
      const password = document.getElementById("accountPassword").value;

      accountMessage("جارٍ تسجيل الدخول...");
      const { data, error } = await db.auth.signInWithPassword({ email, password });

      if (error) return accountMessage("تعذر تسجيل الدخول: " + error.message);

      currentUser = data.user;
      updateAccountUI();
      await loadProperties();
    });

    document.getElementById("signOutButton")?.addEventListener("click", async () => {
      const { error } = await db.auth.signOut();
      if (error) return accountMessage("تعذر تسجيل الخروج: " + error.message);
      currentUser = null;
      updateAccountUI();
      accountMessage("تم تسجيل الخروج.");
    });

    /* عرض العقارات التي وافقت عليها الإدارة فقط */
    function renderProperties(rows) {
      const grid = document.getElementById("propertyGrid");
      if (!grid) return;

      if (!rows.length) {
        grid.innerHTML = "<p>لا توجد عقارات معتمدة حالياً. كن أول من يضيف عقاره.</p>";
        return;
      }

      grid.innerHTML = rows.map(item => {
        const images = Array.isArray(item.images) ? item.images : [];
        const image = images[0] || "";
        const imageHTML = image
          ? `<img src="${escapeHTML(image)}" alt="صورة العقار" style="width:100%;height:210px;object-fit:cover">`
          : `<div class="property-image">⌂</div>`;

        const purpose = item.deal_type || "عقار";
        const price = item.price
          ? `${escapeHTML(item.price)} ${escapeHTML(item.currency || "")}`
          : "السعر عند الاستفسار";

        return `
          <article class="property-card">
            <div class="property-image">${imageHTML}
              <span class="property-badge">${escapeHTML(purpose)}</span>
            </div>
            <div class="property-info">
              <h3>${escapeHTML(item.title)}</h3>
              <p>${escapeHTML(item.governorate || "")} ${escapeHTML(item.city || "")}</p>
              <div class="property-meta">
                <span>${escapeHTML(item.property_type || "")}</span>
              </div>
              <p>${escapeHTML(item.description || "")}</p>
              <p class="property-price">${price}</p>
            </div>
          </article>`;
      }).join("");
    }

    async function loadProperties() {
      const grid = document.getElementById("propertyGrid");
      if (grid) grid.innerHTML = "<p>جارٍ تحميل العقارات...</p>";

      const { data, error } = await db
        .from("properties")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) {
        if (grid) grid.innerHTML = "<p>تعذر تحميل العقارات: " + escapeHTML(error.message) + "</p>";
        console.error(error);
        return;
      }

      renderProperties(data || []);
    }

    /* البحث */
    document.getElementById("searchForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      let query = db.from("properties")
        .select("*")
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      const purpose = document.getElementById("purpose")?.value;
      const type = document.getElementById("propertyType")?.value;
      const city = document.getElementById("city")?.value;

      if (purpose) query = query.eq("deal_type", purpose);
      if (type) query = query.eq("property_type", type);
      if (city) query = query.eq("governorate", city);

      const { data, error } = await query;

      if (error) {
        statusMessage("حدث خطأ في البحث: " + error.message, true);
        return;
      }

      renderProperties(data || []);
      document.getElementById("properties")?.scrollIntoView({ behavior: "smooth" });
    });

    /* رفع الصور والفيديو */
    async function uploadMedia(files, userId) {
      const urls = [];

      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

        const { error } = await db.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined
        });

        if (error) throw new Error("فشل رفع الملف " + file.name + ": " + error.message);

        const { data } = db.storage.from(BUCKET).getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }

      return urls;
    }

    /* إرسال إعلان جديد للمراجعة */
    document.getElementById("propertyForm")?.addEventListener("submit", async event => {
      event.preventDefault();

      if (!currentUser) {
        statusMessage("سجّل الدخول أولاً قبل إرسال الإعلان.", true);
        document.getElementById("login")?.scrollIntoView({ behavior: "smooth" });
        return;
      }

      const title = document.getElementById("listingTitle").value.trim();
      const purpose = document.getElementById("listingPurpose").value;
      const type = document.getElementById("listingType").value;
      const governorate = document.getElementById("listingCity").value;
      const priceText = document.getElementById("listingPrice").value.trim();
      const phone = document.getElementById("listingPhone").value.trim();
      const details = document.getElementById("listingDetails").value.trim();
      const files = Array.from(document.getElementById("listingMedia").files || []);

      if (!title || !purpose || !type || !governorate || !phone || !details) {
        statusMessage("يرجى تعبئة الحقول المطلوبة.", true);
        return;
      }

      const submitButton = event.submitter;
      if (submitButton) submitButton.disabled = true;
      statusMessage("جارٍ تجهيز الإعلان ورفع الملفات...");

      try {
        const images = files.length
          ? await uploadMedia(files, currentUser.id)
          : [];

        const numericPrice = priceText ? Number(priceText.replace(/,/g, "")) : null;
        if (priceText && !Number.isFinite(numericPrice)) {
          throw new Error("يرجى إدخال السعر كرقم صحيح.");
        }

        const { error } = await db.from("properties").insert({
          owner_id: currentUser.id,
          title,
          description: details + "\nرقم التواصل: " + phone,
          property_type: type,
          deal_type: purpose,
          governorate,
          price: numericPrice,
          images,
          status: "pending"
        });

        if (error) throw error;

        document.getElementById("propertyForm").reset();
        statusMessage("تم إرسال إعلانك بنجاح، وسيظهر بعد مراجعة الإدارة والموافقة عليه.");
      } catch (error) {
        console.error(error);
        statusMessage("لم يتم إرسال الإعلان: " + error.message, true);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });

    /* المساعد الأولي: تنظيم النص محلياً دون ادعاء اتصال AI */
    document.getElementById("aiPrepareButton")?.addEventListener("click", () => {
      const input = document.getElementById("aiDescription");
      const output = document.getElementById("aiResult");
      const description = input?.value.trim();

      if (!description) {
        if (output) output.textContent = "اكتب وصف العقار أولاً.";
        return;
      }

      if (output) {
        output.textContent =
          "مسودة أولية لوصفك:\n\n" + description +
          "\n\nيرجى التأكد من إضافة المحافظة والمنطقة والسعر والمساحة وعدد الغرف ووسيلة التواصل قبل نشر الإعلان.";
      }
    });

    const year = document.getElementById("currentYear");
    if (year) year.textContent = new Date().getFullYear();

    document.getElementById("menuToggle")?.addEventListener("click", () => {
      document.getElementById("mainNav")?.classList.toggle("active");
    });

    await refreshUser();
    await loadProperties();

    db.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      updateAccountUI();
    });

    console.log("سوريا عقارات: تم تهيئة اتصال Supabase.");
  }

  loadSupabase()
    .then(() => start())
    .catch(error => {
      console.error(error);
      statusMessage("تعذر تشغيل الربط مع قاعدة البيانات: " + error.message, true);
    });
})();
