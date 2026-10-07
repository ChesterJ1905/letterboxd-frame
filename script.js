const BUILD_NUMBER = "2026.10.07.4";

const DEFAULT_SETTINGS = {
  modes: {
    latest: true,
    random: true,
    facts: true,
    topRated: true,
    recent: true,
    favorites: false,
    yearLists: true
  },

  backgroundColor: "#0b1117",
  brightness: 100,
  slideDuration: 20000
};

let data = null;
let settings = loadSettings();

let slideQueue = [];
let slideIndex = 0;

let paused = false;
let slideTimer = null;
let iconTimer = null;

const slideRoot =
  document.getElementById("slideRoot");

const backgroundImage =
  document.getElementById("backgroundImage");

const settingsPanel =
  document.getElementById("settingsPanel");

const playStateIcon =
  document.getElementById("playStateIcon");

const settingsHotspot =
  document.getElementById("settingsHotspot");

const backgroundColorInput =
  document.getElementById("backgroundColor");

const backgroundColorValue =
  document.getElementById("backgroundColorValue");

const brightnessSlider =
  document.getElementById("brightnessSlider");

const brightnessValue =
  document.getElementById("brightnessValue");

const slideDuration =
  document.getElementById("slideDuration");

const buildNumber =
  document.getElementById("buildNumber");

const homeBuildNumber =
  document.getElementById("homeBuildNumber");

async function loadData() {
  try {
    const response = await fetch(
      "/api/data",
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}`
      );
    }

    data = await response.json();

    buildSlideQueue();
    showSlide(0);

  } catch (error) {
    console.error(error);

    showError(
      "Unable to load Letterboxd data."
    );
  }
}

function loadSettings() {
  try {
    const saved =
      localStorage.getItem(
        "movieFrameSettings"
      );

    if (!saved) {
      return JSON.parse(
        JSON.stringify(
          DEFAULT_SETTINGS
        )
      );
    }

    const parsed =
      JSON.parse(saved);

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,

      modes: {
        ...DEFAULT_SETTINGS.modes,
        ...(parsed.modes || {})
      }
    };

  } catch {
    return JSON.parse(
      JSON.stringify(
        DEFAULT_SETTINGS
      )
    );
  }
}

function saveSettings() {
  localStorage.setItem(
    "movieFrameSettings",
    JSON.stringify(settings)
  );
}

function buildSlideQueue() {
  slideQueue = [];

  if (!data) {
    return;
  }

  if (
    settings.modes.latest &&
    data.latest
  ) {
    slideQueue.push({
      type: "movie",
      label: "LATEST WATCH",
      movie: data.latest
    });
  }

  if (
    settings.modes.random &&
    data.movies?.length
  ) {
    slideQueue.push({
      type: "random"
    });
  }

  if (settings.modes.facts) {
    slideQueue.push({
      type: "facts"
    });
  }

  if (
    settings.modes.topRated &&
    data.topRated?.length
  ) {
    for (
      const movie of
      data.topRated.slice(0, 5)
    ) {
      slideQueue.push({
        type: "movie",
        label: "TOP RATED",
        movie
      });
    }
  }

  if (
    settings.modes.recent &&
    data.movies?.length
  ) {
    slideQueue.push({
      type: "recent"
    });
  }

  if (
    settings.modes.favorites
  ) {
    slideQueue.push({
      type: "favorites"
    });
  }

  if (
    settings.modes.yearLists &&
    data.yearLists
  ) {
    const years =
      Object.keys(data.yearLists)
        .sort(
          (a, b) =>
            Number(b) - Number(a)
        );

    for (const year of years) {
      slideQueue.push({
        type: "yearList",
        year
      });
    }
  }

  if (!slideQueue.length) {
    slideQueue.push({
      type: "empty"
    });
  }
}

function showSlide(index) {
  clearTimeout(slideTimer);

  if (!slideQueue.length) {
    return;
  }

  slideIndex =
    index % slideQueue.length;

  const slide =
    slideQueue[slideIndex];

  if (
    slide.type === "movie"
  ) {
    renderMovie(
      slide.movie,
      slide.label
    );

  } else if (
    slide.type === "random"
  ) {
    renderMovie(
      pickRandomMovie(),
      "RANDOM WATCH"
    );

  } else if (
    slide.type === "facts"
  ) {
    renderFacts();

  } else if (
    slide.type === "recent"
  ) {
    renderRecent();

  } else if (
    slide.type === "favorites"
  ) {
    renderFavorites();

  } else if (
    slide.type === "yearList"
  ) {
    renderYearList(
      slide.year
    );

  } else {
    renderEmpty(
      "No modes enabled."
    );
  }

  if (!paused) {
    scheduleNextSlide();
  }
}

function scheduleNextSlide() {
  clearTimeout(slideTimer);

  slideTimer = setTimeout(
    () => {
      showSlide(
        slideIndex + 1
      );
    },
    settings.slideDuration
  );
}

function pickRandomMovie() {
  const movies =
    data?.movies || [];

  if (!movies.length) {
    return null;
  }

  return movies[
    Math.floor(
      Math.random() *
      movies.length
    )
  ];
}

function renderMovie(
  movie,
  label
) {
  if (!movie) {
    renderEmpty(
      "No movie available."
    );

    return;
  }

  setBackgroundImage(
    movie.poster
  );

  const reviewHTML =
    movie.review
      ? `
        <div class="movie-review">
          “${escapeHTML(
            movie.review
          )}”
        </div>
      `
      : "";

  const posterHTML =
    movie.poster
      ? `
        <img
          class="poster"
          src="${escapeAttribute(
            movie.poster
          )}"
          alt=""
        >
      `
      : "";

  slideRoot.innerHTML = `
    <section class="movie-slide">

      <div class="poster-column">
        ${posterHTML}
      </div>

      <div class="movie-info">

        <p class="eyebrow">
          ${escapeHTML(label)}
        </p>

        <h1 class="movie-title">
          ${escapeHTML(
            movie.title || ""
          )}
        </h1>

        <div class="movie-year">
          ${escapeHTML(
            movie.year || ""
          )}
        </div>

        <div class="movie-rating">
          ${makeStars(
            movie.rating
          )}
        </div>

        <div class="movie-date">
          ${
            movie.watchedDate
              ? `Watched ${formatDate(
                  movie.watchedDate
                )}`
              : ""
          }
        </div>

        ${reviewHTML}

      </div>
    </section>
  `;
}

function renderFacts() {
  setBackgroundImage("");

  const facts =
    data?.facts || {};

  slideRoot.innerHTML = `
    <section class="facts-slide">

      <div class="facts-heading">
        HENRY'S LETTERBOXD
      </div>

      <div class="facts-grid">

        <div class="fact-card">
          <span class="fact-number">
            ${facts.totalFilms ?? "—"}
          </span>
          <span class="fact-label">
            FILMS
          </span>
        </div>

        <div class="fact-card">
          <span class="fact-number">
            ${facts.thisYear ?? "—"}
          </span>
          <span class="fact-label">
            THIS YEAR
          </span>
        </div>

        <div class="fact-card">
          <span class="fact-number">
            ${facts.thisMonth ?? "—"}
          </span>
          <span class="fact-label">
            THIS MONTH
          </span>
        </div>

        <div class="fact-card">
          <span class="fact-number">
            ${facts.thisWeek ?? "—"}
          </span>
          <span class="fact-label">
            THIS WEEK
          </span>
        </div>

      </div>
    </section>
  `;
}

function renderRecent() {
  setBackgroundImage("");

  const movies =
    (data?.movies || [])
      .slice(0, 12);

  if (!movies.length) {
    renderEmpty(
      "No recent movies found."
    );
    return;
  }

  slideRoot.innerHTML = `
    <section class="recent-slide">

      <h2 class="recent-title">
        RECENTLY WATCHED
      </h2>

      <div class="poster-grid">

        ${movies
          .map(movie => {
            if (!movie.poster) {
              return "";
            }

            return `
              <img
                class="grid-poster"
                src="${escapeAttribute(
                  movie.poster
                )}"
                alt=""
              >
            `;
          })
          .join("")}

      </div>
    </section>
  `;
}

function renderFavorites() {
  setBackgroundImage("");

  const favorites =
    data?.favorites || [];

  if (!favorites.length) {
    renderEmpty(
      "Favorites coming soon."
    );
    return;
  }

  slideRoot.innerHTML = `
    <section class="recent-slide">

      <h2 class="recent-title">
        FAVORITES
      </h2>

      <div class="poster-grid">

        ${favorites
          .slice(0, 12)
          .map(movie => {
            if (!movie.poster) {
              return "";
            }

            return `
              <img
                class="grid-poster"
                src="${escapeAttribute(
                  movie.poster
                )}"
                alt=""
              >
            `;
          })
          .join("")}

      </div>
    </section>
  `;
}

function renderYearList(year) {
  setBackgroundImage("");

  const movies =
    data?.yearLists?.[year] ||
    [];

  if (!movies.length) {
    renderEmpty(
      `No movies found for ${year}.`
    );

    return;
  }

  slideRoot.innerHTML = `
    <section class="year-slide">

      <div class="year-heading">
        <div class="year-label">
          HENRY'S MOVIES
        </div>

        <h1 class="year-number">
          ${escapeHTML(year)}
        </h1>

        <div class="year-subtitle">
          TOP MOVIES OF THE YEAR
        </div>
      </div>

      <div class="year-poster-grid">

        ${movies
          .slice(0, 8)
          .map(
            (movie, index) => `
              <div class="year-movie">

                <div class="year-rank">
                  #${index + 1}
                </div>

                ${
                  movie.poster
                    ? `
                      <img
                        class="year-poster"
                        src="${escapeAttribute(
                          movie.poster
                        )}"
                        alt=""
                      >
                    `
                    : `
                      <div class="year-poster year-poster-empty">
                        ${escapeHTML(
                          movie.title || ""
                        )}
                      </div>
                    `
                }

              </div>
            `
          )
          .join("")}

      </div>
    </section>
  `;
}

function renderEmpty(message) {
  setBackgroundImage("");

  slideRoot.innerHTML = `
    <section class="empty-slide">
      <div>
        <h1>
          ${escapeHTML(message)}
        </h1>
      </div>
    </section>
  `;
}

function showError(message) {
  renderEmpty(message);
}

function setBackgroundImage(url) {
  if (!url) {
    backgroundImage.style.backgroundImage =
      "none";
    return;
  }

  backgroundImage.style.backgroundImage =
    `url("${url}")`;
}

function makeStars(rating) {
  if (
    rating === null ||
    rating === undefined ||
    rating === ""
  ) {
    return "";
  }

  const value =
    Number(rating);

  const full =
    Math.floor(value);

  const half =
    value % 1 >= 0.5;

  return (
    "★".repeat(full) +
    (half ? "½" : "")
  );
}

function formatDate(dateString) {
  try {
    const date =
      new Date(
        `${dateString}T12:00:00`
      );

    return date.toLocaleDateString(
      "en-US",
      {
        month: "long",
        day: "numeric",
        year: "numeric"
      }
    );

  } catch {
    return dateString;
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHTML(value);
}

function togglePause() {
  if (
    !settingsPanel
      .classList
      .contains("hidden")
  ) {
    return;
  }

  paused = !paused;

  clearTimeout(slideTimer);

  if (paused) {
    showPlayStateIcon(
      "⏸",
      false
    );
  } else {
    showPlayStateIcon(
      "▶",
      true
    );

    scheduleNextSlide();
  }
}

function showPlayStateIcon(
  icon,
  autoHide
) {
  clearTimeout(iconTimer);

  playStateIcon.textContent =
    icon;

  playStateIcon
    .classList
    .remove("hidden");

  if (autoHide) {
    iconTimer = setTimeout(
      () => {
        playStateIcon
          .classList
          .add("hidden");
      },
      1800
    );
  }
}

function openSettings() {
  clearTimeout(slideTimer);

  settingsPanel
    .classList
    .remove("hidden");

  populateSettingsUI();
}

function closeSettings() {
  settingsPanel
    .classList
    .add("hidden");

  if (!paused) {
    scheduleNextSlide();
  }
}

function populateSettingsUI() {
  document
    .querySelectorAll(
      "[data-mode]"
    )
    .forEach(
      checkbox => {
        checkbox.checked =
          !!settings.modes[
            checkbox.dataset.mode
          ];
      }
    );

  backgroundColorInput.value =
    settings.backgroundColor;

  backgroundColorValue.textContent =
    settings.backgroundColor
      .toUpperCase();

  brightnessSlider.value =
    settings.brightness;

  brightnessValue.textContent =
    `${settings.brightness}%`;

  slideDuration.value =
    String(
      settings.slideDuration
    );

  buildNumber.textContent =
    BUILD_NUMBER;
}

function readSettingsFromUI() {
  const modes = {};

  document
    .querySelectorAll(
      "[data-mode]"
    )
    .forEach(
      checkbox => {
        modes[
          checkbox.dataset.mode
        ] =
          checkbox.checked;
      }
    );

  settings = {
    modes,

    backgroundColor:
      backgroundColorInput.value,

    brightness:
      Number(
        brightnessSlider.value
      ),

    slideDuration:
      Number(
        slideDuration.value
      )
  };

  saveSettings();
  applyVisualSettings();

  if (data) {
    buildSlideQueue();
    showSlide(0);
  }
}

function applyVisualSettings() {
  document.documentElement
    .style
    .setProperty(
      "--frame-background",
      settings.backgroundColor
    );

  document.documentElement
    .style
    .setProperty(
      "--frame-brightness",
      settings.brightness / 100
    );
}

backgroundColorInput.addEventListener(
  "input",
  () => {
    backgroundColorValue.textContent =
      backgroundColorInput.value
        .toUpperCase();
  }
);

brightnessSlider.addEventListener(
  "input",
  () => {
    brightnessValue.textContent =
      `${brightnessSlider.value}%`;
  }
);

document
  .getElementById("saveSettings")
  .addEventListener(
    "click",
    () => {
      readSettingsFromUI();
      closeSettings();
    }
  );

document
  .getElementById("closeSettings")
  .addEventListener(
    "click",
    closeSettings
  );

document
  .getElementById("resetSettings")
  .addEventListener(
    "click",
    () => {
      settings =
        JSON.parse(
          JSON.stringify(
            DEFAULT_SETTINGS
          )
        );

      saveSettings();
      applyVisualSettings();
      populateSettingsUI();

      if (data) {
        buildSlideQueue();
        showSlide(0);
      }
    }
  );

function handleSettingsTouch(event) {
  if (
    !settingsPanel
      .classList
      .contains("hidden")
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  openSettings();
}

settingsHotspot.addEventListener(
  "pointerdown",
  handleSettingsTouch,
  true
);

settingsHotspot.addEventListener(
  "touchstart",
  handleSettingsTouch,
  {
    capture: true,
    passive: false
  }
);

settingsHotspot.addEventListener(
  "mousedown",
  handleSettingsTouch,
  true
);

settingsHotspot.addEventListener(
  "click",
  event => {
    event.preventDefault();
    event.stopPropagation();
  }
);

document
  .getElementById("display")
  .addEventListener(
    "click",
    event => {
      if (
        event.target ===
        settingsHotspot
      ) {
        return;
      }

      togglePause();
    }
  );

document.addEventListener(
  "contextmenu",
  event => {
    event.preventDefault();
  }
);

buildNumber.textContent =
  BUILD_NUMBER;

homeBuildNumber.textContent =
  `Build ${BUILD_NUMBER}`;

applyVisualSettings();

loadData();

setInterval(
  loadData,
  5 * 60 * 1000
);