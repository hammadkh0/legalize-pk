<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import SiteHeader from "./SiteHeader.vue";
import { articleLabel, formatShortIsoDate, ordinalEn } from "../utils/format";

export type ArticleIndexRow = {
  id: string;
  number: number;
  suffix: string | null;
  path: string;
  title: string | null;
  firstAdded: string | null;
  lastUpdated: string | null;
  amendments: { number: number; url: string }[];
  versions: {
    commit: string;
    assentDate: string | null;
    amendmentNumber: number | null;
    amendmentLabel: string | null;
  }[];
};

export type AmendmentIndexRow = {
  commit: string;
  signer: string | null;
  assentDate: string | null;
  amendmentNumber: number | null;
  amendmentLabel: string | null;
};

const props = defineProps<{
  baseUrl: string;
  articles: ArticleIndexRow[];
  amendments: AmendmentIndexRow[];
}>();

const query = ref("");
const selectedAmendments = ref<Set<number>>(new Set());
const signatory = ref<string>("");
const dateFrom = ref<string>("");
const dateTo = ref<string>("");

const commitToSigner = computed(() => {
  const m = new Map<string, string>();
  for (const a of props.amendments) {
    if (a.signer) m.set(a.commit, a.signer);
  }
  return m;
});

const amendmentOptions = computed(() => {
  const rows = [...props.amendments].filter((a) => a.amendmentNumber != null);
  rows.sort((a, b) => {
    const da = a.assentDate ?? "";
    const db = b.assentDate ?? "";
    return da.localeCompare(db);
  });
  return rows;
});

const signatoryOptions = computed(() => {
  const set = new Set<string>();
  for (const a of props.amendments) {
    if (a.signer) set.add(a.signer);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

function toggleAmendment(n: number) {
  const next = new Set(selectedAmendments.value);
  if (next.has(n)) next.delete(n);
  else next.add(n);
  selectedAmendments.value = next;
}

function clearFilters() {
  selectedAmendments.value = new Set();
  signatory.value = "";
  dateFrom.value = "";
  dateTo.value = "";
}

function refreshQueryFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  query.value = params.get("q") ?? "";
}

function articleMatches(a: ArticleIndexRow): boolean {
  const q = query.value.trim().toLowerCase();
  if (q) {
    const label = articleLabel(a.number, a.suffix).toLowerCase();
    const title = (a.title ?? "").toLowerCase();
    const id = a.id.toLowerCase();
    const num = String(a.number);
    if (!label.includes(q) && !title.includes(q) && !id.includes(q) && !num.includes(q)) {
      return false;
    }
  }

  if (selectedAmendments.value.size > 0) {
    const touched = new Set(
      a.versions.map((v) => v.amendmentNumber).filter((n): n is number => n != null)
    );
    // OR semantics: show an article if it was touched by *any* selected amendment.
    // (AND semantics makes results drop to ~0 very quickly.)
    let anySelected = false;
    for (const n of selectedAmendments.value) {
      if (touched.has(n)) {
        anySelected = true;
        break;
      }
    }
    if (!anySelected) return false;
  }

  if (signatory.value) {
    const ok = a.versions.some((v) => commitToSigner.value.get(v.commit) === signatory.value);
    if (!ok) return false;
  }

  if (dateFrom.value || dateTo.value) {
    const from = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00Z`) : null;
    const to = dateTo.value ? new Date(`${dateTo.value}T00:00:00Z`) : null;
    const any = a.versions.some((v) => {
      if (!v.assentDate) return false;
      const d = new Date(`${v.assentDate}T00:00:00Z`);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    if (!any) return false;
  }

  return true;
}

const filtered = computed(() => props.articles.filter(articleMatches));

const lastTouchLabel = (a: ArticleIndexRow) => {
  const last = a.versions[a.versions.length - 1];
  if (!last?.amendmentLabel) return "—";
  if (last.amendmentNumber === 0) return "Original text";
  return last.amendmentLabel;
};



function articleHref(id: string) {
  const base = props.baseUrl.endsWith("/") ? props.baseUrl : `${props.baseUrl}/`;
  return `${base}article/${id}/`;
}

onMounted(() => {
  refreshQueryFromUrl();
  window.addEventListener("popstate", refreshQueryFromUrl);
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", refreshQueryFromUrl);
});
</script>

<template>
  <div class="shell">
    <SiteHeader :base-url="baseUrl" :show-search="true" />

    <main id="main" class="main">
      <div class="layout">
        <aside class="filters" aria-label="Filters">
          <h2 class="filters__title">Filter</h2>
          <p class="filters__hint">
            Narrow the list by amendments that touched an article, date range of any version, or signatory.
          </p>

          <fieldset class="fieldset">
            <legend class="fieldset__legend">Amendments (any selected)</legend>
            <div class="checks">
              <label v-for="opt in amendmentOptions" :key="opt.commit" class="check">
                <input
                  type="checkbox"
                  :checked="selectedAmendments.has(opt.amendmentNumber!)"
                  @change="toggleAmendment(opt.amendmentNumber!)"
                />
                <span class="check__text">
                  <template v-if="opt.amendmentNumber === 0">Original (1973)</template>
                  <template v-else>{{ ordinalEn(opt.amendmentNumber!) }} Amendment</template>
                </span>
              </label>
            </div>
          </fieldset>

          <div class="field">
            <label class="field__label" for="filter-from">Version date from</label>
            <input id="filter-from" v-model="dateFrom" class="field__input" type="date" />
          </div>

          <div class="field">
            <label class="field__label" for="filter-to">Version date to</label>
            <input id="filter-to" v-model="dateTo" class="field__input" type="date" />
          </div>

          <div class="field">
            <label class="field__label" for="filter-signer">Signatory</label>
            <select id="filter-signer" v-model="signatory" class="field__input">
              <option value="">Any signatory</option>
              <option v-for="s in signatoryOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div class="filters__actions">
            <button type="button" class="btn btn--ghost" @click="clearFilters">Clear filters</button>
          </div>
        </aside>

        <section class="content" aria-label="Articles">
          <p class="eyebrow">Explore articles</p>
          <h1 class="title">Constitution of Pakistan</h1>
          <p class="lede">
            Read any article as it stood after a given amendment. Use filters to find what changed, when, and under which signatory.
          </p>

          <p class="meta" role="status">
            Showing <strong>{{ filtered.length }}</strong> of
            <strong>{{ articles.length }}</strong> articles
          </p>

          <div class="grid">
            <article v-for="a in filtered" :key="a.id" class="card">
              <div class="card__top">
                <h2 class="card__title">
                  <a class="card__link" :href="articleHref(a.id)">{{ articleLabel(a.number, a.suffix) }}</a>
                </h2>
                <span class="badge" :title="lastTouchLabel(a)">
                  <span class="badge__muted">As of</span>
                  {{ lastTouchLabel(a) }}
                </span>
              </div>

              <p class="card__subtitle">{{ a.title || "Untitled article" }}</p>

              <dl class="facts">
                <div class="facts__row">
                  <dt>First added</dt>
                  <dd>{{ a.firstAdded || "—" }}</dd>
                </div>
                <div class="facts__row">
                  <dt>Last updated (header)</dt>
                  <dd>{{ a.lastUpdated || "—" }}</dd>
                </div>
                <div class="facts__row">
                  <dt>Versions</dt>
                  <dd>{{ a.versions.length }}</dd>
                </div>
              </dl>

              <div class="card__footer">
                <a class="text-link" :href="articleHref(a.id)">Read article</a>
                <span class="muted">{{ formatShortIsoDate(a.versions[0]?.assentDate ?? null) }}</span>
              </div>
            </article>
          </div>
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
  padding: 1.5rem 1.25rem 3rem;
}

.layout {
  max-width: var(--content-max);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

.filters {
  position: sticky;
  top: 4.75rem;
  /* Scroll the whole card if its content is taller than the remaining viewport */
  max-height: calc(100vh - 5.5rem);
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1.1rem 1.25rem;
  box-shadow: var(--shadow);
  /* Thin scrollbar so it doesn't distort layout */
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.filters__title {
  margin: 0 0 0.35rem;
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.filters__hint {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: var(--step--1);
  line-height: 1.45;
}

.filters__actions {
  margin-top: 0.75rem;
}

.field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
}

.field__label {
  font-weight: 600;
  font-size: var(--step--1);
}

.field__input {
  font: inherit;
  font-size: var(--step--1);
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.fieldset {
  margin: 0 0 1rem;
  padding: 0;
  border: 0;
}

.fieldset__legend {
  padding: 0;
  margin: 0 0 0.5rem;
  font-weight: 700;
  font-size: var(--step--1);
}

/* No max-height: let all checkboxes render so the sidebar never clips content below them */
.checks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem 0.5rem;
  padding: 0.1rem 0;
}

.check {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  font-size: var(--step--1);
  line-height: 1.25;
}

.check input {
  margin-top: 0.2rem;
}

.btn {
  font: inherit;
  font-weight: 600;
  font-size: var(--step--1);
  border-radius: 10px;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.btn--ghost:hover {
  border-color: var(--text-muted);
}

.content .eyebrow {
  margin: 0 0 0.35rem;
  font-size: var(--step--1);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
}

.title {
  margin: 0 0 0.75rem;
  font-family: var(--font-body);
  font-size: var(--step-4);
  line-height: 1.15;
  color: var(--heading);
  letter-spacing: -0.02em;
}

.lede {
  margin: 0 0 1rem;
  max-width: 62ch;
  color: var(--text-muted);
  font-size: var(--step-1);
  line-height: 1.55;
}

.meta {
  margin: 0 0 1.25rem;
  color: var(--text-muted);
  font-size: var(--step-1);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.05rem 1.1rem 1rem;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.card__title {
  margin: 0;
  font-size: var(--step-2);
  line-height: 1.2;
  font-family: var(--font-body);
}

.card__link {
  color: var(--heading);
  text-decoration: none;
}

.card__link:hover {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}

.badge {
  flex: none;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--badge-text);
  background: var(--badge-bg);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  line-height: 1.4;
  max-width: 13rem;
  text-align: right;
}

/* "As of" prefix shown inline, slightly dimmer */
.badge__muted {
  display: inline;
  font-weight: 500;
  opacity: 0.8;
}

.card__subtitle {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--step-1);
  font-weight: 600;
  color: var(--text);
  line-height: 1.35;
}

.facts {
  margin: 0;
  display: grid;
  gap: 0.35rem;
}

.facts__row {
  display: grid;
  grid-template-columns: 10rem 1fr;
  gap: 0.75rem;
  font-size: var(--step--1);
}

.facts__row dt {
  margin: 0;
  color: var(--text-muted);
  font-weight: 600;
}

.facts__row dd {
  margin: 0;
}

.card__footer {
  margin-top: auto;
  padding-top: 0.35rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.text-link {
  font-weight: 700;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.muted {
  color: var(--text-muted);
  font-size: var(--step--1);
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .filters {
    position: static;
    max-height: none;
    overflow-y: visible;
  }

  .checks {
    grid-template-columns: 1fr 1fr;
  }

  .grid {
    grid-template-columns: 1fr;
  }

  .facts__row {
    grid-template-columns: 1fr;
  }
}
</style>
