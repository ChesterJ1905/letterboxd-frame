const USERNAME =
  "Henry_johnston";

const RSS_URL =
  `https://letterboxd.com/${USERNAME}/rss/`;

function getTag(xml, tag) {
  const escaped =
    tag.replace(
      ":",
      "\\:"
    );

  const regex =
    new RegExp(
      `<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`,
      "i"
    );

  const match =
    xml.match(regex);

  if (!match) {
    return "";
  }

  return match[1]
    .replace("<![CDATA[", "")
    .replace("]]>", "")
    .trim();
}

function decodeHTML(text = "") {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHTML(text = "") {
  return decodeHTML(
    text
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<[^>]*>/g,
        ""
      )
  )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

function parseItem(item) {
  const description =
    getTag(
      item,
      "description"
    );

  const imageMatch =
    description.match(
      /<img[^>]+src=["']([^"']+)["']/i
    );

  let review = "";

  const paragraphMatches =
    [
      ...description.matchAll(
        /<p[^>]*>([\s\S]*?)<\/p>/gi
      )
    ];

  if (
    paragraphMatches.length > 1
  ) {
    const possibleReview =
      paragraphMatches
        .slice(1)
        .map(match =>
          stripHTML(
            match[1]
          )
        )
        .join("\n\n")
        .trim();

    review =
      possibleReview;
  }

  return {
    title:
      decodeHTML(
        getTag(
          item,
          "letterboxd:filmTitle"
        ) ||
        getTag(
          item,
          "title"
        )
      ),

    year:
      getTag(
        item,
        "letterboxd:filmYear"
      ),

    rating:
      getTag(
        item,
        "letterboxd:memberRating"
      ),

    watchedDate:
      getTag(
        item,
        "letterboxd:watchedDate"
      ),

    poster:
      imageMatch
        ? decodeHTML(
            imageMatch[1]
          )
        : "",

    review
  };
}

function parseRSS(xml) {
  const itemMatches =
    [
      ...xml.matchAll(
        /<item>([\s\S]*?)<\/item>/gi
      )
    ];

  return itemMatches
    .map(
      match =>
        parseItem(
          match[1]
        )
    )
    .filter(
      movie =>
        movie.title
    );
}

function calculateRecentFacts(
  movies
) {
  const now =
    new Date();

  const startOfYear =
    new Date(
      now.getFullYear(),
      0,
      1
    );

  const startOfMonth =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  const startOfWeek =
    new Date(now);

  const day =
    startOfWeek.getDay();

  const diff =
    day === 0
      ? 6
      : day - 1;

  startOfWeek.setDate(
    startOfWeek.getDate() -
    diff
  );

  startOfWeek.setHours(
    0,
    0,
    0,
    0
  );

  function countSince(date) {
    return movies.filter(
      movie => {
        if (
          !movie.watchedDate
        ) {
          return false;
        }

        return (
          new Date(
            `${movie.watchedDate}T12:00:00`
          ) >= date
        );
      }
    ).length;
  }

  return {
    thisMonth:
      countSince(
        startOfMonth
      ),

    thisWeek:
      countSince(
        startOfWeek
      ),

    rssThisYear:
      countSince(
        startOfYear
      )
  };
}

export default async function handler(
  req,
  res
) {
  try {
    const response =
      await fetch(
        RSS_URL,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 LetterboxdMovieFrame/1.0"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Letterboxd returned ${response.status}`
      );
    }

    const xml =
      await response.text();

    const movies =
      parseRSS(xml);

    const recentFacts =
      calculateRecentFacts(
        movies
      );

    const topRated =
      [...movies]
        .filter(
          movie =>
            movie.rating
        )
        .sort(
          (a, b) =>
            Number(b.rating) -
            Number(a.rating)
        );

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    res.status(200).json({
      username:
        USERNAME,

      latest:
        movies[0] || null,

      movies,

      topRated,

      favorites: [],

      facts: {
        totalFilms: 871,
        thisYear: 214,

        thisMonth:
          recentFacts.thisMonth,

        thisWeek:
          recentFacts.thisWeek
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Unable to load Letterboxd data.",

      details:
        error.message
    });
  }
}