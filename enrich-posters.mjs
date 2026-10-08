import fs from "node:fs/promises";

const DATA_PATH = "./data/letterboxd-export.json";
const CONCURRENCY = 3;
const SAVE_EVERY = 25;
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeHTML(text = "") {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getLargestFromSrcset(srcset = "") {
  const entries = srcset
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);

  if (!entries.length) return "";

  const parsed = entries.map(entry => {
    const parts = entry.split(/\s+/);

    return {
      url: parts[0],
      size: parseInt(parts[1]) || 0
    };
  });

  parsed.sort((a, b) => b.size - a.size);

  return parsed[0]?.url || "";
}

function getPosterFromHTML(html = "") {
  const decoded = decodeHTML(html);

  const srcsetMatches = [
    ...decoded.matchAll(/srcset=["']([^"']+)["']/gi)
  ];

  for (const match of srcsetMatches) {
    const candidate = getLargestFromSrcset(match[1]);

    if (
      candidate &&
      !candidate.includes("empty-poster") &&
      !candidate.includes("logo") &&
      !candidate.includes("avatar")
    ) {
      return candidate;
    }
  }

  const ogPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  ];

  for (const pattern of ogPatterns) {
    const match = decoded.match(pattern);

    if (
      match &&
      match[1] &&
      !match[1].includes("empty-poster") &&
      !match[1].includes("logo")
    ) {
      return match[1];
    }
  }

  const imgMatches = [
    ...decoded.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)
  ];

  for (const match of imgMatches) {
    const candidate = match[1];

    if (
      candidate &&
      !candidate.includes("empty-poster") &&
      !candidate.includes("logo") &&
      !candidate.includes("avatar")
    ) {
      return candidate;
    }
  }

  return "";
}

async function isImageWorking(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    if (!response.ok) {
      return false;
    }

    const type =
      response.headers.get("content-type") || "";

    return type.startsWith("image/");
  } catch {
    return false;
  }
}

async function fetchHTML(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LetterboxdFrame/1.0",
      Accept:
        "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return {
    html: await response.text(),
    finalUrl: response.url
  };
}

async function findPoster(movie) {
  const pagesToTry = [];

  if (movie.filmUrl) {
    pagesToTry.push(movie.filmUrl);
  }

  for (const url of pagesToTry) {
    try {
      const { html, finalUrl } =
        await fetchHTML(url);

      let poster =
        getPosterFromHTML(html);

      if (poster && await isImageWorking(poster)) {
        return poster;
      }

      const posterPage =
        `${finalUrl.replace(/\/+$/, "")}/poster/`;

      try {
        const posterPageResult =
          await fetchHTML(posterPage);

        poster =
          getPosterFromHTML(
            posterPageResult.html
          );

        if (
          poster &&
          await isImageWorking(poster)
        ) {
          return poster;
        }
      } catch {}
    } catch {}
  }

  return "";
}

async function saveData(data) {
  await fs.writeFile(
    DATA_PATH,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function main() {
  const raw =
    await fs.readFile(DATA_PATH, "utf8");

  const data =
    JSON.parse(raw);

  console.log(
    `Checking ${data.movies.length} movies...`
  );

  let processed = 0;
  let fixed = 0;
  let kept = 0;
  let missing = 0;

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= data.movies.length) {
        return;
      }

      const movie =
        data.movies[index];

      let currentWorks = false;

      if (movie.poster) {
        currentWorks =
          await isImageWorking(movie.poster);
      }

      if (currentWorks) {
        kept++;

        console.log(
          `[${index + 1}/${data.movies.length}] KEEP ${movie.name}`
        );
      } else {
        if (movie.poster) {
          console.log(
            `[${index + 1}/${data.movies.length}] BAD  ${movie.name} - retrying`
          );
        } else {
          console.log(
            `[${index + 1}/${data.movies.length}] MISS ${movie.name} - retrying`
          );
        }

        const poster =
          await findPoster(movie);

        if (poster) {
          movie.poster = poster;
          fixed++;

          console.log(
            `[${index + 1}/${data.movies.length}] FIX  ${movie.name}`
          );
        } else {
          missing++;

          console.log(
            `[${index + 1}/${data.movies.length}] NONE ${movie.name}`
          );
        }
      }

      processed++;

      if (
        processed % SAVE_EVERY === 0
      ) {
        await saveData(data);

        console.log(
          `Saved progress: ${processed}/${data.movies.length}`
        );
      }

      await sleep(DELAY_MS);
    }
  }

  await Promise.all(
    Array.from(
      { length: CONCURRENCY },
      () => worker()
    )
  );

  await saveData(data);

  const totalWithPosters =
    data.movies.filter(
      movie => movie.poster
    ).length;

  console.log("");
  console.log("DONE");
  console.log(
    `Kept: ${kept}`
  );
  console.log(
    `Fixed: ${fixed}`
  );
  console.log(
    `Still missing: ${missing}`
  );
  console.log(
    `${totalWithPosters}/${data.movies.length} movies have a saved poster URL.`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});