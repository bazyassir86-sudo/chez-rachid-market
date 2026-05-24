(function () {
  const WHATSAPP_NUMBER = "212672426433";
  const LOCAL_KEY = "chez_rachid_market_products";

  const stockLabels = {
    in_stock: "En stock",
    limited: "Stock limité",
    out_of_stock: "Rupture"
  };

  const baseCategories = [
    "Couvertures",
    "Literie",
    "Housses et couvre-lits",
    "Textiles marocains",
    "Oreillers",
    "Autre"
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function placeholderImage(label) {
    const safeLabel = escapeHtml(label || "Image produit");
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 800">
        <defs>
          <pattern id="woven" width="56" height="56" patternUnits="userSpaceOnUse">
            <rect width="56" height="56" fill="#fbf8f2"/>
            <path d="M0 16h56M0 40h56M16 0v56M40 0v56" stroke="#d6c5af" stroke-width="8" opacity=".7"/>
            <path d="M0 28h56M28 0v56" stroke="#8c4a34" stroke-width="4" opacity=".24"/>
          </pattern>
        </defs>
        <rect width="640" height="800" fill="url(#woven)"/>
        <rect x="74" y="92" width="492" height="616" rx="8" fill="rgba(255,255,255,.68)" stroke="#e8e0d6"/>
        <text x="320" y="384" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#15120f">${safeLabel}</text>
        <text x="320" y="432" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#746b61">Chez Rachid Market</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function formatPrice(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
  }

  function normalizeProduct(input) {
    return {
      id: input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: String(input.name || "").trim(),
      price: Number(input.price || 0),
      description: String(input.description || "").trim(),
      category: String(input.category || "").trim(),
      imageUrl: String(input.imageUrl || input.imageData || "").trim(),
      stockStatus: input.stockStatus || "in_stock",
      bestSeller: Boolean(input.bestSeller),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function readLocalProducts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeLocalProducts(products) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(products));
  }

  async function requestJson(path, options = {}) {
    if (!window.location.protocol.startsWith("http")) {
      const fallbackError = new Error("Local file mode");
      fallbackError.fallback = true;
      throw fallbackError;
    }

    try {
      const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
      };
      const response = await fetch(path, {
        ...options,
        headers
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || "Request failed.");
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (!error.status) error.fallback = true;
      throw error;
    }
  }

  async function adminRequestHeaders() {
    if (!window.AdminAuth || typeof window.AdminAuth.getIdToken !== "function") {
      return {};
    }
    const token = await window.AdminAuth.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const ProductStore = {
    categories: baseCategories,
    stockLabels,
    placeholderImage,
    escapeHtml,
    formatPrice,
    whatsappUrl(product, extraMessage) {
      const lines = [
        "Bonjour Chez Rachid Market,",
        product ? `Je souhaite commander ou demander des informations sur: ${product.name}` : "Je souhaite passer une commande.",
        product ? `Prix: ${formatPrice(product.price)}` : "",
        extraMessage || "",
        "",
        "Merci."
      ].filter(Boolean);
      return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
    },
    async list() {
      try {
        return await requestJson("/api/products");
      } catch (error) {
        if (!error.fallback) throw error;
        return readLocalProducts();
      }
    },
    async get(id) {
      try {
        return await requestJson(`/api/products/${encodeURIComponent(id)}`);
      } catch (error) {
        if (!error.fallback) throw error;
        return readLocalProducts().find((product) => product.id === id) || null;
      }
    },
    async save(payload, id) {
      try {
        return await requestJson(id ? `/api/products/${encodeURIComponent(id)}` : "/api/products", {
          method: id ? "PUT" : "POST",
          headers: await adminRequestHeaders(),
          body: JSON.stringify(payload)
        });
      } catch (error) {
        if (error.fallback) {
          throw new Error("Admin authentication requires the local server. Start the site with npm start.");
        }
        throw error;
      }
    },
    async remove(id) {
      try {
        return await requestJson(`/api/products/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: await adminRequestHeaders()
        });
      } catch (error) {
        if (error.fallback) {
          throw new Error("Admin authentication requires the local server. Start the site with npm start.");
        }
        throw error;
      }
    }
  };

  window.ProductStore = ProductStore;

  function setActiveNav() {
    const page = document.body.dataset.page;
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.nav === page);
    });
  }

  function initMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const nextState = !document.body.classList.contains("menu-open");
      document.body.classList.toggle("menu-open", nextState);
      toggle.setAttribute("aria-expanded", String(nextState));
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        document.body.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function initFloatingWhatsapp() {
    if (document.querySelector(".floating-whatsapp")) return;
    const link = document.createElement("a");
    link.className = "floating-whatsapp";
    link.href = ProductStore.whatsappUrl(null);
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", "Commander sur WhatsApp");
    link.innerHTML = `
      <span class="floating-whatsapp-icon">WA</span>
      <span>WhatsApp</span>`;
    document.body.appendChild(link);
  }

  function initRevealAnimations() {
    const targets = document.querySelectorAll(".section, .feature-band, .promo-banner, .page-hero, .product-card, .review-card, .why-card");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });

    targets.forEach((target) => {
      target.classList.add("reveal");
      observer.observe(target);
    });
  }

  function initSliders() {
    document.querySelectorAll("[data-slider]").forEach((slider) => {
      const track = slider.querySelector("[data-slider-track]");
      const previous = slider.querySelector("[data-slider-prev]");
      const next = slider.querySelector("[data-slider-next]");
      if (!track || !previous || !next) return;

      const scroll = (direction) => {
        track.scrollBy({
          left: direction * Math.min(track.clientWidth * 0.88, 420),
          behavior: "smooth"
        });
      };

      previous.addEventListener("click", () => scroll(-1));
      next.addEventListener("click", () => scroll(1));
    });
  }

  function initHiddenAdminAccess() {
    let sequence = "";
    let brandClicks = 0;
    let clickTimer = 0;

    document.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      sequence = `${sequence}${event.key.toLowerCase()}`.slice(-5);
      if (sequence === "admin") {
        window.location.href = "/admin-login.html";
      }
    });

    const mark = document.querySelector(".brand-mark");
    if (!mark) return;
    mark.addEventListener("click", () => {
      window.clearTimeout(clickTimer);
      brandClicks += 1;
      if (brandClicks >= 5) {
        window.location.href = "/admin-login.html";
        return;
      }
      clickTimer = window.setTimeout(() => {
        brandClicks = 0;
      }, 1200);
    });
  }

  function attachImageFallbacks(scope) {
    scope.querySelectorAll("img[data-fallback]").forEach((image) => {
      image.addEventListener("error", () => {
        image.src = placeholderImage("Image produit");
      }, { once: true });
    });
  }

  function productCard(product) {
    const statusClass = product.stockStatus === "out_of_stock"
      ? "out_of_stock"
      : product.stockStatus === "limited"
        ? "limited"
        : "in_stock";
    const image = product.imageUrl || placeholderImage(product.category);
    const detailsUrl = `/product.html?id=${encodeURIComponent(product.id)}`;
    return `
      <article class="product-card">
        <a class="product-media" href="${detailsUrl}" aria-label="Voir ${escapeHtml(product.name)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-fallback>
          ${product.bestSeller ? `<span class="best-pill">Selection</span>` : ""}
          <span class="stock-pill ${statusClass}">${escapeHtml(stockLabels[product.stockStatus] || stockLabels.in_stock)}</span>
        </a>
        <div class="product-body">
          <p class="product-category" dir="auto">${escapeHtml(product.category)}</p>
          <h3 dir="auto"><a href="${detailsUrl}">${escapeHtml(product.name)}</a></h3>
          <p class="product-description" dir="auto">${escapeHtml(product.description)}</p>
          <div class="product-foot">
            <span class="price">${formatPrice(product.price)}</span>
            <div class="product-actions">
              <a class="button button-soft button-small" href="${detailsUrl}">Détails</a>
              <a class="button button-dark button-small" href="${ProductStore.whatsappUrl(product)}" target="_blank" rel="noopener">WhatsApp</a>
            </div>
          </div>
        </div>
      </article>`;
  }

  function emptyProductsMarkup(context) {
    const emptyMessage = context === "best"
      ? "Les selections du proprietaire apparaitront ici."
      : "Les prochains articles ajoutes par la boutique apparaitront ici.";
    return `
      <div class="empty-state">
        <h3>Aucun produit affiche pour le moment</h3>
        <p>${emptyMessage} Le site public les affichera automatiquement.</p>
        <a class="button button-dark" href="/contact.html">Contacter la boutique</a>
      </div>`;
  }

  function loadingCards(count) {
    return Array.from({ length: count }, () => `
      <article class="product-card product-skeleton" aria-hidden="true">
        <div class="product-media"></div>
        <div class="product-body">
          <span></span>
          <strong></strong>
          <p></p>
          <div class="product-foot">
            <em></em>
            <i></i>
          </div>
        </div>
      </article>`).join("");
  }

  async function renderHome() {
    const grid = document.querySelector("[data-home-best]");
    const featuredGrid = document.querySelector("[data-home-featured]");
    const categoryCounts = document.querySelectorAll("[data-category-count]");
    if (!grid && !categoryCounts.length) return;

    if (grid) grid.innerHTML = loadingCards(4);
    if (featuredGrid) featuredGrid.innerHTML = loadingCards(4);

    const products = await ProductStore.list();
    categoryCounts.forEach((node) => {
      const category = node.dataset.categoryCount;
      const count = products.filter((product) => product.category === category).length;
      node.textContent = `${count} produit${count === 1 ? "" : "s"}`;
    });

    if (grid) {
      const best = products.filter((product) => product.bestSeller).slice(0, 4);
      grid.innerHTML = best.length ? best.map(productCard).join("") : emptyProductsMarkup("best");
      attachImageFallbacks(grid);
    }

    if (featuredGrid) {
      const featured = products.slice(0, 8);
      featuredGrid.innerHTML = featured.length ? featured.map(productCard).join("") : emptyProductsMarkup("catalog");
      attachImageFallbacks(featuredGrid);
    }
  }

  function applyQueryToFilters() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    if (category) {
      const filter = document.querySelector("#categoryFilter");
      if (filter) filter.value = category;
    }
  }

  async function renderProductsPage() {
    const grid = document.querySelector("[data-products-grid]");
    if (!grid) return;
    grid.innerHTML = loadingCards(8);

    const searchInput = document.querySelector("#productSearch");
    const categoryFilter = document.querySelector("#categoryFilter");
    const stockFilter = document.querySelector("#stockFilter");
    const sortSelect = document.querySelector("#sortProducts");
    const countNode = document.querySelector("[data-product-count]");
    const products = await ProductStore.list();

    const categories = [...new Set([...baseCategories, ...products.map((item) => item.category).filter(Boolean)])];
    categoryFilter.innerHTML = `<option value="">Toutes les catégories</option>${categories.map((category) => (
      `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
    )).join("")}`;
    applyQueryToFilters();

    function render() {
      const query = (searchInput.value || "").trim().toLowerCase();
      const category = categoryFilter.value;
      const stock = stockFilter.value;
      const sort = sortSelect.value;
      let visible = products.filter((product) => {
        const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
        return (!query || haystack.includes(query))
          && (!category || product.category === category)
          && (!stock || product.stockStatus === stock);
      });

      visible = visible.slice().sort((a, b) => {
        if (sort === "price_asc") return Number(a.price) - Number(b.price);
        if (sort === "price_desc") return Number(b.price) - Number(a.price);
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });

      countNode.textContent = `${visible.length} produit${visible.length === 1 ? "" : "s"}`;
      grid.innerHTML = visible.length ? visible.map(productCard).join("") : emptyProductsMarkup("catalog");
      attachImageFallbacks(grid);
    }

    [searchInput, categoryFilter, stockFilter, sortSelect].forEach((control) => {
      control.addEventListener("input", render);
      control.addEventListener("change", render);
    });
    render();
  }

  async function renderProductDetails() {
    const mount = document.querySelector("[data-product-details]");
    if (!mount) return;

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      mount.innerHTML = emptyProductsMarkup("catalog");
      return;
    }

    const product = await ProductStore.get(id);
    if (!product) {
      mount.innerHTML = `
        <div class="empty-state">
          <h3>Produit introuvable</h3>
          <p>Ce produit a peut-être été supprimé depuis le dashboard.</p>
          <a class="button button-dark" href="/products.html">Retour aux produits</a>
        </div>`;
      return;
    }

    document.title = `${product.name} | Chez Rachid Market`;
    const image = product.imageUrl || placeholderImage(product.category);
    mount.innerHTML = `
      <div class="details-layout">
        <div class="details-image">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" data-fallback>
        </div>
        <article class="details-panel">
          <p class="product-category" dir="auto">${escapeHtml(product.category)}</p>
          <h2 dir="auto">${escapeHtml(product.name)}</h2>
          <p class="details-description" dir="auto">${escapeHtml(product.description)}</p>
          <div class="meta-grid">
            <div class="meta-item">
              <span>Prix</span>
              <strong>${formatPrice(product.price)}</strong>
            </div>
            <div class="meta-item">
              <span>Stock</span>
              <strong>${escapeHtml(stockLabels[product.stockStatus] || stockLabels.in_stock)}</strong>
            </div>
            <div class="meta-item">
              <span>Ville</span>
              <strong>Essaouira</strong>
            </div>
          </div>
          <div class="button-row">
            <a class="button button-dark" href="${ProductStore.whatsappUrl(product)}" target="_blank" rel="noopener">Commander sur WhatsApp</a>
            <a class="button button-outline" href="/products.html">Voir le catalogue</a>
          </div>
        </article>
      </div>`;
    attachImageFallbacks(mount);
  }

  function initContactForm() {
    const form = document.querySelector("[data-order-form]");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const lines = [
        "Bonjour Chez Rachid Market,",
        "Je souhaite passer une commande ou demander un prix.",
        `Nom: ${data.get("name") || "-"}`,
        `Téléphone: ${data.get("phone") || "-"}`,
        `Article demandé: ${data.get("item") || "-"}`,
        `Message: ${data.get("message") || "-"}`
      ];
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setActiveNav();
    initMenu();
    initFloatingWhatsapp();
    initSliders();
    initHiddenAdminAccess();
    renderHome().catch(console.error);
    renderProductsPage().catch(console.error);
    renderProductDetails().catch(console.error);
    initContactForm();
    initRevealAnimations();
    window.setTimeout(() => document.body.classList.add("page-ready"), 80);
  });
})();
