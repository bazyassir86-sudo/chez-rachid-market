const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ADMIN_EMAILS = ["bazyassir86@gmail.com"];
const ADMIN_EMAIL_SET = new Set(ADMIN_EMAILS);
const FIREBASE_PROJECT_ID = cleanString(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT);
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET
  || crypto.createHash("sha256").update(`${ROOT}:chez-rachid-market-admin-session`).digest("hex");
const SESSION_COOKIE = "crm_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let firebaseCertCache = {
  expiresAt: 0,
  certs: {}
};

const stockValues = new Set(["in_stock", "limited", "out_of_stock"]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, "[]\n");
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendRedirect(res, location) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store"
  });
  res.end();
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader.split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index === -1) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionCookie(admin) {
  const payload = base64UrlEncode(JSON.stringify({
    role: "admin",
    uid: admin.uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  }));
  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionCookie(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqualText(signature, signSessionPayload(payload))) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    if (session.role !== "admin") return null;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return { role: "admin", uid: cleanString(session.uid) };
  } catch {
    return null;
  }
}

function cookieOptions(req, maxAge) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setAdminSession(res, req, admin) {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(createSessionCookie(admin))}; ${cookieOptions(req, SESSION_MAX_AGE_SECONDS).replace(`${SESSION_COOKIE}=; `, "")}`;
  res.setHeader("Set-Cookie", cookie);
}

function clearAdminSession(res, req) {
  res.setHeader("Set-Cookie", cookieOptions(req, 0));
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1].trim() : "";
}

async function getFirebaseCerts() {
  const now = Date.now();
  if (firebaseCertCache.expiresAt > now && Object.keys(firebaseCertCache.certs).length) {
    return firebaseCertCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error("Unable to load Firebase public keys.");
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  firebaseCertCache = {
    expiresAt: now + maxAge * 1000,
    certs: await response.json()
  };
  return firebaseCertCache.certs;
}

async function verifyFirebaseIdToken(idToken) {
  if (!FIREBASE_PROJECT_ID) {
    const error = new Error("Firebase project ID is not configured on the server.");
    error.status = 503;
    throw error;
  }

  const parts = cleanString(idToken).split(".");
  if (parts.length !== 3) {
    const error = new Error("Invalid Firebase token.");
    error.status = 401;
    throw error;
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    const error = new Error("Invalid Firebase token.");
    error.status = 401;
    throw error;
  }

  if (header.alg !== "RS256" || !header.kid) {
    const error = new Error("Invalid Firebase token header.");
    error.status = 401;
    throw error;
  }

  const certs = await getFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) {
    const error = new Error("Firebase token key is not recognized.");
    error.status = 401;
    throw error;
  }

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const validSignature = verifier.verify(cert, base64UrlDecode(parts[2]));
  if (!validSignature) {
    const error = new Error("Firebase token signature is invalid.");
    error.status = 401;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const issuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== issuer) {
    const error = new Error("Firebase token project does not match this site.");
    error.status = 401;
    throw error;
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    const error = new Error("Firebase token subject is invalid.");
    error.status = 401;
    throw error;
  }
  if (payload.exp <= now || payload.iat > now + 60 || payload.auth_time > now + 60) {
    const error = new Error("Firebase token is expired or not valid yet.");
    error.status = 401;
    throw error;
  }

  const email = cleanString(payload.email).toLowerCase();
  if (!email || payload.email_verified !== true || !ADMIN_EMAIL_SET.has(email)) {
    const error = new Error("This Google account is not allowed to manage products.");
    error.status = 403;
    throw error;
  }

  return {
    uid: payload.sub,
    email
  };
}

async function getAuthenticatedAdmin(req) {
  const session = verifySessionCookie(req);
  if (session) return session;

  const bearer = getBearerToken(req);
  if (!bearer) {
    const error = new Error("Admin login required.");
    error.status = 401;
    throw error;
  }
  return verifyFirebaseIdToken(bearer);
}

async function requireAdmin(req, res) {
  try {
    return await getAuthenticatedAdmin(req);
  } catch (error) {
    sendJson(res, error.status || 401, { error: error.message || "Admin login required." });
    return null;
  }
}

function readProducts() {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, `${JSON.stringify(products, null, 2)}\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error("Image or request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request."));
      }
    });
    req.on("error", reject);
  });
}

function cleanString(value) {
  return String(value || "").trim();
}

function createId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "product";
}

function saveImageFromDataUrl(dataUrl, productName, originalName) {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i.exec(cleanString(dataUrl));
  if (!match) {
    throw new Error("Please upload a valid image file.");
  }

  const mime = match[1].toLowerCase();
  const extension = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";

  const safeOriginal = path.parse(cleanString(originalName)).name;
  const fileName = `${Date.now()}-${slugify(safeOriginal || productName)}.${extension}`;
  const targetPath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(targetPath, Buffer.from(match[2], "base64"));
  return `/uploads/${fileName}`;
}

function validateProduct(input, existingProduct) {
  const now = new Date().toISOString();
  const name = cleanString(input.name);
  const description = cleanString(input.description);
  const category = cleanString(input.category);
  const price = Number(input.price);
  const stockStatus = cleanString(input.stockStatus || "in_stock");
  let imageUrl = cleanString(input.imageUrl);

  if (!name) throw new Error("Product name is required.");
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a valid number.");
  if (!description) throw new Error("Description is required.");
  if (!category) throw new Error("Category is required.");
  if (!stockValues.has(stockStatus)) throw new Error("Stock status is required.");

  if (input.imageData) {
    imageUrl = saveImageFromDataUrl(input.imageData, name, input.imageFileName);
  } else if (!imageUrl && existingProduct && existingProduct.imageUrl) {
    imageUrl = existingProduct.imageUrl;
  }

  if (!imageUrl) throw new Error("Product image URL or upload is required.");

  return {
    id: existingProduct ? existingProduct.id : createId(),
    name,
    price,
    description,
    category,
    imageUrl,
    stockStatus,
    bestSeller: Boolean(input.bestSeller),
    createdAt: existingProduct ? existingProduct.createdAt : now,
    updatedAt: now
  };
}

async function handleAdminApi(req, res, url) {
  if (url.pathname === "/api/admin/session" && req.method === "GET") {
    try {
      const admin = await getAuthenticatedAdmin(req);
      setAdminSession(res, req, admin);
      sendJson(res, 200, {
        ok: true,
        admin: {
          role: "admin"
        }
      });
    } catch (error) {
      sendJson(res, error.status || 401, { error: error.message || "Admin login required." });
    }
    return;
  }

  if (url.pathname === "/api/admin/logout" && req.method === "POST") {
    clearAdminSession(res, req);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];

  try {
    if (req.method === "GET" && parts.length === 2) {
      sendJson(res, 200, readProducts());
      return;
    }

    if (req.method === "GET" && parts.length === 3) {
      const product = readProducts().find((item) => item.id === id);
      if (!product) {
        sendJson(res, 404, { error: "Product not found." });
        return;
      }
      sendJson(res, 200, product);
      return;
    }

    if (req.method === "POST" && parts.length === 2) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const payload = await readBody(req);
      const products = readProducts();
      const product = validateProduct(payload);
      products.unshift(product);
      writeProducts(products);
      sendJson(res, 201, product);
      return;
    }

    if (req.method === "PUT" && parts.length === 3) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const payload = await readBody(req);
      const products = readProducts();
      const index = products.findIndex((item) => item.id === id);
      if (index === -1) {
        sendJson(res, 404, { error: "Product not found." });
        return;
      }
      const product = validateProduct(payload, products[index]);
      products[index] = product;
      writeProducts(products);
      sendJson(res, 200, product);
      return;
    }

    if (req.method === "DELETE" && parts.length === 3) {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const products = readProducts();
      const nextProducts = products.filter((item) => item.id !== id);
      if (nextProducts.length === products.length) {
        sendJson(res, 404, { error: "Product not found." });
        return;
      }
      writeProducts(nextProducts);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Request failed." });
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (!path.extname(pathname)) pathname = `${pathname}.html`;

  if (pathname === "/admin.html" && !verifySessionCookie(req)) {
    sendRedirect(res, "/admin-login.html?redirect=/admin.html");
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  const relativePath = path.relative(PUBLIC_DIR, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(contents);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/admin/session" || url.pathname === "/api/admin/logout") {
    handleAdminApi(req, res, url);
    return;
  }
  if (url.pathname === "/api/products" || url.pathname.startsWith("/api/products/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Chez Rachid Market is running at http://localhost:${PORT}`);
});
