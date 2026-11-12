/* سوريا عقارات — ربط Supabase المتوافق مع backend/database.sql */
(() => {
  "use strict";

  const SUPABASE_URL = "https://nmhizdassdyhrccvpvqy.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_yxvweCkQLtPMiFWnkxzA-w_MUyRiKcv";
  const STORAGE_BUCKET = "property-media";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const $ = (id) => document.getElementById(id);

  const html = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

  const purposeMap = {
    "بيع": "sale",
    "إيجار": "rent",
    "استثمار": "investment",
    sale: "sale",
    rent: "rent",
    investment: "investment"
  };

  const typeMap = {
    "شقة": "apartment",
    "منزل": "house",
    "فيلا": "villa",
    "أرض": "land",
    "محل تجاري": "commercial",
    "مكتب": "office",
    "مستودع": "warehouse",
    "عقار آخر": "other",
    apartment: "apartment",
    house: "house",
    villa: "villa",
    land: "land",
    commercial: "commercial",
    office: "office",
    warehouse: "warehouse",
    other: "other"
  };

  const purposeLabel = {
    sale: "للبيع",
    rent: "للإيجار",
    investment: "استثمار"
  };

  const typeLabel = {
    apartment: "شقة",
    house: "منزل",
    villa: "فيلا",
    land: "أرض",
    commercial: "محل تجاري",
    office: "مكتب",
    warehouse: "مستودع",
    other: "عقار آخر"
  };

  function message(id, text, isError = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.style.color = isError ? "#b42318" : "#16794b";
  }

  function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
      if (window.supabase?.createClient) {
        return resolve(window.supabase);
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

      script.onload = () => {
        window.supabase?.createClient
          ? resolve(window.supabase)
          : reject(new Error("لم يتم تحميل مكتبة Supabase."));
      };

      script.onerror = () => {
        reject(new Error("تعذر تحميل مكتبة Supabase. تحقق من اتصال الإنترنت."));
      };

      document.head.appendChild(script);
    });
  }

  async function main() {
    const supabaseLib = await loadSupabaseLibrary();

    const db = supabaseLib.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    let currentUser = null;

    // واجهة تسجيل الحساب
    const loginSection = $("login");

    if (loginSection) {
      loginSection.innerHTML = `
        <div>
          <span class="eyebrow">حسابك العقاري</span>
          <h2>حسابك على سوريا عقارات</h2>
          <p>سجّل الدخول لإضافة إعلاناتك ومتابعة طلباتك.</p>
        </div>

        <div style="max-width:430px;width:100%">
          <input
            id="accountName"
            type="text"
            autocomplete="name"
            placeholder="الاسم الكامل"
            style="width:100%;margin:6px 0;padding:12px"
          >

          <input
            id="accountEmail"
            type="email"
            autocomplete="email"
            placeholder="البريد الإلكتروني"
            style="width:100%;margin:6px 0;padding:12px"
          >

          <input
            id="accountPassword"
            type="password"
            autocomplete="current-password"
            placeholder="كلمة المرور (6 أحرف على الأقل)"
            style="width:100%;margin:6px 0;padding:12px"
          >

          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn btn-primary" id="signInButton" type="button">
              تسجيل الدخول
            </button>

            <button class="btn btn-outline" id="signUpButton" type="button">
              إنشاء حساب
            </button>

            <button
              class="btn btn-outline"
              id="signOutButton"
              type="button"
              hidden
            >
              تسجيل الخروج
            </button>
          </div>

          <p id="accountMessage" aria-live="polite"></p>
        </div>
      `;
    }

    function renderAccount() {
      if ($("signInButton")) {
        $("signInButton").hidden = !!currentUser;
      }

      if ($("signUpButton")) {
        $("signUpButton").hidden = !!currentUser;
      }

      if ($("signOutButton")) {
        $("signOutButton").hidden = !currentUser;
      }

      message(
        "accountMessage",
        currentUser
          ? `تم تسجيل الدخول: ${currentUser.email || ""}`
          : "يمكنك تسجيل الدخول أو إنشاء حساب جديد."
      );
    }

    async function refreshUser() {
      const { data, error } = await db.auth.getUser();

      if (error) {
        console.warn("auth.getUser:", error.message);
      }

      currentUser = data?.user || null;
      renderAccount();
    }

    // إنشاء حساب جديد
    $("signUpButton")?.addEventListener("click", async () => {
      const email = $("accountEmail")?.value.trim();
      const password = $("accountPassword")?.value || "";
      const fullName = $("accountName")?.value.trim() || "";

      if (!email || password.length < 6) {
        message(
          "accountMessage",
          "أدخل البريد الإلكتروني وكلمة مرور من 6 أحرف على الأقل.",
          true
        );
        return;
      }

      message("accountMessage", "جارٍ إنشاء الحساب...");

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        message(
          "accountMessage",
          "تعذر إنشاء الحساب: " + error.message,
          true
        );
        return;
      }

      if (data.session && data.user) {
        currentUser = data.user;
        renderAccount();

        message(
          "accountMessage",
          "تم إنشاء الحساب وتسجيل الدخول."
        );
      } else {
        message(
          "accountMessage",
          "تم إنشاء الحساب. تحقق من بريدك الإلكتروني إذا كان تأكيد البريد مفعّلاً، ثم سجّل الدخول."
        );
      }
    });

    // تسجيل الدخول
    $("signInButton")?.addEventListener("click", async () => {
      const email = $("accountEmail")?.value.trim();
      const password = $("accountPassword")?.value || "";

      if (!email || !password) {
        message(
          "accountMessage",
          "أدخل البريد الإلكتروني وكلمة المرور.",
          true
        );
        return;
      }

      message("accountMessage", "جارٍ تسجيل الدخول...");

      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        message(
          "accountMessage",
          "تعذر تسجيل الدخول: " + error.message,
          true
        );
        return;
      }

      currentUser = data.user;
      renderAccount();

      await loadProperties();
    });

    // تسجيل الخروج
    $("signOutButton")?.addEventListener("click", async () => {
      const { error } = await db.auth.signOut();

      if (error) {
        message(
          "accountMessage",
          "تعذر تسجيل الخروج: " + error.message,
          true
        );
        return;
      }

      currentUser = null;
      renderAccount();

      await loadProperties();
    });

    const propertySelect =
      "*, property_media(id, media_type, file_url, display_order)";

    // عرض العقارات
    function renderProperties(properties) {
      const grid = $("propertyGrid");

      if (!grid) return;

      if (!properties.length) {
        grid.innerHTML = `
          <div class="empty-state">
            <h3>لا توجد عقارات معتمدة حالياً</h3>
            <p>
              يمكنك إضافة عقارك، وسيظهر بعد مراجعة الإدارة والموافقة عليه.
            </p>
          </div>
        `;
        return;
      }

      grid.innerHTML = properties.map((p) => {
        const media = [...(p.property_media || [])].sort(
          (a, b) => a.display_order - b.display_order
        );

        const image = media.find(
          (m) => m.media_type === "image"
        );

        const video = media.find(
          (m) => m.media_type === "video"
        );

        let visual = `
          <div class="property-placeholder" aria-label="لا توجد صورة">
            ⌂
          </div>
        `;

        if (image) {
          visual = `
            <img
              src="${html(image.file_url)}"
              alt="${html(p.title)}"
              loading="lazy"
              style="width:100%;height:220px;object-fit:cover"
            >
          `;
        } else if (video) {
          visual = `
            <video
              src="${html(video.file_url)}"
              controls
              preload="metadata"
              style="width:100%;height:220px;object-fit:cover"
            ></video>
          `;
        }

        const price =
          p.price !== null && p.price !== undefined
            ? `${html(Number(p.price).toLocaleString("en-US"))} ${html(p.currency || "")}`
            : "السعر عند الاستفسار";

        const phone = p.contact_phone
          ? `
            <a
              class="btn btn-outline property-contact"
              href="tel:${html(p.contact_phone)}"
            >
              اتصل بالمعلن
            </a>
          `
          : "";

        return `
          <article class="property-card">
            <div class="property-image">
              ${visual}

              <span class="property-badge">
                ${html(purposeLabel[p.purpose] || p.purpose)}
              </span>
            </div>

            <div class="property-info">
              <h3>${html(p.title)}</h3>

              <p>
                ${html(p.governorate)}
                ${p.city ? " — " + html(p.city) : ""}
                ${p.neighborhood ? " — " + html(p.neighborhood) : ""}
              </p>

              <div class="property-meta">
                <span>
                  ${html(typeLabel[p.property_type] || p.property_type)}
                </span>

                ${p.area ? `<span>${html(p.area)} م²</span>` : ""}
                ${p.bedrooms ? `<span>${html(p.bedrooms)} غرف</span>` : ""}
              </div>

              <p>${html(p.description)}</p>

              <p class="property-price">${price}</p>

              ${phone}
            </div>
          </article>
        `;
      }).join("");
    }

    // تحميل العقارات المعتمدة فقط
    async function loadProperties() {
      const grid = $("propertyGrid");

      if (grid) {
        grid.innerHTML = "<p>جارٍ تحميل العقارات...</p>";
      }

      const { data, error } = await db
        .from("properties")
        .select(propertySelect)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("loadProperties:", error);

        if (grid) {
          grid.innerHTML = `
            <p>تعذر تحميل العقارات: ${html(error.message)}</p>
          `;
        }

        return;
      }

      renderProperties(data || []);
    }

    // البحث
    $("searchForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();

      let query = db
        .from("properties")
        .select(propertySelect)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      const purpose = $("purpose")?.value || "";
      const type = $("propertyType")?.value || "";
      const governorate = $("city")?.value || "";

      if (purpose) {
        query = query.eq(
          "purpose",
          purposeMap[purpose] || purpose
        );
      }

      if (type) {
        query = query.eq(
          "property_type",
          typeMap[type] || type
        );
      }

      if (governorate) {
        query = query.eq("governorate", governorate);
      }

      const { data, error } = await query;

      if (error) {
        message(
          "formMessage",
          "تعذر تنفيذ البحث: " + error.message,
          true
        );
        return;
      }

      renderProperties(data || []);

      $("properties")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    // رفع الصور والفيديو
    async function uploadPropertyFiles(files, propertyId) {
      const rows = [];

      for (let index = 0; index < files.length; index++) {
        const file = files[index];

        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          throw new Error(
            `الملف ${file.name} ليس صورة أو فيديو مدعوماً.`
          );
        }

        if (file.size > MAX_FILE_SIZE) {
          throw new Error(
            `حجم الملف ${file.name} أكبر من 50 ميغابايت.`
          );
        }

        const cleanName = file.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

        const storagePath =
          `${currentUser.id}/${propertyId}/${Date.now()}-${index}-${cleanName}`;

        const { error: uploadError } = await db
          .storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          });

        if (uploadError) {
          throw new Error(
            `فشل رفع ${file.name}: ${uploadError.message}. تأكد من إنشاء bucket باسم ${STORAGE_BUCKET}.`
          );
        }

        const { data: publicData } = db
          .storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(storagePath);

        rows.push({
          property_id: propertyId,
          user_id: currentUser.id,
          media_type: isImage ? "image" : "video",
          file_url: publicData.publicUrl,
          display_order: index
        });
      }

      if (rows.length) {
        const { error } = await db
          .from("property_media")
          .insert(rows);

        if (error) {
          throw new Error(
            "تم رفع الملفات لكن تعذر تسجيلها في قاعدة البيانات: " +
            error.message
          );
        }
      }
    }

    // إضافة إعلان عقاري
    $("propertyForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!currentUser) {
        message(
          "formMessage",
          "يجب تسجيل الدخول أولاً قبل إرسال الإعلان.",
          true
        );

        $("login")?.scrollIntoView({
          behavior: "smooth"
        });

        return;
      }

      const title = $("listingTitle")?.value.trim() || "";

      const purpose =
        purposeMap[$("listingPurpose")?.value] || "";

      const propertyType =
        typeMap[$("listingType")?.value] || "";

      const governorate =
        $("listingCity")?.value || "";

      const priceText =
        $("listingPrice")?.value.trim() || "";

      const contactPhone =
        $("listingPhone")?.value.trim() || "";

      const description =
        $("listingDetails")?.value.trim() || "";

      const files = Array.from(
        $("listingMedia")?.files || []
      );

      if (
        !title ||
        !purpose ||
        !propertyType ||
        !governorate ||
        !contactPhone ||
        !description
      ) {
        message(
          "formMessage",
          "يرجى تعبئة عنوان الإعلان والعملية والنوع والمحافظة ورقم التواصل والتفاصيل.",
          true
        );
        return;
      }

      const price = priceText
        ? Number(priceText.replace(/,/g, ""))
        : null;

      if (
        priceText &&
        (!Number.isFinite(price) || price < 0)
      ) {
        message(
          "formMessage",
          "السعر يجب أن يكون رقماً صحيحاً موجباً.",
          true
        );
        return;
      }

      const submitButton =
        event.submitter ||
        $("propertyForm").querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
      }

      message("formMessage", "جارٍ حفظ الإعلان...");

      let savedPropertyId = null;

      try {
        const { data, error } = await db
          .from("properties")
          .insert({
            user_id: currentUser.id,
            title,
            description,
            purpose,
            property_type: propertyType,
            governorate,
            price,
            contact_phone: contactPhone,
            status: "pending"
          })
          .select("id")
          .single();

        if (error) throw error;

        savedPropertyId = data.id;

        if (files.length) {
          message(
            "formMessage",
            "تم حفظ الإعلان. جارٍ رفع الصور والفيديو..."
          );

          await uploadPropertyFiles(
            files,
            savedPropertyId
          );
        }

        $("propertyForm").reset();

        message(
          "formMessage",
          "تم إرسال إعلانك بنجاح. سيبقى قيد المراجعة ولن يظهر للعامة إلا بعد موافقة الإدارة."
        );

      } catch (error) {
        console.error("submit property:", error);

        const prefix = savedPropertyId
          ? "تم حفظ الإعلان، لكن تعذر إكمال رفع المرفقات: "
          : "تعذر إرسال الإعلان: ";

        message(
          "formMessage",
          prefix + (error.message || "خطأ غير معروف"),
          true
        );

      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });

    // أداة تنظيم محلية فقط وليست ذكاء اصطناعياً متصلاً
    $("aiPrepareButton")?.addEventListener("click", () => {
      const text = $("aiDescription")?.value.trim() || "";

      if (!text) {
        message("aiResult", "اكتب وصف العقار أولاً.");
        return;
      }

      const checklist =
        "المعلومات التي يُفضّل استكمالها: المحافظة والمنطقة، السعر والعملة، المساحة، عدد الغرف والحمامات، الطابق، وحالة العقار.";

      message(
        "aiResult",
        `مسودة وصفك:\n\n${text}\n\n${checklist}\n\nتنبيه: هذه أداة تنظيم نص محلية وليست خدمة ذكاء اصطناعي متصلة حالياً.`
      );
    });

    // السنة والقائمة
    if ($("currentYear")) {
      $("currentYear").textContent =
        new Date().getFullYear();
    }

    $("menuToggle")?.addEventListener("click", () => {
      $("mainNav")?.classList.toggle("open");
    });

    await refreshUser();
    await loadProperties();

    db.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      renderAccount();
    });

    console.info(
      "تم تهيئة ربط سوريا عقارات مع Supabase."
    );
  }

  main().catch((error) => {
    console.error(
      "Syria Real Estate initialization:",
      error
    );

    message(
      "formMessage",
      "تعذر تشغيل ربط المنصة: " + error.message,
      true
    );

    message(
      "accountMessage",
      "تعذر الاتصال بالخدمة: " + error.message,
      true
    );
  });
})();