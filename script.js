async function updateMovie() {
  try {
    const response = await fetch("/api/latest", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Could not load Letterboxd data.");
    }

    const movie = await response.json();

    document.getElementById("title").textContent =
      movie.title || "Unknown Movie";

    document.getElementById("year").textContent =
      movie.year || "";

    document.getElementById("date").textContent =
      movie.watchedDate
        ? `Watched ${formatDate(movie.watchedDate)}`
        : "";

    document.getElementById("rating").textContent =
      makeStars(movie.rating);

    const poster = document.getElementById("poster");

    if (movie.poster) {
      poster.src = movie.poster;
      poster.style.display = "block";

      document.getElementById(
        "background"
      ).style.backgroundImage = `url("${movie.poster}")`;
    } else {
      poster.style.display = "none";
    }
  } catch (error) {
    console.error(error);

    document.getElementById("title").textContent =
      "Waiting for Letterboxd...";
  }
}

function makeStars(rating) {
  if (!rating) {
    return "";
  }

  const value = Number(rating);

  const fullStars = Math.floor(value);
  const hasHalf = value % 1 !== 0;

  return "★".repeat(fullStars) + (hasHalf ? "½" : "");
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

updateMovie();

/* Check for a new movie every 5 minutes */
setInterval(updateMovie, 5 * 60 * 1000);