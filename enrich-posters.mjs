import fs from "node:fs/promises";

const DATA_PATH = "./data/letterboxd-export.json";
const CONCURRENCY = 5;
const DELAY_MS = 250;

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

function getPosterFromHTML(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<img[^>]+class=["'][^"']*image[^"']*["'][^>]+srcset=["']([^"']+)["']/i,
    /srcset=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (!match) continue;

    let value = decodeHTML(match[1]);

    if (value.includes(",")) {
      value = value.split(",")[0];
    }

    if (value.includes(" ")) {
      value = value.trim().split(/\s+/)[0];
    }

    if (
      value &&
      !value.includes("empty-poster") &&
      !value.includes("logo")
    ) {
      return value;
    }
  }

  return "";
}

async function resolveFilmURL(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LetterboxdFrame/1.0"
    }
  });

  return {
    url: response.url,
    html: await response.text()
  };
}

async function fetchPoster(movie, index, total) {
  if (movie.poster) {
    console.log(
      `[${index + 1}/${total}] SKIP ${movie.name}`
    );

    return movie;
  }

  try {
    const { url, html } = await resolveFilmURL(movie.filmUrl);

    let poster = getPosterFromHTML(html);

    if (!poster) {
      const posterURL =
        url.replace(/\/?$/, "/poster/");

      const posterResponse = await fetch(posterURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LetterboxdFrame/1.0"
        }
      });

      const posterHTML =
        await posterResponse.text();

      poster = getPosterFromHTML(posterHTML);
    }

    if (poster) {
      console.log(
        `[${index + 1}/${total}] OK   ${movie.name}`
      );

      return {
        ...movie,
        poster
      };
    }

    console.log(
      `[${index + 1}/${total}] NONE ${movie.name}`
    );

    return movie;
  } catch (error) {
    console.log(
      `[${index + 1}/${total}] FAIL ${movie.name}: ${error.message}`
    );

    return movie;
  } finally {
    await sleep(DELAY_MS);
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] =
        await worker(
          items[index],
          index,
          items.length
        );
    }
  }

  await Promise.all(
    Array.from(
      { length: concurrency },
      () => runWorker()
    )
  );

  return results;
}

async function main() {
  const raw =
    await fs.readFile(
      DATA_PATH,
      "utf8"
    );

  const data =
    JSON.parse(raw);

  console.log(
    `Loading posters for ${data.movies.length} movies...`
  );

  data.movies =
    await runPool(
      data.movies,
      fetchPoster,
      CONCURRENCY
    );

  const posterMap =
    new Map();

  for (const movie of data.movies) {
    if (movie.poster) {
      posterMap.set(
        `${movie.name.toLowerCase()}||${movie.year}`,
        movie.poster
      );
    }
  }

  function addPostersToList(list) {
    if (!list?.items) return;

    for (const item of list.items) {
      const key =
        `${item.name.toLowerCase()}||${item.year}`;

      const poster =
        posterMap.get(key);

      if (poster) {
        item.poster = poster;
      }
    }
  }

  for (const list of Object.values(
    data.yearLists || {}
  )) {
    addPostersToList(list);
  }

  if (data.top100) {
    addPostersToList(
      data.top100
    );
  }

  for (const list of data.lists || []) {
    addPostersToList(list);
  }

  await fs.writeFile(
    DATA_PATH,
    JSON.stringify(
      data,
      null,
      2
    )
  );

  const totalPosters =
    data.movies.filter(
      movie => movie.poster
    ).length;

  console.log("");
  console.log("DONE");
  console.log(
    `${totalPosters}/${data.movies.length} movies now have posters.`
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});