const BUILD_NUMBER = "1.06";

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
    const response =
      await fetch(
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

    data =
      await response.json();

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


/* ========================================
   REAL MOVIE FILTER
======================================== */

function isRealMovie(movie) {
  if (
    !movie ||
    typeof movie !== "object"
  ) {
    return false;
  }

  if (
    Array.isArray(movie.items)
  ) {
    return false;
  }

  const title =
    String(
      movie.title ||
      movie.name ||
      ""
    ).trim();

  if (!title) {
    return false;
  }

  const year =
    Number(movie.year);

  if (
    !Number.isInteger(year) ||
    year < 1880 ||
    year > 2100
  ) {
    return false;
  }

  return true;
}


function getRealMovies() {
  return (
    data?.movies || []
  ).filter(isRealMovie);
}


/* ========================================
   SLIDE QUEUE
======================================== */

function buildSlideQueue() {
  slideQueue = [];

  if (!data) {
    return;
  }

  const movies =
    getRealMovies();

  if (
    settings.modes.latest &&
    isRealMovie(data.latest)
  ) {
    slideQueue.push({
      type: "movie",
      label: "LATEST WATCH",
      movie: data.latest
    });
  }

  if (
    settings.modes.random &&
    movies.length
  ) {
    slideQueue.push({
      type: "random"
    });
  }

  if (
    settings.modes.facts
  ) {
    slideQueue.push({
      type: "facts"
    });
  }

  if (
    settings.modes.topRated &&
    data.topRated?.length
  ) {
    const realTopRated =
      data.topRated
        .filter(isRealMovie)
        .slice(0, 5);

    for (
      const movie of
      realTopRated
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
    movies.length
  ) {
    slideQueue.push({
      type: "recent"
    });
  }

  if (
    settings.modes.favorites &&
    data.favorites?.length
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
      Object.keys(
        data.yearLists
      )
        .filter(year =>
          data.yearLists[year]?.length
        )
        .sort(
          (a, b) =>
            Number(b) -
            Number(a)
        );

    for (
      const year of years
    ) {
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
    ((index % slideQueue.length) +
      slideQueue.length) %
    slideQueue.length;

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

  slideTimer =
    setTimeout(
      () => {
        showSlide(
          slideIndex + 1
        );
      },
      settings.slideDuration
    );
}


/* ========================================
   RANDOM WATCH
======================================== */

function pickRandomMovie() {
  const movies =
    getRealMovies();

  if (!movies.length) {
    return null;
  }

  const movie =
    movies[
      Math.floor(
        Math.random() *
        movies.length
      )
    ];

  console.log(
    "Random movie:",
    movie.title,
    movie.year
  );

  return movie;
}


/* ========================================
   MOVIE SLIDE
======================================== */

function renderMovie(
  movie,
  label
) {
  if (
    !movie ||
    !isRealMovie(movie)
  ) {
    renderEmpty(
      "No movie available."
    );

    return;
  }

  const title =
    movie.title ||
    movie.name ||
    "";

  const year =
    movie.year || "";

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
          alt="${escapeAttribute(
            title
          )}"
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
          ${escapeHTML(title)}
        </h1>

        <div class="movie-year">
          ${escapeHTML(year)}
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


/* ========================================
   FACTS
======================================== */

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


/* ========================================
   RECENT
======================================== */

function renderRecent() {
  setBackgroundImage("");

  const movies =
    getRealMovies()
      .filter(
        movie =>
          movie.poster
      )
      .sort(
        (a, b) =>
          String(
            b.watchedDate || ""
          ).localeCompare(
            String(
              a.watchedDate || ""
            )
          )
      )
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
          .map(
            movie => `
              <img
                class="grid-poster"
                src="${escapeAttribute(
                  movie.poster
                )}"
                alt="${escapeAttribute(
                  movie.title || ""
                )}"
              >
            `
          )
          .join("")}

      </div>

    </section>
  `;
}


/* ========================================
   FAVORITES
======================================== */

function renderFavorites() {
  setBackgroundImage("");

  const favorites =
    (data?.favorites || [])
      .filter(isRealMovie);

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
          .filter(
            movie =>
              movie.poster
          )
          .slice(0, 12)
          .map(
            movie => `
              <img
                class="grid-poster"
                src="${escapeAttribute(
                  movie.poster
                )}"
                alt="${escapeAttribute(
                  movie.title || ""
                )}"
              >
            `
          )
          .join("")}

      </div>

    </section>
  `;
}


/* ========================================
   YEAR LIST
======================================== */

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
            (movie, index) => {

              const rank =
                movie.position ||
                index + 1;

              const watchedText =
                movie.watchedDate
                  ? `Watched ${formatDate(
                      movie.watchedDate
                    )}`
                  : "Watch date unavailable";

              return `
                <div class="year-movie">

                  <div class="year-poster-wrap">

                    ${
                      movie.poster
                        ? `
                          <img
                            class="year-poster"
                            src="${escapeAttribute(
                              movie.poster
                            )}"
                            alt="${escapeAttribute(
                              movie.title || ""
                            )}"
                          >
                        `
                        : `
                          <div
                            class="year-poster year-poster-empty"
                          >
                            ${escapeHTML(
                              movie.title ||
                              ""
                            )}
                          </div>
                        `
                    }

                    <div class="year-rank">
                      #${escapeHTML(
                        rank
                      )}
                    </div>

                  </div>

                  <div class="year-movie-title">
                    ${escapeHTML(
                      movie.title || ""
                    )}
                  </div>

                  <div class="year-watched-date">
                    ${escapeHTML(
                      watchedText
                    )}
                  </div>

                </div>
              `;
            }
          )
          .join("")}

      </div>

    </section>
  `;
}


/* ========================================
   EMPTY / ERROR
======================================== */

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


/* ========================================
   BACKGROUND
======================================== */

function setBackgroundImage(url) {
  if (!url) {
    backgroundImage.style.backgroundImage =
      "none";

    return;
  }

  backgroundImage.style.backgroundImage =
    `url("${url}")`;
}


/* ========================================
   FORMATTERS
======================================== */

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
  if (!dateString) {
    return "";
  }

  try {
    const date =
      new Date(
        `${dateString}T12:00:00`
      );

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return dateString;
    }

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
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(value = "") {
  return escapeHTML(value);
}


/* ========================================
   PAUSE
======================================== */

function togglePause() {
  if (
    settingsPanel &&
    !settingsPanel
      .classList
      .contains("hidden")
  ) {
    return;
  }

  paused = !paused;

  clearTimeout(
    slideTimer
  );

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
  if (!playStateIcon) {
    return;
  }

  clearTimeout(
    iconTimer
  );

  playStateIcon.textContent =
    icon;

  playStateIcon
    .classList
    .remove("hidden");

  if (autoHide) {
    iconTimer =
      setTimeout(
        () => {
          playStateIcon
            .classList
            .add("hidden");
        },
        1800
      );
  }
}


/* ========================================
   SETTINGS
======================================== */

function openSettings() {
  clearTimeout(
    slideTimer
  );

  if (!settingsPanel) {
    return;
  }

  settingsPanel
    .classList
    .remove("hidden");

  settingsPanel.style.display =
    "flex";

  settingsPanel.style.visibility =
    "visible";

  settingsPanel.style.opacity =
    "1";

  settingsPanel.style.zIndex =
    "2147483647";

  populateSettingsUI();
}


function closeSettings() {
  if (!settingsPanel) {
    return;
  }

  settingsPanel
    .classList
    .add("hidden");

  settingsPanel.style.display =
    "none";

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

  if (backgroundColorInput) {
    backgroundColorInput.value =
      settings.backgroundColor;
  }

  if (backgroundColorValue) {
    backgroundColorValue.textContent =
      settings.backgroundColor
        .toUpperCase();
  }

  if (brightnessSlider) {
    brightnessSlider.value =
      settings.brightness;
  }

  if (brightnessValue) {
    brightnessValue.textContent =
      `${settings.brightness}%`;
  }

  if (slideDuration) {
    slideDuration.value =
      String(
        settings.slideDuration
      );
  }

  if (buildNumber) {
    buildNumber.textContent =
      BUILD_NUMBER;
  }

  if (homeBuildNumber) {
    homeBuildNumber.textContent =
      BUILD_NUMBER;
  }
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
      backgroundColorInput
        ? backgroundColorInput.value
        : settings.backgroundColor,

    brightness:
      brightnessSlider
        ? Number(
            brightnessSlider.value
          )
        : settings.brightness,

    slideDuration:
      slideDuration
        ? Number(
            slideDuration.value
          )
        : settings.slideDuration
  };

  saveSettings();

  applyVisualSettings();

  if (data) {
    buildSlideQueue();
    showSlide(0);
  }
}


function getContrastTextColor(hex) {
  const cleanHex =
    String(hex)
      .replace("#", "");

  const r =
    parseInt(
      cleanHex.substring(
        0,
        2
      ),
      16
    );

  const g =
    parseInt(
      cleanHex.substring(
        2,
        4
      ),
      16
    );

  const b =
    parseInt(
      cleanHex.substring(
        4,
        6
      ),
      16
    );

  const luminance =
    (0.299 * r) +
    (0.587 * g) +
    (0.114 * b);

  return luminance > 160
    ? "#111111"
    : "#ffffff";
}


function applyVisualSettings() {
  const textColor =
    getContrastTextColor(
      settings.backgroundColor
    );

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

  document.documentElement
    .style
    .setProperty(
      "--frame-text",
      textColor
    );
}


/* ========================================
   SETTINGS EVENTS
======================================== */

if (
  backgroundColorInput
) {
  backgroundColorInput
    .addEventListener(
      "input",
      () => {

        if (
          backgroundColorValue
        ) {
          backgroundColorValue.textContent =
            backgroundColorInput
              .value
              .toUpperCase();
        }

        const previewTextColor =
          getContrastTextColor(
            backgroundColorInput.value
          );

        document.documentElement
          .style
          .setProperty(
            "--frame-background",
            backgroundColorInput.value
          );

        document.documentElement
          .style
          .setProperty(
            "--frame-text",
            previewTextColor
          );
      }
    );
}


if (
  brightnessSlider
) {
  brightnessSlider
    .addEventListener(
      "input",
      () => {
        if (
          brightnessValue
        ) {
          brightnessValue.textContent =
            `${brightnessSlider.value}%`;
        }
      }
    );
}


const saveSettingsButton =
  document.getElementById(
    "saveSettings"
  );

if (
  saveSettingsButton
) {
  saveSettingsButton
    .addEventListener(
      "click",
      () => {
        readSettingsFromUI();
        closeSettings();
      }
    );
}


const closeSettingsButton =
  document.getElementById(
    "closeSettings"
  );

if (
  closeSettingsButton
) {
  closeSettingsButton
    .addEventListener(
      "click",
      closeSettings
    );
}


const resetSettingsButton =
  document.getElementById(
    "resetSettings"
  );

if (
  resetSettingsButton
) {
  resetSettingsButton
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
}


/* ========================================
   SECRET SETTINGS HOTSPOT
======================================== */

function handleSettingsTouch(
  event
) {
  if (
    settingsPanel &&
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


if (
  settingsHotspot
) {
  settingsHotspot
    .addEventListener(
      "touchstart",
      handleSettingsTouch,
      {
        passive: false
      }
    );

  settingsHotspot
    .addEventListener(
      "pointerdown",
      handleSettingsTouch,
      true
    );

  settingsHotspot
    .addEventListener(
      "mousedown",
      handleSettingsTouch,
      true
    );

  settingsHotspot
    .addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();
      }
    );
}


/* ========================================
   DISPLAY TAP
======================================== */

const display =
  document.getElementById(
    "display"
  );

if (
  display
) {
  display
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
}


document.addEventListener(
  "contextmenu",
  event => {
    event.preventDefault();
  }
);


if (buildNumber) {
  buildNumber.textContent =
    BUILD_NUMBER;
}

if (homeBuildNumber) {
  homeBuildNumber.textContent =
    BUILD_NUMBER;
}


applyVisualSettings();

loadData();


setInterval(
  loadData,
  5 * 60 * 1000
);