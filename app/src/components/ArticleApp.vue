<script setup lang="ts">
import { computed, ref } from "vue";
import { marked } from "marked";
import SiteHeader from "./SiteHeader.vue";
import CompareView from "./CompareView.vue";
import { articleLabel, formatShortIsoDate } from "../utils/format";

export type ArticleVersion = {
  commit: string;
  authoredAt: string;
  author: string;
  subject: string;
  amendmentNumber: number | null;
  amendmentLabel: string | null;
  assentDate: string | null;
  signer: string | null;
  content: string;
};

export type ArticleDetail = {
  id: string;
  number: number;
  suffix: string | null;
  path: string;
  meta: {
    title: string | null;
    firstAdded: string | null;
    lastUpdated: string | null;
    sourceUrl: string | null;
    amendments: { number: number; url: string }[];
  };
  versions: ArticleVersion[];
};

const props = defineProps<{
  baseUrl: string;
  article: ArticleDetail;
}>();

marked.use({
  gfm: true,
});

const selectedIdx = ref(Math.max(0, props.article.versions.length - 1));
const compareOpen = ref(false);

const label = computed(() => articleLabel(props.article.number, props.article.suffix));

const titleText = computed(() => {
  const t = props.article.meta.title?.trim();
  if (!t) return label.value;
  return `${label.value}: ${t}`;
});

const selected = computed(() => props.article.versions[selectedIdx.value]!);

const renderedHtml = computed(() => marked.parse(selected.value.content));

function homeHref() {
  return props.baseUrl.endsWith("/") ? props.baseUrl : `${props.baseUrl}/`;
}

function versionMenuLabel(v: ArticleVersion) {
  if (v.amendmentNumber === 0) {
    return `Original Constitution · ${formatShortIsoDate(v.assentDate)}${v.signer ? ` · ${v.signer}` : ""}`;
  }
  const name = v.amendmentLabel ?? "Amendment";
  return `${name} · ${formatShortIsoDate(v.assentDate)}${v.signer ? ` · ${v.signer}` : ""}`;
}

const canCompareToPrevious = computed(() => selectedIdx.value > 0);

const comparePair = computed(() => {
  if (!compareOpen.value || !canCompareToPrevious.value) return null;
  const after = props.article.versions[selectedIdx.value]!;
  const before = props.article.versions[selectedIdx.value - 1]!;
  return {
    before,
    after,
    beforeLabel: versionMenuLabel(before),
    afterLabel: versionMenuLabel(after),
  };
});

function selectVersion(i: number) {
  selectedIdx.value = i;
  // Keep the compare panel open if the newly selected version still has a previous one to diff against.
  // Only close it when landing on the very first version (nothing before it).
  if (i === 0) compareOpen.value = false;
}

function toggleCompare() {
  if (!canCompareToPrevious.value) return;
  compareOpen.value = !compareOpen.value;
}
</script>

<template>
  <div class="shell">
    <SiteHeader :base-url="baseUrl" :show-search="true" />

    <main id="main" class="main">
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb">
          <ol class="crumbs__list">
            <li class="crumbs__item">
              <a class="crumbs__link" :href="homeHref()">Home</a>
            </li>
            <li class="crumbs__item">
              <a class="crumbs__link" :href="homeHref()">Articles</a>
            </li>
            <li class="crumbs__item crumbs__item--current" aria-current="page">{{ label }}</li>
          </ol>
        </nav>

        <header class="page-head">
          <h1 class="h1">{{ titleText }}</h1>
        </header>

        <div class="toolbar" role="region" aria-label="Version selector">
          <div class="toolbar__row">
            <label class="toolbar__label" for="version-select">Viewing version as of</label>
            <select id="version-select" class="toolbar__select" v-model.number="selectedIdx">
              <option v-for="(v, i) in article.versions" :key="v.commit" :value="i">
                {{ versionMenuLabel(v) }}
              </option>
            </select>
          </div>

          <button
            type="button"
            class="toolbar__btn"
            :disabled="!canCompareToPrevious"
            @click="toggleCompare"
          >
            {{ compareOpen ? "Hide comparison" : "Compare with previous version" }}
          </button>
        </div>

        <p v-if="!canCompareToPrevious" class="hint">
          This is the earliest available version for this article in this dataset.
        </p>

        <div class="layout">
          <article class="article" aria-label="Article text">
            <div class="prose" v-html="renderedHtml" />

            <section v-if="article.meta.amendments.length" class="sources" aria-label="Sources">
              <h2 class="sources__title">Amendment sources (from article header)</h2>
              <ul class="sources__list">
                <li v-for="a in article.meta.amendments" :key="`${a.number}-${a.url}`">
                  <a :href="a.url" rel="noopener noreferrer">Amendment {{ a.number }}</a>
                </li>
              </ul>
            </section>

            <p v-if="article.meta.sourceUrl" class="meta-line">
              <a :href="article.meta.sourceUrl!" rel="noopener noreferrer">Primary source (PDF)</a>
            </p>
          </article>

          <aside class="history" aria-label="Article history">
            <h2 class="history__title">Article history</h2>
            <ol class="timeline">
              <li v-for="(v, i) in article.versions" :key="v.commit" class="timeline__item">
                <button
                  type="button"
                  class="timeline__btn"
                  :class="{ 'timeline__btn--active': i === selectedIdx }"
                  @click="selectVersion(i)"
                >
                  <span class="timeline__name">
                    <template v-if="v.amendmentNumber === 0">Original</template>
                    <template v-else>{{ v.amendmentLabel }}</template>
                  </span>
                  <span class="timeline__date">{{ formatShortIsoDate(v.assentDate) }}</span>
                  <span v-if="v.signer" class="timeline__signer">{{ v.signer }}</span>
                </button>
              </li>
            </ol>
          </aside>
        </div>

        <section v-if="comparePair" class="compare-wrap">
          <CompareView
            :before-label="comparePair.beforeLabel"
            :after-label="comparePair.afterLabel"
            :before-text="comparePair.before.content"
            :after-text="comparePair.after.content"
          />
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.main {
  padding: 1.25rem 1.25rem 3rem;
}

.wrap {
  max-width: var(--content-max);
  margin: 0 auto;
}

.crumbs__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  font-size: var(--step--1);
  color: var(--text-muted);
}

.crumbs__item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.crumbs__item:not(:last-child)::after {
  content: "/";
  opacity: 0.55;
}

.crumbs__link {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 600;
}

.crumbs__link:hover {
  color: var(--accent);
  text-decoration: underline;
}

.crumbs__item--current {
  font-weight: 700;
  color: var(--text);
}

.page-head {
  margin-bottom: 1rem;
}

.h1 {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--step-4);
  line-height: 1.12;
  color: var(--heading);
  letter-spacing: -0.02em;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  background: var(--accent-surface);
  border-radius: var(--radius);
  margin-bottom: 1.25rem;
}

.toolbar__row {
  display: grid;
  gap: 0.35rem;
  min-width: min(42rem, 100%);
}

.toolbar__label {
  font-weight: 700;
  font-size: var(--step--1);
  color: var(--heading);
}

.toolbar__select {
  font: inherit;
  font-size: var(--step-1);
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.toolbar__btn {
  font: inherit;
  font-weight: 700;
  font-size: var(--step--1);
  padding: 0.6rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.toolbar__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hint {
  margin: -0.5rem 0 1rem;
  color: var(--text-muted);
  font-size: var(--step-1);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
  gap: 1.25rem;
  align-items: start;
}

.article {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.15rem 1.2rem 1.25rem;
  box-shadow: var(--shadow);
}

.sources {
  margin-top: 1.5rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--border);
}

.sources__title {
  margin: 0 0 0.65rem;
  font-size: var(--step-2);
  font-family: var(--font-ui);
}

.sources__list {
  margin: 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.35rem;
  font-size: var(--step-1);
}

.meta-line {
  margin: 1rem 0 0;
  font-size: var(--step-1);
}

.history {
  position: sticky;
  top: 4.75rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1rem 1.05rem;
}

.history__title {
  margin: 0 0 0.75rem;
  font-size: var(--step-2);
  font-family: var(--font-ui);
}

.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.timeline__btn {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 0.65rem 0.75rem;
  display: grid;
  gap: 0.15rem;
}

.timeline__btn:hover {
  border-color: var(--text-muted);
}

.timeline__btn--active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}

.timeline__name {
  font-weight: 800;
  font-size: var(--step--1);
  line-height: 1.2;
}

.timeline__date {
  font-size: var(--step--1);
  color: var(--text-muted);
}

.timeline__signer {
  font-size: var(--step--1);
  color: var(--text-muted);
  line-height: 1.25;
}

.compare-wrap {
  margin-top: 1.75rem;
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .history {
    position: static;
    order: 2;
  }

  .article {
    order: 1;
  }
}
</style>
