import fs from "node:fs";
import path from "node:path";

const USERNAME = "Henry_Johnston";
const RSS_URL = `https://letterboxd.com/${USERNAME}/rss/`;
const EXPORT_PATH = path.join(
  process.cwd(),
  "data",
  "letterboxd-export.json"
);

let exportData = null;

function loadExportData() {
  if (!exportData) {
    exportData = JSON.parse(
      fs.readFileSync(EXPORT_PATH, "utf8")
    );
  }

  return exportData;
}

function decodeHTML(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”");
}

function stripHTML(value = "") {
  return decodeHTML(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(xml, tag) {
  const escaped = tag.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const match = xml.match(
    new RegExp(
      `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
      "i"
    )
  );

  return match
    ? decodeHTML(match[1]).trim()
    : "";
}

function extractPoster(html = "") {
  const decoded = decodeHTML(html);

  const match = decoded.match(
    /<img[^>]+src=["']([^"']+)["']/i
  );

  return match ? match[1] : "";
}

function normalizeKey(name, year) {
  return `${String(name || "")
    .trim()
    .toLowerCase()}||${String(year || "").trim()}`;
}

function parseRSSItem(itemXML) {
  const title =
    getTag(itemXML, "letterboxd:filmTitle") ||
    getTag(itemXML, "title");

  const year =
    getTag(itemXML, "letterboxd:filmYear") ||
    "";

  const watchedDate =
    getTag(itemXML, "letterboxd:watchedDate") ||
    "";

  const ratingRaw =
    getTag(itemXML, "letterboxd:memberRating") ||
    "";

  const description =
    getTag(itemXML, "description") ||
    getTag(itemXML, "content:encoded") ||
    "";

  let review =
    getTag(itemXML, "letterboxd:memberReview") ||
    "";

  if (!review && description) {
    const text = decodeHTML(description)
      .replace(
        /<p>\s*<img[\s\S]*?<\/p>/i,
        ""
      )
      .replace(/<img[^>]*>/gi, "");

    review = stripHTML(text);
  }

  return {
    title: stripHTML(title),
    year: Number(year) || year || null,
    watchedDate: watchedDate || null,
    rating: ratingRaw
      ? Number(ratingRaw)
      : null,
    review: review || null,
    poster: extractPoster(description),
    link:
      getTag(itemXML, "link") ||
      null,
    pubDate:
      getTag(itemXML, "pubDate") ||
      null
  };
}

function parseRSS(xml) {
  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi
    ) || [];

  return items
    .map(parseRSSItem)
    .filter(movie => movie.title);
}

async function getRSSMovies() {
  try {
    const response = await fetch(
      RSS_URL,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 HenryMovieFrame/1.0",
          Accept:
            "application/rss+xml, application/xml, text/xml, */*"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();

    return parseRSS(xml);
  } catch (error) {
    console.error(
      "RSS fetch failed:",
      error
    );

    return [];
  }
}

function exportMovieToFrontend(movie) {
  return {
    title: movie.name,
    year: movie.year,
    rating: movie.rating,
    review: movie.review,
    watchedDate:
      movie.lastWatchedDate,
   poster: movie.poster || "",
    link: movie.filmUrl,
    liked: !!movie.liked,
    watchCount:
      movie.watchCount || 0,
    rewatched:
      !!movie.rewatched
  };
}

function mergeFullHistory(
  baseMovies,
  rssMovies
) {
  const map = new Map();

  for (const movie of baseMovies) {
    map.set(
      normalizeKey(
        movie.title,
        movie.year
      ),
      { ...movie }
    );
  }

  for (const rssMovie of rssMovies) {
    const key = normalizeKey(
      rssMovie.title,
      rssMovie.year
    );

    const existing = map.get(key);

    if (existing) {
      map.set(key, {
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
          rssMovie.link
      });
    } else {
      map.set(key, {
        ...rssMovie,
        liked: false,
        watchCount: 1,
        rewatched: false
      });
    }
  }

  return [...map.values()];
}

function mergeDiary(
  exportDiary,
  rssMovies
) {
  const items =
    exportDiary.map(item => ({
      title: item.name,
      year: item.year,
      watchedDate:
        item.watchedDate,
      rating: item.rating,
      review: null
    }));

  const seen = new Set(
    items.map(item =>
      `${normalizeKey(
        item.title,
        item.year
      )}||${item.watchedDate || ""}`
    )
  );

  for (const item of rssMovies) {
    if (!item.watchedDate) {
      continue;
    }

    const key =
      `${normalizeKey(
        item.title,
        item.year
      )}||${item.watchedDate}`;

    if (!seen.has(key)) {
      seen.add(key);

      items.push({
        title: item.title,
        year: item.year,
        watchedDate:
          item.watchedDate,
        rating: item.rating,
        review: item.review
      });
    }
  }

  return items;
}

function getTodayInNewYork() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(
      new Date()
    );

  const values =
    Object.fromEntries(
      parts
        .filter(
          part =>
            part.type !== "literal"
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

function daysBetween(a, b) {
  const one = new Date(
    `${a}T12:00:00Z`
  );

  const two = new Date(
    `${b}T12:00:00Z`
  );

  return Math.floor(
    (two - one) / 86400000
  );
}

function calculateFacts(
  snapshot,
  combinedDiary
) {
  const today =
    getTodayInNewYork();

  const currentYear =
    today.slice(0, 4);

  const currentMonth =
    today.slice(0, 7);

  const valid =
    combinedDiary.filter(
      item => item.watchedDate
    );

  return {
    totalFilms:
      snapshot.movies.length,

    diaryEntries:
      valid.length,

    thisYear:
      valid.filter(item =>
        item.watchedDate.startsWith(
          currentYear
        )
      ).length,

    thisMonth:
      valid.filter(item =>
        item.watchedDate.startsWith(
          currentMonth
        )
      ).length,

    thisWeek:
      valid.filter(item => {
        const difference =
          daysBetween(
            item.watchedDate,
            today
          );

        return (
          difference >= 0 &&
          difference <= 6
        );
      }).length,

    ratings:
      snapshot.movies.filter(
        movie =>
          movie.rating !== null
      ).length,

    reviews:
      snapshot.reviews.length,

    watchlist:
      snapshot.watchlist.length
  };
}

function buildYearLists(
  snapshot,
  movieMap
) {
  const result = {};

  for (
    const [year, list]
    of Object.entries(
      snapshot.yearLists || {}
    )
  ) {
    result[year] =
      list.items.map(item => {
        const matching =
          movieMap.get(
            normalizeKey(
              item.name,
              item.year
            )
          );

        return {
          title: item.name,
          year: item.year,
          position:
            item.position,
          link: item.url,
          poster:
            matching?.poster ||
            "",
          rating:
            matching?.rating ??
            null
        };
      });
  }

  return result;
}

function buildTop100(
  snapshot,
  movieMap
) {
  if (!snapshot.top100) {
    return [];
  }

  return snapshot.top100.items.map(
    item => {
      const matching =
        movieMap.get(
          normalizeKey(
            item.name,
            item.year
          )
        );

      return {
        title: item.name,
        year: item.year,
        position:
          item.position,
        link: item.url,
        poster:
          matching?.poster ||
          "",
        rating:
          matching?.rating ??
          null
      };
    }
  );
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
        movies.map(movie => [
          normalizeKey(
            movie.title,
            movie.year
          ),
          movie
        ])
      );

    const combinedDiary =
      mergeDiary(
        snapshot.diary,
        rssMovies
      );

    const latest =
      [...rssMovies]
        .filter(
          movie =>
            movie.watchedDate
        )
        .sort(
          (a, b) =>
            String(
              b.watchedDate
            ).localeCompare(
              String(
                a.watchedDate
              )
            )
        )[0] ||
      [...movies]
        .filter(
          movie =>
            movie.watchedDate
        )
        .sort(
          (a, b) =>
            String(
              b.watchedDate
            ).localeCompare(
              String(
                a.watchedDate
              )
            )
        )[0] ||
      null;

    const topRated =
      [...movies]
        .filter(
          movie =>
            Number(
              movie.rating
            ) >= 4.5
        )
        .sort((a, b) => {
          const ratingDifference =
            Number(
              b.rating || 0
            ) -
            Number(
              a.rating || 0
            );

          if (
            ratingDifference !== 0
          ) {
            return ratingDifference;
          }

          return String(
            b.watchedDate || ""
          ).localeCompare(
            String(
              a.watchedDate || ""
            )
          );
        })
        .slice(0, 30);

    const favoriteURLs =
      new Set(
        snapshot.profile
          .favoriteFilmUrls || []
      );

    const favorites =
      movies.filter(movie =>
        favoriteURLs.has(
          movie.link
        ) ||
        movie.liked
      );

    const yearLists =
      buildYearLists(
        snapshot,
        movieMap
      );

    const top100 =
      buildTop100(
        snapshot,
        movieMap
      );

    res.setHeader(
      "Cache-Control",
      "no-store, max-age=0"
    );

    res.status(200).json({
      username:
        snapshot.profile.username ||
        USERNAME,

      displayName:
        snapshot.profile.givenName ||
        "Henry",

      exportedAt:
        snapshot.exportedAt,

      latest,

      movies,

      topRated,

      favorites,

      top100,

      yearLists,

      facts:
        calculateFacts(
          snapshot,
          combinedDiary
        )
    });
  } catch (error) {
    console.error(
      "API error:",
      error
    );

    res.status(500).json({
      error:
        "Unable to load Letterboxd frame data",

      details:
        error.message
    });
  }
}