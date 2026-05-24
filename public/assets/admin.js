(function () {
  const store = window.ProductStore;
  let products = [];
  let editingId = null;
  let selectedImageData = "";
  let selectedImageName = "";

  const form = document.querySelector("[data-product-form]");
  const tableBody = document.querySelector("[data-admin-products]");
  const statusNode = document.querySelector("[data-admin-status]");
  const preview = document.querySelector("[data-image-preview]");
  const submitButton = document.querySelector("[data-submit-product]");
  const cancelButton = document.querySelector("[data-cancel-edit]");
  const categorySelect = document.querySelector("#category");
  const customCategory = document.querySelector("#customCategory");
  const imageUrlInput = document.querySelector("#imageUrl");
  const imageUploadInput = document.querySelector("#imageUpload");
  const logoutButton = document.querySelector("[data-admin-logout]");
  const adminUserNode = document.querySelector("[data-admin-user]");

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message || "";
    statusNode.classList.toggle("error", Boolean(isError));
  }

  function renderPreview(src) {
    if (!preview) return;
    if (!src) {
      preview.innerHTML = `<div class="preview-empty">Aperçu de l'image du produit</div>`;
      return;
    }
    preview.innerHTML = `<img src="${store.escapeHtml(src)}" alt="Aperçu produit" data-fallback>`;
  }

  function imageToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Impossible de lire l'image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Image invalide."));
        image.onload = () => {
          const maxSize = 1400;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function getCategoryValue() {
    return (customCategory.value || categorySelect.value || "").trim();
  }

  function productFromForm() {
    const data = new FormData(form);
    const existingImage = imageUrlInput.dataset.currentImage || "";
    return {
      name: data.get("name"),
      price: data.get("price"),
      description: data.get("description"),
      category: getCategoryValue(),
      imageUrl: selectedImageData ? "" : (data.get("imageUrl") || existingImage),
      imageData: selectedImageData,
      imageFileName: selectedImageName,
      stockStatus: data.get("stockStatus"),
      bestSeller: data.get("bestSeller") === "on"
    };
  }

  function validatePayload(payload) {
    if (!payload.name.trim()) return "Le nom du produit est obligatoire.";
    if (!payload.price || Number(payload.price) < 0) return "Le prix en MAD est obligatoire.";
    if (!payload.description.trim()) return "La description est obligatoire.";
    if (!payload.category.trim()) return "La catégorie est obligatoire.";
    if (!payload.imageUrl.trim() && !payload.imageData) return "Ajoutez une URL d'image ou téléversez une image.";
    if (!payload.stockStatus) return "Le statut du stock est obligatoire.";
    return "";
  }

  function resetForm() {
    editingId = null;
    selectedImageData = "";
    selectedImageName = "";
    form.reset();
    imageUrlInput.dataset.currentImage = "";
    customCategory.value = "";
    submitButton.textContent = "Ajouter le produit";
    cancelButton.classList.add("is-hidden");
    renderPreview("");
    setStatus("");
  }

  function renderStats() {
    const total = products.length;
    const inStock = products.filter((item) => item.stockStatus !== "out_of_stock").length;
    const best = products.filter((item) => item.bestSeller).length;
    const nodes = {
      total: document.querySelector("[data-stat-total]"),
      stock: document.querySelector("[data-stat-stock]"),
      best: document.querySelector("[data-stat-best]")
    };
    if (nodes.total) nodes.total.textContent = total;
    if (nodes.stock) nodes.stock.textContent = inStock;
    if (nodes.best) nodes.best.textContent = best;
  }

  function renderTable() {
    renderStats();
    if (!tableBody) return;
    if (!products.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6">Aucun produit pour le moment. Ajoutez le premier produit depuis le formulaire.</td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = products.map((product) => `
      <tr>
        <td>
          <div class="table-product">
            <img src="${store.escapeHtml(product.imageUrl || store.placeholderImage(product.category))}" alt="${store.escapeHtml(product.name)}">
            <strong dir="auto">${store.escapeHtml(product.name)}</strong>
          </div>
        </td>
        <td dir="auto">${store.escapeHtml(product.category)}</td>
        <td>${store.formatPrice(product.price)}</td>
        <td>${store.escapeHtml(store.stockLabels[product.stockStatus] || store.stockLabels.in_stock)}</td>
        <td>${product.bestSeller ? "Oui" : "Non"}</td>
        <td>
          <div class="table-actions">
            <button class="button button-soft button-small" type="button" data-edit="${store.escapeHtml(product.id)}">Modifier</button>
            <button class="button button-danger button-small" type="button" data-delete="${store.escapeHtml(product.id)}">Supprimer</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function editProduct(id) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    editingId = id;
    form.name.value = product.name;
    form.price.value = product.price;
    form.description.value = product.description;
    form.stockStatus.value = product.stockStatus;
    form.bestSeller.checked = Boolean(product.bestSeller);
    selectedImageData = "";
    selectedImageName = "";
    imageUploadInput.value = "";
    imageUrlInput.value = product.imageUrl || "";
    imageUrlInput.dataset.currentImage = product.imageUrl || "";
    if (store.categories.includes(product.category)) {
      categorySelect.value = product.category;
      customCategory.value = "";
    } else {
      categorySelect.value = "Autre";
      customCategory.value = product.category;
    }
    renderPreview(product.imageUrl);
    submitButton.textContent = "Enregistrer";
    cancelButton.classList.remove("is-hidden");
    setStatus(`Modification de: ${product.name}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshProducts() {
    products = await store.list();
    renderTable();
  }

  function waitForAdminAuth() {
    if (window.AdminAuth) return Promise.resolve(window.AdminAuth);
    return new Promise((resolve) => {
      window.addEventListener("admin-auth-object-ready", () => resolve(window.AdminAuth), { once: true });
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("Enregistrement en cours...");
    const payload = productFromForm();
    const validation = validatePayload(payload);
    if (validation) {
      setStatus(validation, true);
      return;
    }

    try {
      await store.save(payload, editingId);
      await refreshProducts();
      resetForm();
      setStatus("Produit enregistré avec succès.");
    } catch (error) {
      setStatus(error.message || "Impossible d'enregistrer le produit.", true);
    }
  }

  async function handleTableClick(event) {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) {
      editProduct(editButton.dataset.edit);
      return;
    }
    if (deleteButton) {
      const product = products.find((item) => item.id === deleteButton.dataset.delete);
      const confirmed = window.confirm(`Supprimer "${product ? product.name : "ce produit"}" ?`);
      if (!confirmed) return;
      try {
        await store.remove(deleteButton.dataset.delete);
        await refreshProducts();
        if (editingId === deleteButton.dataset.delete) resetForm();
        setStatus("Produit supprimé.");
      } catch (error) {
        setStatus(error.message || "Impossible de supprimer le produit.", true);
      }
    }
  }

  function bindEvents() {
    if (!form) return;
    form.addEventListener("submit", handleSubmit);
    cancelButton.addEventListener("click", resetForm);
    tableBody.addEventListener("click", handleTableClick);
    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        setStatus("Signing out...");
        if (window.AdminAuth) {
          await window.AdminAuth.signOutAdmin();
        } else {
          window.location.href = "/admin-login.html";
        }
      });
    }

    imageUrlInput.addEventListener("input", () => {
      if (!selectedImageData) renderPreview(imageUrlInput.value.trim());
    });

    imageUploadInput.addEventListener("change", async () => {
      const file = imageUploadInput.files && imageUploadInput.files[0];
      if (!file) return;
      setStatus("Préparation de l'image...");
      try {
        selectedImageData = await imageToDataUrl(file);
        selectedImageName = file.name;
        renderPreview(selectedImageData);
        setStatus("");
      } catch (error) {
        selectedImageData = "";
        selectedImageName = "";
        setStatus(error.message || "Image invalide.", true);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const auth = await waitForAdminAuth();
    const admin = await auth.requireAdmin();
    if (!admin) return;

    if (adminUserNode) {
      adminUserNode.textContent = "Secure admin session active";
    }

    bindEvents();
    renderPreview("");
    refreshProducts().catch((error) => setStatus(error.message || "Impossible de charger les produits.", true));
  });
})();
