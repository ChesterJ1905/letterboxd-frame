const BUILD_NUMBER = "1.10";

const DEFAULT_SETTINGS = {
  modes: {
    random: true,
    facts: true,
    topRated: true,
    recent: true,
    favorites: false,
    yearRecap: true,
    top100: true,
    worst: true
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

const slideRoot = document.getElementById("slideRoot");
const backgroundImage = document.getElementById("backgroundImage");
const settingsPanel = document.getElementById("settingsPanel");
const playStateIcon = document.getElementById("playStateIcon");
const settingsHotspot = document.getElementById("settingsHotspot");
const backgroundColorInput = document.getElementById("backgroundColor");
const backgroundColorValue = document.getElementById("backgroundColorValue");
const brightnessSlider = document.getElementById("brightnessSlider");
const brightnessValue = document.getElementById("brightnessValue");
const slideDuration = document.getElementById("slideDuration");
const buildNumber = document.getElementById("buildNumber");
const homeBuildNumber = document.getElementById("homeBuildNumber");

async function loadData() {
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    data = await response.json();
    buildSlideQueue();
    showSlide(0);
  } catch (error) {
    console.error(error);
    renderEmpty("Unable to load Letterboxd data.");
  }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem("movieFrameSettings");
    if (!saved) return structuredCloneFallback(DEFAULT_SETTINGS);

    const parsed = JSON.parse(saved);

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      modes: {
        ...DEFAULT_SETTINGS.modes,
        ...(parsed.modes || {})
      }
    };
  } catch {
    return structuredCloneFallback(DEFAULT_SETTINGS);
  }
}

function structuredCloneFallback(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveSettings() {
  localStorage.setItem(
    "movieFrameSettings",
    JSON.stringify(settings)
  );
}

function stripTags(value = "") {
  const textarea = document.createElement("textarea");

  textarea.innerHTML =
    String(value).replace(/<[^>]*>/g, "");

  return textarea.value
    .replace(/\s+/g, " ")
    .trim();
}

function isRealMovie(movie) {
  if (
    !movie ||
    typeof movie !== "object" ||
    Array.isArray(movie.items)
  ) {
    return false;
  }

  const title =
    stripTags(
      movie.title ||
      movie.name ||
      ""
    );

  const year =
    Number(movie.year);

  return (
    Boolean(title) &&
    Number.isInteger(year) &&
    year >= 1880 &&
    year <= 2100
  );
}

function getRealMovies() {
  return (
    data?.movies || []
  ).filter(isRealMovie);
}

function hasReview(movie) {
  return stripTags(
    movie?.review || ""
  ).length > 0;
}

function buildSlideQueue() {
  slideQueue = [];

  if (!data) return;

  if (
    settings.modes.random &&
    getRealMovies().some(hasReview)
  ) {
    slideQueue.push({
      type: "random"
    });
  }

  if (settings.modes.facts) {
    slideQueue.push({
      type: "factsOverview"
    });

    slideQueue.push({
      type: "factsActivity"
    });

    if (
      (data.yearAgoToday || []).length
    ) {
      slideQueue.push({
        type: "yearAgoToday"
      });
    }
  }

  if (
    settings.modes.topRated &&
    (data.topRated || []).some(isRealMovie)
  ) {
    slideQueue.push({
      type: "topRated"
    });
  }

  if (
    settings.modes.recent &&
    getRealMovies().length
  ) {
    slideQueue.push({
      type: "recent"
    });
  }

  if (
    settings.modes.favorites &&
    (data.favorites || []).some(isRealMovie)
  ) {
    slideQueue.push({
      type: "favorite"
    });
  }

  if (
    settings.modes.top100 &&
    (data.top100 || []).length
  ) {
    slideQueue.push({
      type: "top100"
    });
  }

  if (
    settings.modes.worst &&
    (data.worstRated || []).some(isRealMovie)
  ) {
    slideQueue.push({
      type: "worst"
    });
  }

  if (
    settings.modes.yearRecap &&
    data.yearLists
  ) {
    Object.keys(
      data.yearLists
    )
      .filter(
        year =>
          Array.isArray(
            data.yearLists[year]
          ) &&
          data.yearLists[year].length
      )
      .sort(
        (a, b) =>
          Number(b) -
          Number(a)
      )
      .forEach(
        year =>
          slideQueue.push({
            type: "yearRecap",
            year
          })
      );
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
    slide.type === "random"
  ) {
    renderMovie(
      pickRandomReviewedMovie(),
      "RANDOM REVIEW"
    );

  } else if (
    slide.type === "factsOverview"
  ) {
    renderFactsOverview();

  } else if (
    slide.type === "factsActivity"
  ) {
    renderFactsActivity();

  } else if (
    slide.type === "yearAgoToday"
  ) {
    renderYearAgoToday();

  } else if (
    slide.type === "topRated"
  ) {
    renderMovie(
      pickRandom(data.topRated),
      "TOP RATED"
    );

  } else if (
    slide.type === "recent"
  ) {
    renderRecent();

  } else if (
    slide.type === "favorite"
  ) {
    renderMovie(
      pickRandom(data.favorites),
      "FAVORITE"
    );

  } else if (
    slide.type === "top100"
  ) {
    const movie =
      pickRandom(data.top100);

    renderMovie(
      movie,
      "TOP 100",
      {
        rank:
          movie?.position
      }
    );

  } else if (
    slide.type === "worst"
  ) {
    renderMovie(
      pickRandom(data.worstRated),
      "WORST MOVIES"
    );

  } else if (
    slide.type === "yearRecap"
  ) {
    renderYearRecap(
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
      () =>
        showSlide(
          slideIndex + 1
        ),
      settings.slideDuration
    );
}

function pickRandom(list) {
  const clean =
    (list || [])
      .filter(isRealMovie);

  if (!clean.length) {
    return null;
  }

  return clean[
    Math.floor(
      Math.random() *
      clean.length
    )
  ];
}

function pickRandomReviewedMovie() {
  const movies =
    getRealMovies()
      .filter(hasReview);

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
  label,
  options = {}
) {
  if (!isRealMovie(movie)) {
    renderEmpty(
      "No movie available."
    );

    return;
  }

  const title =
    stripTags(
      movie.title ||
      movie.name ||
      ""
    );

  const review =
    stripTags(
      movie.review ||
      ""
    );

  const rank =
    options.rank
      ? ` <span class="title-rank">#${escapeHTML(
          options.rank
        )}</span>`
      : "";

  setBackgroundImage(
    movie.poster || ""
  );

  slideRoot.innerHTML = `
    <section class="movie-slide">

      <div class="poster-column">

        ${
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
            : `
              <div class="poster poster-empty">
                ${escapeHTML(title)}
              </div>
            `
        }

      </div>

      <div class="movie-info">

        <p class="eyebrow">
          ${escapeHTML(label)}
        </p>

        <h1 class="movie-title">
          ${escapeHTML(title)}${rank}
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

        ${
          review
            ? `
              <div class="movie-review">
                “${escapeHTML(review)}”
              </div>
            `
            : ""
        }

      </div>

    </section>
  `;
}

function renderFactsOverview() {
  setBackgroundImage("");

  const facts =
    data?.facts || {};

  slideRoot.innerHTML =
    factPage(
      "HENRY'S LETTERBOXD",
      [
        [
          facts.totalFilms ?? "—",
          "FILMS"
        ],
        [
          facts.ratings ?? "—",
          "RATINGS"
        ],
        [
          facts.reviews ?? "—",
          "REVIEWS"
        ],
        [
          facts.watchlist ?? "—",
          "WATCHLIST"
        ]
      ]
    );
}

function renderFactsActivity() {
  setBackgroundImage("");

  const facts =
    data?.facts || {};

  slideRoot.innerHTML =
    factPage(
      "WATCHING RIGHT NOW",
      [
        [
          facts.thisYear ?? "—",
          "THIS YEAR"
        ],
        [
          facts.thisMonth ?? "—",
          "THIS MONTH"
        ],
        [
          facts.thisWeek ?? "—",
          "THIS WEEK"
        ],
        [
          facts.diaryEntries ?? "—",
          "DIARY ENTRIES"
        ]
      ]
    );
}

function factPage(
  title,
  items
) {
  return `
    <section class="facts-slide">

      <div class="facts-heading">
        ${escapeHTML(title)}
      </div>

      <div class="facts-grid">

        ${items
          .map(
            ([number, label]) => `
              <div class="fact-card">

                <span class="fact-number">
                  ${escapeHTML(number)}
                </span>

                <span class="fact-label">
                  ${escapeHTML(label)}
                </span>

              </div>
            `
          )
          .join("")}

      </div>

    </section>
  `;
}

function renderYearAgoToday() {
  const entries =
    (data?.yearAgoToday || [])
      .filter(isRealMovie);

  const movie =
    pickRandom(entries);

  if (!movie) {
    renderFactsActivity();
    return;
  }

  renderMovie(
    movie,
    "ONE YEAR AGO TODAY"
  );
}

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
                  stripTags(
                    movie.title ||
                    movie.name ||
                    ""
                  )
                )}"
              >
            `
          )
          .join("")}

      </div>

    </section>
  `;
}

function renderYearRecap(year) {
  setBackgroundImage("");

  const movies =
    (
      data?.yearLists?.[year] ||
      []
    ).slice(0, 8);

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
          YEAR RECAP
        </div>

        <h1 class="year-number">
          ${escapeHTML(year)}
        </h1>

        <div class="year-subtitle">
          HENRY'S RANKING
        </div>

      </div>

      <div class="year-poster-grid">

        ${movies
          .map(
            (movie, index) => {

              const title =
                stripTags(
                  movie.title ||
                  movie.name ||
                  ""
                );

              const rank =
                movie.position ||
                index + 1;

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
                              title
                            )}"
                          >
                        `
                        : `
                          <div
                            class="year-poster year-poster-empty"
                          >
                            ${escapeHTML(title)}
                          </div>
                        `
                    }

                    <div class="year-rank">
                      #${escapeHTML(rank)}
                    </div>

                  </div>

                  <div class="year-movie-title">
                    ${escapeHTML(title)}
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

function renderEmpty(message) {
  setBackgroundImage("");

  slideRoot.innerHTML = `
    <section class="empty-slide">
      <h1>
        ${escapeHTML(message)}
      </h1>
    </section>
  `;
}

function setBackgroundImage(url) {
  backgroundImage.style.backgroundImage =
    url
      ? `url("${String(url).replace(
          /"/g,
          "%22"
        )}")`
      : "none";
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

  if (!Number.isFinite(value)) {
    return "";
  }

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

  const date =
    new Date(
      `${dateString}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return stripTags(
      dateString
    );
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric"
    }
  );
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
        () =>
          playStateIcon
            .classList
            .add("hidden"),
        1800
      );
  }
}

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
      `Build ${BUILD_NUMBER}`;
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
  buildSlideQueue();
  showSlide(0);
}

function getContrastTextColor(hex) {
  const clean =
    String(hex)
      .replace("#", "");

  const r =
    parseInt(
      clean.substring(
        0,
        2
      ),
      16
    );

  const g =
    parseInt(
      clean.substring(
        2,
        4
      ),
      16
    );

  const b =
    parseInt(
      clean.substring(
        4,
        6
      ),
      16
    );

  const luminance =
    0.299 * r +
    0.587 * g +
    0.114 * b;

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
            getContrastTextColor(
              backgroundColorInput.value
            )
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

        document.documentElement
          .style
          .setProperty(
            "--frame-brightness",
            Number(
              brightnessSlider.value
            ) / 100
          );
      }
    );
}

document
  .getElementById(
    "saveSettings"
  )
  ?.addEventListener(
    "click",
    () => {
      readSettingsFromUI();
      closeSettings();
    }
  );

document
  .getElementById(
    "closeSettings"
  )
  ?.addEventListener(
    "click",
    closeSettings
  );

document
  .getElementById(
    "resetSettings"
  )
  ?.addEventListener(
    "click",
    () => {
      settings =
        structuredCloneFallback(
          DEFAULT_SETTINGS
        );

      saveSettings();
      applyVisualSettings();
      populateSettingsUI();
      buildSlideQueue();
      showSlide(0);
    }
  );

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

if (settingsHotspot) {
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

document
  .getElementById(
    "display"
  )
  ?.addEventListener(
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
  event =>
    event.preventDefault()
);

applyVisualSettings();
populateSettingsUI();
loadData();

setInterval(
  loadData,
  5 * 60 * 1000
);