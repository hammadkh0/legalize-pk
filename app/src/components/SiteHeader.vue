<script setup lang="ts">
import { onMounted, ref } from "vue";
import ThemeToggle from "./ThemeToggle.vue";

const props = defineProps<{
  baseUrl: string;
  showSearch?: boolean;
}>();

const q = ref("");

function normalizeBase() {
  return props.baseUrl.endsWith("/") ? props.baseUrl : `${props.baseUrl}/`;
}

function homeHref() {
  return normalizeBase();
}

function applyQueryFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  q.value = params.get("q") ?? "";
}

function submitSearch() {
  const base = normalizeBase();
  const trimmed = q.value.trim();
  const url = trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base;
  window.location.assign(url);
}

onMounted(() => {
  if (props.showSearch) applyQueryFromUrl();
});
</script>

<template>
  <header class="header" role="banner">
    <div class="header__inner" :class="{ 'header__inner--compact': !showSearch }">
      <a class="brand" :href="homeHref()">
        <span class="brand__name">Legalize PK</span>
        <span class="brand__tag">Constitution of Pakistan</span>
      </a>

      <form
        v-if="showSearch"
        class="search"
        role="search"
        @submit.prevent="submitSearch"
      >
        <label class="search__label" for="site-search">Search articles</label>
        <input
          id="site-search"
          v-model="q"
          class="search__input"
          type="search"
          name="q"
          autocomplete="off"
          placeholder="Search by number, title, or phrase…"
        />
        <button class="search__btn" type="submit">Search</button>
      </form>

      <div class="header__actions">
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

/* Single-row header: brand | search | actions — all vertically centred */
.header__inner {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0.65rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

/* Brand stays fixed width so it doesn't shrink against the search bar */
.header__inner .brand {
  flex: none;
}

.header__inner--compact {
  /* No search bar: brand fills the left, actions sit at the right */
  justify-content: space-between;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: inherit;
  text-decoration: none;
}

.brand__name {
  font-family: var(--font-body);
  font-weight: 700;
  font-size: var(--step-1);
  color: var(--heading);
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.brand__tag {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.2;
}

/* Search bar grows to fill remaining header space */
.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Hide the visible label; it's still present for screen readers */
.search__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.search__input {
  flex: 1;
  font: inherit;
  font-size: var(--step--1);
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  min-width: 0;
}

.search__input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.search__btn {
  flex: none;
  font: inherit;
  font-weight: 600;
  font-size: var(--step--1);
  padding: 0.5rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
}

.search__btn:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.header__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

@media (max-width: 720px) {
  .header__inner {
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .search {
    order: 3;
    flex: 1 1 100%;
  }
}
</style>
