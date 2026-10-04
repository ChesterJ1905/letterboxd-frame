const RSS_URL = "https://letterboxd.com/Henry_johnston/rss/";

function getTag(xml, tag) {
  const escapedTag = tag.replace(":", "\\:");

  const regex = new RegExp(
    `<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`,
    "i"
  );

  const match = xml.match(regex);

  if (!match) {
    return "";
  }

  return match[1]
    .replace("<![CDATA[", "")
    .replace("]]>", "")
    .trim();
}

function decodeHTML(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export default async function handler(req, res) {
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Letterboxd returned ${response.status}`
      );
    }

    const xml = await response.text();

    const itemMatch = xml.match(
      /<item>([\s\S]*?)<\/item>/i
    );

    if (!itemMatch) {
      throw new Error("No Letterboxd entries found.");
    }

    const item = itemMatch[1];

    const title = decodeHTML(
      getTag(item, "letterboxd:filmTitle") ||
      getTag(item, "title")
    );

    const year =
      getTag(item, "letterboxd:filmYear");

    const rating =
      getTag(item, "letterboxd:memberRating");

    const watchedDate =
      getTag(item, "letterboxd:watchedDate");

    const description =
      getTag(item, "description");

    const imageMatch = description.match(
      /<img[^>]+src=["']([^"']+)["']/i
    );

    const poster = imageMatch
      ? decodeHTML(imageMatch[1])
      : "";

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    res.status(200).json({
      title,
      year,
      rating,
      watchedDate,
      poster
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load Letterboxd.",
      details: error.message
    });
  }
}