import fs from "node:fs/promises";

const DATA_PATH =
  "./data/letterboxd-export.json";

const TMDB_API_KEY =
  process.env.TMDB_API_KEY;

const CONCURRENCY = 4;
const DELAY_MS = 250;
const SAVE_EVERY = 25;

if (!TMDB_API_KEY) {
  console.error(
    "Missing TMDB_API_KEY"
  );

  console.error(
    "Run with: set TMDB_API_KEY=your_key_here"
  );

  process.exit(1);
}


function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


async function saveData(data) {
  await fs.writeFile(
    DATA_PATH,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );
}


function normalizeTitle(
  value = ""
) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(
      /['’]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}


async function tmdbFetch(url) {
  const separator =
    url.includes("?")
      ? "&"
      : "?";

  const finalUrl =
    `${url}${separator}api_key=${encodeURIComponent(
      TMDB_API_KEY
    )}`;

  const response =
    await fetch(finalUrl, {
      headers: {
        accept:
          "application/json"
      }
    });

  if (!response.ok) {
    throw new Error(
      `TMDb HTTP ${response.status}`
    );
  }

  return response.json();
}


async function searchMovie(
  title,
  year
) {
  const params =
    new URLSearchParams({
      query:
        title,
      include_adult:
        "false",
      language:
        "en-US"
    });

  if (year) {
    params.set(
      "year",
      String(year)
    );
  }

  const url =
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`;

  const data =
    await tmdbFetch(url);

  return (
    data.results ||
    []
  );
}


function chooseBestMatch(
  results,
  title,
  year
) {
  if (!results.length) {
    return null;
  }

  const normalizedTarget =
    normalizeTitle(title);

  const targetYear =
    Number(year);

  let best =
    null;

  let bestScore =
    -Infinity;

  for (
    const result
    of results
  ) {
    const resultTitle =
      normalizeTitle(
        result.title ||
        result.original_title ||
        ""
      );

    const releaseYear =
      result.release_date
        ? Number(
            result.release_date
              .slice(
                0,
                4
              )
          )
        : null;

    let score = 0;

    if (
      resultTitle ===
      normalizedTarget
    ) {
      score += 100;
    }

    if (
      targetYear &&
      releaseYear ===
      targetYear
    ) {
      score += 50;
    }

    if (
      targetYear &&
      releaseYear &&
      Math.abs(
        releaseYear -
        targetYear
      ) === 1
    ) {
      score += 10;
    }

    if (
      result.poster_path
    ) {
      score += 20;
    }

    score +=
      Number(
        result.popularity ||
        0
      ) / 100;

    if (
      score >
      bestScore
    ) {
      bestScore =
        score;

      best =
        result;
    }
  }

  return best;
}


async function getPosterForMovie(
  movie
) {
  const title =
    movie.name ||
    movie.title ||
    "";

  const year =
    movie.year ||
    "";

  let results =
    await searchMovie(
      title,
      year
    );

  let best =
    chooseBestMatch(
      results,
      title,
      year
    );

  if (
    !best ||
    !best.poster_path
  ) {
    results =
      await searchMovie(
        title,
        null
      );

    best =
      chooseBestMatch(
        results,
        title,
        year
      );
  }

  if (
    !best ||
    !best.poster_path
  ) {
    return null;
  }

  return {
    poster:
      `https://image.tmdb.org/t/p/w780${best.poster_path}`,

    tmdbId:
      best.id,

    matchedTitle:
      best.title,

    matchedYear:
      best.release_date
        ? best.release_date.slice(
            0,
            4
          )
        : null
  };
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
    `Replacing posters for ${data.movies.length} movies using TMDb...`
  );

  let nextIndex = 0;
  let processed = 0;
  let fixed = 0;
  let missing = 0;


  async function worker() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        data.movies.length
      ) {
        return;
      }

      const movie =
        data.movies[
          index
        ];

      const title =
        movie.name ||
        movie.title ||
        "Unknown";

      try {
        const result =
          await getPosterForMovie(
            movie
          );

        if (
          result?.poster
        ) {
          movie.poster =
            result.poster;

          movie.tmdbId =
            result.tmdbId;

          fixed++;

          console.log(
            `[${index + 1}/${data.movies.length}] OK   ${title} -> ${result.matchedTitle} (${result.matchedYear || "?"})`
          );
        } else {
          missing++;

          console.log(
            `[${index + 1}/${data.movies.length}] NONE ${title}`
          );
        }

      } catch (error) {
        missing++;

        console.log(
          `[${index + 1}/${data.movies.length}] FAIL ${title}: ${error.message}`
        );
      }

      processed++;

      if (
        processed %
        SAVE_EVERY ===
        0
      ) {
        await saveData(
          data
        );

        console.log(
          `Saved progress: ${processed}/${data.movies.length}`
        );
      }

      await sleep(
        DELAY_MS
      );
    }
  }


  await Promise.all(
    Array.from(
      {
        length:
          CONCURRENCY
      },
      () =>
        worker()
    )
  );


  const posterMap =
    new Map();

  for (
    const movie
    of data.movies
  ) {
    if (
      movie.poster
    ) {
      const key =
        `${normalizeTitle(
          movie.name ||
          movie.title
        )}||${movie.year}`;

      posterMap.set(
        key,
        movie.poster
      );
    }
  }


  function updateList(
    list
  ) {
    if (
      !list?.items
    ) {
      return;
    }

    for (
      const item
      of list.items
    ) {
      const key =
        `${normalizeTitle(
          item.name ||
          item.title
        )}||${item.year}`;

      const poster =
        posterMap.get(
          key
        );

      if (poster) {
        item.poster =
          poster;
      }
    }
  }


  for (
    const list
    of Object.values(
      data.yearLists ||
      {}
    )
  ) {
    updateList(
      list
    );
  }


  if (
    data.top100
  ) {
    updateList(
      data.top100
    );
  }


  if (
    Array.isArray(
      data.lists
    )
  ) {
    for (
      const list
      of data.lists
    ) {
      updateList(
        list
      );
    }
  }


  await saveData(
    data
  );


  console.log("");
  console.log("DONE");
  console.log(
    `Updated posters: ${fixed}`
  );
  console.log(
    `Still missing: ${missing}`
  );
}


main()
  .catch(
    error => {
      console.error(
        error
      );

      process.exit(
        1
      );
    }
  );