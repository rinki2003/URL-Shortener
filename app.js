import { readFile, writeFile } from "fs/promises";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const PORT = 4000;

// Get current folder path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data file
const DATA_FILE = path.join(__dirname, "data", "links.json");

// Save links to file
const saveLinks = async (links) => {
  await writeFile(DATA_FILE, JSON.stringify(links, null, 2));
};

// Load links from file (auto-heals missing/corrupted JSON)
const loadLinks = async () => {
  try {
    const data = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      await saveLinks({});
      return {};
    }
    throw error;
  }
};

// Serve static files
const serveFile = async (res, filePath, contentType) => {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 page not found");
  }
};

// Create HTTP server
const server = createServer(async (req, res) => {
  if (req.method === "GET") {
    if (req.url === "/") {
      return serveFile(res, path.join(__dirname, "index.html"), "text/html");
    } else if (req.url === "/style.css") {
      return serveFile(res, path.join(__dirname, "style.css"), "text/css");
    } else if (req.url === "/favicon.ico") {
      return serveFile(res, path.join(__dirname, "favicon.ico"), "image/x-icon");
    } else if (req.url === "/links") {
      const links = await loadLinks();
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(links));
    } else {
      // Redirect if shortCode exists
      const links = await loadLinks();
      const code = req.url.slice(1); // remove leading "/"
      if (links[code]) {
        res.writeHead(302, { Location: links[code] });
        return res.end();
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("404 Not Found");
      }
    }

  } else if (req.method === "POST" && req.url === "/shorten") {
    const links = await loadLinks();
    let body = "";

    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { url, shortCode } = JSON.parse(body);

        if (!url) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          return res.end("URL is required");
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          return res.end("Invalid URL format");
        }

        const finalShortCode =
          shortCode?.trim() || crypto.randomBytes(4).toString("hex");

        if (links[finalShortCode]) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          return res.end("Short code already exists");
        }

        links[finalShortCode] = url;
        await saveLinks(links);

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ success: true, shortCode: finalShortCode })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("Invalid JSON");
      }
    });

  } else if (req.method === "DELETE" && req.url.startsWith("/delete/")) {
    const links = await loadLinks();
    const code = req.url.split("/delete/")[1];

    if (!links[code]) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Short code not found");
    }

    delete links[code];
    await saveLinks(links);

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true }));

  } else {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
