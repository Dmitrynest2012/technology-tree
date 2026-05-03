// data.js — отвечает за загрузку данных и начальную инициализацию

import { state } from './state.js';

export async function loadGameData() {
  try {
    const response = await fetch('tech-tree.json');
    const json = await response.json();
    
    state.data = json;
    
    initResearched();
    return true;
  } catch (err) {
    console.error('Ошибка загрузки JSON:', err);
    return false;
  }
}

function initResearched() {
  state.researched.clear();
  Object.entries(state.data.technologies).forEach(([id, tech]) => {
    if (!tech.requires || tech.requires.length === 0) {
      state.researched.add(id);
    }
  });
}

// Экспортируем для использования в других модулях
export { initResearched };