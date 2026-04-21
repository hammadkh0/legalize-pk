<script setup lang="ts">
import { onMounted, ref } from "vue";

const STORAGE_KEY = "legalize-pk-theme";
const theme = ref<"light" | "dark">("light");

function apply(next: "light" | "dark") {
  const root = document.documentElement;
  if (next === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem(STORAGE_KEY, next);
  theme.value = next;
}

function toggle() {
  apply(theme.value === "dark" ? "light" : "dark");
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  apply(saved === "dark" || saved === "light" ? (saved as "light" | "dark") : prefersDark ? "dark" : "light");
});
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    @click="toggle"
    :aria-pressed="theme === 'dark'"
    :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
  >
    <span class="theme-toggle__text" aria-hidden="true">{{ theme === "dark" ? "Light" : "Dark" }}</span>
    <span class="sr-only">
      {{ theme === "dark" ? "Switch to light theme" : "Switch to dark theme" }}
    </span>
  </button>
</template>

<style scoped>
.theme-toggle {
  font: inherit;
  font-weight: 600;
  font-size: var(--step--1);
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  line-height: 1.2;
}

.theme-toggle:hover {
  border-color: var(--text-muted);
}

.sr-only {
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
</style>
