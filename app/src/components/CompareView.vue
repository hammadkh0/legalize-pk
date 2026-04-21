<script setup lang="ts">
import { diffWords } from "diff";
import { computed } from "vue";
import { escapeHtml } from "../utils/html";

const props = defineProps<{
  beforeLabel: string;
  afterLabel: string;
  beforeText: string;
  afterText: string;
}>();

/**
 * Strip the metadata header table that sits at the top of every article file.
 * It is editorial scaffolding (Title, First Added, Last Updated, Source, Amendment links)
 * and should not participate in the diff shown to readers.
 */
function stripHeaderTable(md: string): string {
  const lines = md.split(/\r?\n/);
  let i = 0;
  // Skip blank lines before the table
  while (i < lines.length && lines[i].trim() === "") i++;
  // Consume contiguous pipe-table rows
  while (i < lines.length && lines[i].trim().startsWith("|")) i++;
  // Skip the blank line that follows the table
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n");
}

const sides = computed(() => {
  const before = stripHeaderTable(props.beforeText);
  const after = stripHeaderTable(props.afterText);
  const parts = diffWords(before, after);
  let left = "";
  let right = "";

  for (const p of parts) {
    if (p.added) {
      right += `<span class="hl hl--add">${escapeHtml(p.value)}</span>`;
    } else if (p.removed) {
      left += `<span class="hl hl--rem">${escapeHtml(p.value)}</span>`;
    } else {
      const t = escapeHtml(p.value);
      left += t;
      right += t;
    }
  }

  return { left, right };
});
</script>

<template>
  <section class="compare" aria-label="Comparison">
    <h2 class="compare__title">Comparing versions</h2>
    <p class="compare__note">
      Removed wording is highlighted on the left; new wording on the right.
      This is a reading aid — not a legal certification of change.
    </p>

    <div class="grid" role="region" aria-label="Side by side text">
      <section class="col" aria-label="Earlier version">
        <h3 class="col__title">Before</h3>
        <p class="col__subtitle">{{ beforeLabel }}</p>
        <div class="paper prose" v-html="sides.left" />
      </section>

      <section class="col" aria-label="Later version">
        <h3 class="col__title">After</h3>
        <p class="col__subtitle">{{ afterLabel }}</p>
        <div class="paper prose" v-html="sides.right" />
      </section>
    </div>
  </section>
</template>

<style scoped>
.compare__title {
  margin: 0 0 0.3rem;
  font-family: var(--font-ui);
  font-size: var(--step-2);
  letter-spacing: -0.01em;
}

.compare__note {
  margin: 0 0 1rem;
  font-size: var(--step--1);
  color: var(--text-muted);
  line-height: 1.45;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}

.col__title {
  margin: 0;
  font-size: var(--step-2);
  font-family: var(--font-ui);
}

.col__subtitle {
  margin: 0.25rem 0 0.65rem;
  color: var(--text-muted);
  font-size: var(--step--1);
  line-height: 1.35;
}

.paper {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.05rem;
  box-shadow: var(--shadow);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:deep(.hl) {
  border-radius: 4px;
  padding: 0.05rem 0.1rem;
}

:deep(.hl--rem) {
  background: var(--danger-bg);
  color: var(--danger-text);
}

:deep(.hl--add) {
  background: var(--success-bg);
  color: var(--success-text);
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
