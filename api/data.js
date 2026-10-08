import fs from "node:fs";
import path from "node:path";

const USERNAME =
  "Henry_Johnston";

const RSS_URL =
  `https://letterboxd.com/${USERNAME}/rss/`;

const PROFILE_URL =
  `https://letterboxd.com/${USERNAME.toLowerCase()}/`;

const EXPORT_PATH =
  path.join(
    process.cwd(),
    "data",
    "letterboxd-export.json"
  );

let exportData = null;

function loadExportData() {
  if (!exportData) {
    exportData =
      JSON.parse(
        fs.readFileSync(
          EXPORT_PATH,
          "utf8"
        )
      );
  }

  return exportData;
}

function decodeHTML(
  value = ""
) {
  return String(value)
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/g,
      "'"
    )
    .replace(
      /&#x2F;/g,
      "/"
    )
    .replace(
      /&#8217;/g,
      "’"
    )
    .replace(
      /&#8216;/g,
      "‘"
    )
    .replace(
      /&#8220;/g,
      "“"
    )
    .replace(
      /&#8221;/g,
      "”"
    );
}

function stripHTML(
  value = ""
) {
  return decodeHTML(value)
    .replace(
      /<br\s*\/?>/gi,
      "\n"
    )
    .replace(
      /<[^>]*>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function getTag(
  xml,
  tag
) {
  const escaped =
    tag.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const match =
    xml.match(
      new RegExp(
        `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
        "i"
      )
    );

  return match
    ? decodeHTML(
        match[1]
      ).trim()
    : "";
}

function extractPoster(
  html = ""
) {
  const decoded =
    decodeHTML(html);

  const match =
    decoded.match(
      /<img[^>]+src=["']([^"']+)["']/i
    );

  return match
    ? match[1]
    : "";
}

function normalizeKey(
  name,
  year
) {
  return `${
    stripHTML(name)
      .toLowerCase()
  }||${
    String(
      year || ""
    ).trim()
  }`;
}

function normalizeTitle(name) {
  return stripHTML(name)
    .toLowerCase();
}

function parseRSSItem(
  itemXML
) {
  const title =
    getTag(
      itemXML,
      "letterboxd:filmTitle"
    ) ||
    getTag(
      itemXML,
      "title"
    );

  const year =
    getTag(
      itemXML,
      "letterboxd:filmYear"
    ) ||
    "";

  const watchedDate =
    getTag(
      itemXML,
      "letterboxd:watchedDate"
    ) ||
    "";

  const ratingRaw =
    getTag(
      itemXML,
      "letterboxd:memberRating"
    ) ||
    "";

  const description =
    getTag(
      itemXML,
      "description"
    ) ||
    getTag(
      itemXML,
      "content:encoded"
    ) ||
    "";

  let review =
    getTag(
      itemXML,
      "letterboxd:memberReview"
    ) ||
    "";

  if (
    !review &&
    description
  ) {
    const decoded =
      decodeHTML(
        description
      );

    const paragraphs =
      [
        ...decoded.matchAll(
          /<p[^>]*>([\s\S]*?)<\/p>/gi
        )
      ];

    const textParagraphs =
      paragraphs
        .map(
          match =>
            stripHTML(
              match[1]
            )
        )
        .filter(
          text =>
            text &&
            !/^watched on /i
              .test(text)
        );

    if (
      textParagraphs.length > 1
    ) {
      review =
        textParagraphs
          .slice(1)
          .join("\n\n");
    }
  }

  return {
    title:
      stripHTML(title),

    year:
      Number(year) ||
      year ||
      null,

    watchedDate:
      watchedDate ||
      null,

    rating:
      ratingRaw
        ? Number(
            ratingRaw
          )
        : null,

    review:
      stripHTML(
        review
      ) ||
      null,

    poster:
      extractPoster(
        description
      ),

    link:
      getTag(
        itemXML,
        "link"
      ) ||
      null,

    pubDate:
      getTag(
        itemXML,
        "pubDate"
      ) ||
      null
  };
}

function parseRSS(xml) {
  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi
    ) ||
    [];

  return items
    .map(
      parseRSSItem
    )
    .filter(
      movie =>
        movie.title &&
        movie.year
    );
}

async function getRSSMovies() {
  try {
    const response =
      await fetch(
        RSS_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 HenryMovieFrame/1.10",

            Accept:
              "application/rss+xml, application/xml, text/xml, */*"
          },

          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      return [];
    }

    return parseRSS(
      await response.text()
    );

  } catch (error) {
    console.error(
      "RSS fetch failed:",
      error
    );

    return [];
  }
}

function exportMovieToFrontend(
  movie
) {
  return {
    title:
      stripHTML(
        movie.name
      ),

    year:
      movie.year,

    rating:
      movie.rating,

    review:
      stripHTML(
        movie.review ||
        ""
      ) ||
      null,

    watchedDate:
      movie.lastWatchedDate ||
      null,

    poster:
      movie.poster ||
      "",

    link:
      movie.filmUrl ||
      null,

    liked:
      !!movie.liked,

    watchCount:
      movie.watchCount ||
      0,

    rewatched:
      !!movie.rewatched
  };
}

function mergeFullHistory(
  baseMovies,
  rssMovies
) {
  const map =
    new Map();

  for (
    const movie
    of baseMovies
  ) {
    map.set(
      normalizeKey(
        movie.title,
        movie.year
      ),
      {
        ...movie
      }
    );
  }

  for (
    const rssMovie
    of rssMovies
  ) {
    const key =
      normalizeKey(
        rssMovie.title,
        rssMovie.year
      );

    const existing =
      map.get(key);

    if (existing) {
      map.set(
        key,
        {
          ...existing,

          rating:
            rssMovie.rating ??
            existing.rating,

          review:
            rssMovie.review ||
            existing.review,

          watchedDate:
            rssMovie.watchedDate ||
            existing.watchedDate,

          poster:
            rssMovie.poster ||
            existing.poster,

          link:
            existing.link ||
            rssMovie.link,

          watchCount:
            Math.max(
              existing.watchCount ||
              1,
              1
            )
        }
      );

    } else {
      map.set(
        key,
        {
          ...rssMovie,

          liked:
            false,

          watchCount:
            1,

          rewatched:
            false
        }
      );
    }
  }

  return [
    ...map.values()
  ];
}

function mergeDiary(
  exportDiary,
  rssMovies,
  movieMap
) {
  const entries =
    exportDiary.map(
      item => ({
        title:
          stripHTML(
            item.name
          ),

        year:
          item.year,

        watchedDate:
          item.watchedDate,

        rating:
          item.rating,

        review:
          null
      })
    );

  const seen =
    new Set(
      entries.map(
        item =>
          `${normalizeKey(
            item.title,
            item.year
          )}||${
            item.watchedDate ||
            ""
          }`
      )
    );

  for (
    const item
    of rssMovies
  ) {
    if (
      !item.watchedDate
    ) {
      continue;
    }

    const key =
      `${normalizeKey(
        item.title,
        item.year
      )}||${
        item.watchedDate
      }`;

    if (
      !seen.has(key)
    ) {
      seen.add(key);

      entries.push({
        title:
          item.title,

        year:
          item.year,

        watchedDate:
          item.watchedDate,

        rating:
          item.rating,

        review:
          item.review
      });
    }
  }

  return entries.map(
    entry => {

      const movie =
        movieMap.get(
          normalizeKey(
            entry.title,
            entry.year
          )
        );

      return {
        ...entry,

        poster:
          movie?.poster ||
          "",

        review:
          entry.review ||
          movie?.review ||
          null,

        link:
          movie?.link ||
          null
      };
    }
  );
}

function getTodayInNewYork() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
      .formatToParts(
        new Date()
      );

  const values =
    Object.fromEntries(
      parts
        .filter(
          part =>
            part.type !==
            "literal"
        )
        .map(
          part => [
            part.type,
            part.value
          ]
        )
    );

  return `${values.year}-${values.month}-${values.day}`;
}

function previousYearDate(
  today
) {
  const [
    year,
    month,
    day
  ] =
    today
      .split("-")
      .map(Number);

  const previous =
    new Date(
      Date.UTC(
        year - 1,
        month - 1,
        day
      )
    );

  return `${
    previous.getUTCFullYear()
  }-${
    String(
      previous.getUTCMonth() +
      1
    ).padStart(
      2,
      "0"
    )
  }-${
    String(
      previous.getUTCDate()
    ).padStart(
      2,
      "0"
    )
  }`;
}

function daysBetween(
  a,
  b
) {
  const one =
    new Date(
      `${a}T12:00:00Z`
    );

  const two =
    new Date(
      `${b}T12:00:00Z`
    );

  return Math.floor(
    (
      two -
      one
    ) /
    86400000
  );
}

function calculateFacts(
  snapshot,
  combinedDiary,
  movies
) {
  const today =
    getTodayInNewYork();

  const currentYear =
    today.slice(
      0,
      4
    );

  const currentMonth =
    today.slice(
      0,
      7
    );

  const valid =
    combinedDiary
      .filter(
        item =>
          item.watchedDate
      );

  return {
    totalFilms:
      movies.length,

    diaryEntries:
      valid.length,

    thisYear:
      valid
        .filter(
          item =>
            item.watchedDate
              .startsWith(
                currentYear
              )
        )
        .length,

    thisMonth:
      valid
        .filter(
          item =>
            item.watchedDate
              .startsWith(
                currentMonth
              )
        )
        .length,

    thisWeek:
      valid
        .filter(
          item => {
            const difference =
              daysBetween(
                item.watchedDate,
                today
              );

            return (
              difference >= 0 &&
              difference <= 6
            );
          }
        )
        .length,

    ratings:
      movies
        .filter(
          movie =>
            movie.rating !==
            null &&
            movie.rating !==
            undefined
        )
        .length,

    reviews:
      movies
        .filter(
          movie =>
            stripHTML(
              movie.review ||
              ""
            )
        )
        .length,

    watchlist:
      snapshot
        .watchlist
        .length
  };
}

function buildSnapshotTop100(
  snapshot,
  movieMap
) {
  if (
    !snapshot
      .top100
      ?.items
  ) {
    return [];
  }

  return snapshot
    .top100
    .items
    .map(
      (
        item,
        index
      ) => {

        const matching =
          movieMap.get(
            normalizeKey(
              item.name,
              item.year
            )
          );

        return {
          title:
            stripHTML(
              item.name
            ),

          year:
            item.year,

          position:
            item.position ||
            index + 1,

          link:
            item.url,

          poster:
            matching?.poster ||
            item.poster ||
            "",

          rating:
            matching?.rating ??
            null,

          review:
            matching?.review ||
            null,

          watchedDate:
            matching?.watchedDate ||
            null
        };
      }
    );
}

function getAttr(
  block,
  name
) {
  const match =
    block.match(
      new RegExp(
        `${name}=["']([^"']+)["']`,
        "i"
      )
    );

  return match
    ? decodeHTML(
        match[1]
      ).trim()
    : "";
}

function parsePublicListHTML(
  html,
  movieMap
) {
  const blocks =
    html.match(
      /<li[^>]*class=["'][^"']*poster-container[^"']*["'][\s\S]*?<\/li>/gi
    ) ||
    [];

  const byTitle =
    new Map();

  for (
    const movie
    of movieMap.values()
  ) {
    const key =
      normalizeTitle(
        movie.title
      );

    if (
      !byTitle.has(key)
    ) {
      byTitle.set(
        key,
        []
      );
    }

    byTitle
      .get(key)
      .push(movie);
  }

  const results =
    [];

  for (
    const block
    of blocks
  ) {
    let title =
      getAttr(
        block,
        "data-film-name"
      );

    if (!title) {
      const alt =
        block.match(
          /<img[^>]+alt=["']([^"']+)["']/i
        );

      title =
        alt
          ? decodeHTML(
              alt[1]
            ).trim()
          : "";
    }

    title =
      stripHTML(title);

    if (!title) {
      continue;
    }

    let year =
      Number(
        getAttr(
          block,
          "data-film-year"
        )
      ) ||
      null;

    let matching =
      year
        ? movieMap.get(
            normalizeKey(
              title,
              year
            )
          )
        : null;

    if (!matching) {
      matching =
        (
          byTitle.get(
            normalizeTitle(
              title
            )
          ) ||
          []
        )[0] ||
        null;
    }

    if (!matching) {
      continue;
    }

    year =
      matching.year;

    results.push({
      ...matching,

      title:
        matching.title,

      year,

      position:
        results.length +
        1
    });
  }

  return results;
}

async function getLiveTop100(
  snapshot,
  movieMap
) {
  const fallback =
    buildSnapshotTop100(
      snapshot,
      movieMap
    );

  const listURL =
    snapshot
      .top100
      ?.url;

  if (!listURL) {
    return fallback;
  }

  try {
    const response =
      await fetch(
        listURL,
        {
          redirect:
            "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 HenryMovieFrame/1.10",

            Accept:
              "text/html,application/xhtml+xml"
          },

          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      return fallback;
    }

    const live =
      parsePublicListHTML(
        await response.text(),
        movieMap
      );

    return live.length >= 20
      ? live.slice(
          0,
          100
        )
      : fallback;

  } catch (error) {
    console.error(
      "Top 100 refresh failed:",
      error
    );

    return fallback;
  }
}

function buildYearLists(
  snapshot,
  movieMap,
  movies
) {
  const result =
    {};

  const snapshotLists =
    snapshot.yearLists ||
    {};

  const allYears =
    new Set(
      Object.keys(
        snapshotLists
      )
    );

  for (
    const movie
    of movies
  ) {
    if (movie.year) {
      allYears.add(
        String(
          movie.year
        )
      );
    }
  }

  for (
    const year
    of allYears
  ) {
    const list =
      snapshotLists[year];

    const items =
      [];

    const seen =
      new Set();

    if (
      list?.items
    ) {
      for (
        const item
        of list.items
      ) {
        const key =
          normalizeKey(
            item.name,
            item.year
          );

        const matching =
          movieMap.get(key);

        items.push({
          title:
            stripHTML(
              item.name
            ),

          year:
            item.year,

          position:
            item.position ||
            items.length +
            1,

          link:
            item.url,

          poster:
            matching?.poster ||
            item.poster ||
            "",

          rating:
            matching?.rating ??
            null,

          review:
            matching?.review ||
            null,

          watchedDate:
            matching?.watchedDate ||
            null
        });

        seen.add(key);
      }
    }

    const additions =
      movies
        .filter(
          movie =>
            String(
              movie.year
            ) ===
              String(year) &&
            !seen.has(
              normalizeKey(
                movie.title,
                movie.year
              )
            )
        )
        .sort(
          (a, b) =>
            String(
              b.watchedDate ||
              ""
            ).localeCompare(
              String(
                a.watchedDate ||
                ""
              )
            )
        );

    for (
      const movie
      of additions
    ) {
      items.push({
        ...movie,

        position:
          items.length +
          1
      });
    }

    if (
      items.length
    ) {
      result[year] =
        items;
    }
  }

  return result;
}

async function getLiveFavorites(
  snapshot,
  movieMap
) {
  const fallbackURLs =
    new Set(
      snapshot
        .profile
        ?.favoriteFilmUrls ||
      []
    );

  const fallback =
    [
      ...movieMap.values()
    ]
      .filter(
        movie =>
          fallbackURLs.has(
            movie.link
          )
      );

  try {
    const response =
      await fetch(
        PROFILE_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 HenryMovieFrame/1.10"
          },

          cache:
            "no-store"
        }
      );

    if (!response.ok) {
      return fallback;
    }

    const html =
      await response.text();

    const section =
      html.match(
        /<section[^>]+id=["']favourites["'][\s\S]*?<\/section>/i
      )?.[0] ||
      html.match(
        /<div[^>]+class=["'][^"']*profile-favorites[^"']*["'][\s\S]*?<\/div>/i
      )?.[0] ||
      "";

    if (!section) {
      return fallback;
    }

    const parsed =
      parsePublicListHTML(
        section,
        movieMap
      );

    return parsed.length
      ? parsed.slice(
          0,
          4
        )
      : fallback;

  } catch {
    return fallback;
  }
}

export default async function handler(
  req,
  res
) {
  try {
    const snapshot =
      loadExportData();

    const rssMovies =
      await getRSSMovies();

    const baseMovies =
      snapshot.movies.map(
        exportMovieToFrontend
      );

    const movies =
      mergeFullHistory(
        baseMovies,
        rssMovies
      );

    const movieMap =
      new Map(
        movies.map(
          movie => [
            normalizeKey(
              movie.title,
              movie.year
            ),
            movie
          ]
        )
      );

    const combinedDiary =
      mergeDiary(
        snapshot.diary,
        rssMovies,
        movieMap
      );

    const topRated =
      [
        ...movies
      ]
        .filter(
          movie =>
            Number.isFinite(
              Number(
                movie.rating
              )
            )
        )
        .sort(
          (a, b) =>
            Number(
              b.rating
            ) -
            Number(
              a.rating
            ) ||
            String(
              b.watchedDate ||
              ""
            ).localeCompare(
              String(
                a.watchedDate ||
                ""
              )
            )
        )
        .slice(
          0,
          40
        );

    const worstRated =
      [
        ...movies
      ]
        .filter(
          movie =>
            Number(
              movie.rating
            ) > 0
        )
        .sort(
          (a, b) =>
            Number(
              a.rating
            ) -
            Number(
              b.rating
            ) ||
            String(
              b.watchedDate ||
              ""
            ).localeCompare(
              String(
                a.watchedDate ||
                ""
              )
            )
        )
        .slice(
          0,
          30
        );

    const today =
      getTodayInNewYork();

    const targetDate =
      previousYearDate(
        today
      );

    const yearAgoToday =
      combinedDiary
        .filter(
          entry =>
            entry.watchedDate ===
            targetDate
        );

    const [
      top100,
      favorites
    ] =
      await Promise.all([
        getLiveTop100(
          snapshot,
          movieMap
        ),

        getLiveFavorites(
          snapshot,
          movieMap
        )
      ]);

    const yearLists =
      buildYearLists(
        snapshot,
        movieMap,
        movies
      );

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=900"
    );

    res.status(
      200
    ).json({
      username:
        snapshot
          .profile
          ?.username ||
        USERNAME,

      displayName:
        snapshot
          .profile
          ?.givenName ||
        "Henry",

      exportedAt:
        snapshot.exportedAt,

      movies,

      diary:
        combinedDiary,

      topRated,

      worstRated,

      favorites,

      top100,

      yearLists,

      yearAgoToday,

      facts:
        calculateFacts(
          snapshot,
          combinedDiary,
          movies
        )
    });

  } catch (error) {
    console.error(
      "API error:",
      error
    );

    res.status(
      500
    ).json({
      error:
        "Unable to load Letterboxd frame data",

      details:
        error.message
    });
  }
}