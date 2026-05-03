
// script.js — главная логика приложения

import { state } from './state.js';
import { loadGameData } from './data.js';
import { openTechPopup, showPopupContent, createQuestionContainer, renderUnlocksList, renderTechStats } from './popup.js';
import { drawArrows } from './techTreeArrows.js';

// === ЗАПУСК ПРИЛОЖЕНИЯ ===
async function initApp() {
  const success = await loadGameData();
  if (!success) return;

  renderSections();
  switchSection('transport');
  startResearchTick();
  setupPopupCloseButton();
}

initApp();

// === ОСНОВНЫЕ ФУНКЦИИ ===

function renderSections() {
    state.sectionsEl.innerHTML = '';
    Object.entries(state.data.sections).forEach(([key, sec]) => {
        const btn = document.createElement('button');
        if (key === state.currentSection) btn.classList.add('active');
        
        if (sec.icon) {
            const img = document.createElement('img');
            img.src = sec.icon;
            img.classList.add('btn-icon');
            btn.appendChild(img);
        }

        const span = document.createElement('span');
        span.textContent = sec.name;
        btn.appendChild(span);

        btn.onclick = () => switchSection(key);
        state.sectionsEl.appendChild(btn);
    });
}

function switchSection(sectionKey) {
  state.currentSection = sectionKey;
  renderSections();
  renderTree();
  restoreSelectedCard();
  closePopup();
}

// === СИСТЕМА ТРЕБОВАНИЙ ===
export function isTechSufficient(req) {
  if (typeof req === 'string') {
    return state.researched.has(req);
  }
  const tech = state.data.technologies[req.id];
  if (!tech) return false;
  return (tech.level || 0) >= (req.minLevel || 1);
}

export function canResearch(id) {
  const reqs = state.data.technologies[id]?.requires || [];
  return reqs.every(req => isTechSufficient(req));
}

export function isRevealed(id) {
  if (state.researched.has(id)) return true;
  return canResearch(id);
}

export function getTechDisplay(id) {
  const tech = state.data.technologies[id];
  if (!tech) return null;

  const revealed = isRevealed(id);
  if (revealed) {
    return {
      name: tech.name,
      icon: tech.icon,
      description: tech.description || '',
      isRevealed: true
    };
  } else {
    return {
      name: "Неизвестная технология",
      icon: null,
      description: "",
      isRevealed: false
    };
  }
}

/* ===================== УТИЛИТЫ ===================== */
function getLevelBadgeHTML(tech) {
  if (!tech || typeof tech.level !== 'number') return '';

  const level = tech.level;
  let classes = 'level-badge';

  if (level === 0) {
    classes += ' level-0';
  } else if (tech.progressionStages && Array.isArray(tech.progressionStages)) {
    const stage = tech.progressionStages.find(s => level >= s.min && level <= s.max);
    if (stage) {
      classes += stage.key === 'divine' ? ' rainbow' : ` ${stage.key}`;
    }
  }

  return `<div class="${classes}">Ур: ${level}</div>`;
}

export function getProgressionName(tech) {
  if (!tech || typeof tech.level !== 'number' || !tech.progressionStages) return '';
  const stage = tech.progressionStages.find(s => tech.level >= s.min && tech.level <= s.max);
  return stage ? stage.name : '';
}

export function getDifficultyMultiplier(tech, level) {
  if (!tech || !tech.difficulty || !Array.isArray(tech.difficulty)) return 1.0;
  const entry = tech.difficulty.find(d => level >= d.min && level <= d.max);
  return entry ? entry.multiplier : 1.0;
}

export function formatRemainingTime(remainingSeconds) {
  if (remainingSeconds <= 0) return "00:00:00 00.00.0000";

  let sec = Math.ceil(remainingSeconds);

  const years = Math.floor(sec / (365.25 * 24 * 3600));
  sec %= (365.25 * 24 * 3600);
  const months = Math.floor(sec / (30.4375 * 24 * 3600));
  sec %= (30.4375 * 24 * 3600);
  const days = Math.floor(sec / (24 * 3600));
  sec %= (24 * 3600);
  const hours = Math.floor(sec / 3600);
  sec %= 3600;
  const minutes = Math.floor(sec / 60);
  sec %= 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')} ` +
         `${days.toString().padStart(2, '0')}.${months.toString().padStart(2, '0')}.${years.toString().padStart(4, '0')}`;
}

/* ===================== ИССЛЕДОВАНИЯ ===================== */
export function updateResearchProgressOnly() {
  if (!state.currentPopupId) return;

  const id = state.currentPopupId;
  const tech = state.data.technologies[id];
  if (!tech) return;

  const isCurrentlyRevealed = isRevealed(id);
  const isCurrentlyResearching = state.currentlyResearching.has(id);

  // Полная перерисовка только при важных изменениях
  if (!state.popupRevealedState || state.popupRevealedState !== isCurrentlyRevealed) {
    state.popupRevealedState = isCurrentlyRevealed;
    showPopupContent(id);
    return;
  }

  const wasResearchingInPopup = document.querySelector('.research-action')?.classList.contains('researching') || false;

  if (isCurrentlyResearching !== wasResearchingInPopup) {
    showPopupContent(id);
    return;
  }

  if (!isCurrentlyRevealed) return;

  // === МИНИМАЛЬНОЕ ОБНОВЛЕНИЕ (только цифры и прогресс) ===
  const progressBar = document.querySelector('.research-progress');
  const timeEl = document.querySelector('.research-time');
  const scienceEl = document.querySelector('.research-science');
  const levelContainer = document.getElementById('popup-level-container');

  const currentLevel = tech.level || 0;
  const baseScience = tech.scienceCost || 1000;
  const multiplier = getDifficultyMultiplier(tech, currentLevel);
  const requiredScience = Math.ceil(baseScience * multiplier);
  const currentScience = state.researchProgress[id] || 0;

  // Прогресс-бар
  if (progressBar) {
    progressBar.style.width = `${Math.min(100, (currentScience / requiredScience) * 100)}%`;
  }

  // Время и наука
  if (timeEl || scienceEl) {
    const activeCount = state.currentlyResearching.size || 1;
    const sciencePerTech = state.sciencePerSecond / activeCount;
    const remainingScience = Math.max(0, requiredScience - currentScience);
    const remainingSeconds = sciencePerTech > 0 ? remainingScience / sciencePerTech : Infinity;

    if (timeEl) {
      timeEl.innerHTML = `<strong>Осталось:</strong> ${formatRemainingTime(remainingSeconds)}`;
    }
    if (scienceEl) {
      scienceEl.textContent = `Наука: ${Math.floor(currentScience)} / ${requiredScience}`;
    }
  }

  // Обновление уровня (только если изменился)
  if (levelContainer) {
    const progressionName = getProgressionName(tech);
    const developmentText = (tech.level === 0) ? "Не исследована" : (progressionName || "Неизвестная стадия");

    let progressionClass = '';
    if (tech.progressionStages) {
      const stage = tech.progressionStages.find(s => 
        tech.level >= (s.min || 0) && tech.level <= (s.max || 999)
      );
      if (stage && stage.key) {
        progressionClass = stage.key === 'divine' ? 'rainbow' : stage.key;
      }
    }

    levelContainer.innerHTML = `
      <div class="popup-level-info ${progressionClass}">
        <div class="popup-level-row">
          <span class="popup-level-label">Уровень:</span>
          <span class="popup-level-value"> ${tech.level} / ${tech.maxLevel || 150}</span>
        </div>
        <div class="popup-level-row">
          <span class="popup-level-label">Развитие:</span>
          <span class="popup-progression">${developmentText}</span>
        </div>
      </div>
    `;
  }

  // Обновляем только статистику (с next-колонкой, если исследуется)
  const statsContainer = document.getElementById('popup-stats-container');
  if (statsContainer) {
    renderTechStats(id, isCurrentlyResearching);
  }

  // ←←← КРИТИЧНО: НЕ вызываем renderRequiresList и renderUnlocksList каждый тик!
  // Они вызываются только при полном showPopupContent()

  updateHeaderResearch();
}

export function renderRequiresList() {
  const tech = state.data.technologies[state.currentPopupId];
  if (!tech) return;

  const requires = tech.requires || [];
  const requiresList = document.getElementById('popup-requires-list');
  if (!requiresList) return;

  requiresList.innerHTML = '';

  if (requires.length > 0) {
    requires.forEach(req => {
      const rid = typeof req === 'string' ? req : req.id;
      const minLevel = typeof req === 'string' ? 1 : (req.minLevel || 1);
      const reqTech = state.data.technologies[rid];
      if (!reqTech) return;

      const isSufficient = isTechSufficient(req);

      const row = document.createElement('div');
      row.className = 'popup-list-row';
      if (!isSufficient) row.classList.add('requires-not-researched');

      row.style.cursor = 'pointer';
      
      // Делаем мини-карточки кликабельными, нажатие по карточке переводит нас в попап этой карточки.
      row.addEventListener('click', () => {
        const targetCard = document.querySelector(`.tech-card[data-id="${rid}"]`);
        openTechPopup(rid, targetCard);
      });

      row.innerHTML = `
        <img src="${reqTech.icon}" class="mini-icon" alt="">
        <span class="popup-tech-name">${reqTech.name} <span style="color:#88ccff;">[Ур. ${minLevel}]</span></span>
      `;

      requiresList.appendChild(row);
    });

    requiresList.style.display = 'flex';
    const label = requiresList.previousElementSibling;
    if (label) label.style.display = 'block';
  } else {
    requiresList.style.display = 'none';
    const label = requiresList.previousElementSibling;
    if (label) label.style.display = 'none';
  }
}

/* ===================== ОСНОВНЫЕ ФУНКЦИИ ИССЛЕДОВАНИЯ ===================== */
function startResearchTick() {
  setInterval(() => {
    if (state.currentlyResearching.size === 0) return;

    const activeCount = state.currentlyResearching.size;
    const sciencePerTech = state.sciencePerSecond / activeCount;

    const researchingNow = new Set(state.currentlyResearching);

    researchingNow.forEach(id => {
      const tech = state.data.technologies[id];
      if (!tech || !canResearch(id)) {
        state.currentlyResearching.delete(id);
        return;
      }

      if (!state.researchProgress[id]) state.researchProgress[id] = 0;

      const baseCost = tech.scienceCost || 1000;
      const currentLevel = tech.level || 0;
      const maxLevel = tech.maxLevel || 150;
      const multiplier = getDifficultyMultiplier(tech, currentLevel);
      const required = Math.ceil(baseCost * multiplier);   // ← без умножения на activeCount

      state.researchProgress[id] += sciencePerTech;

      if (state.researchProgress[id] >= required) {
        if (currentLevel < maxLevel) {
          tech.level = currentLevel + 1;
          state.researchProgress[id] = 0;
          state.currentlyResearching.delete(id);

          renderTree();
          restoreSelectedCard();
        } else {
          state.researchProgress[id] = required;
          if (state.currentlyResearching.has(id)) {
            state.currentlyResearching.delete(id);
          }
        }
      }
    });

    if (state.currentPopupId) {
      updateResearchProgressOnly();
    }

    updateHeaderResearch();
  }, 1000);
}

export function toggleResearch(id) {
  const tech = state.data.technologies[id];
  if (!tech) return;

  const currentLevel = tech.level || 0;
  const maxLevel = tech.maxLevel || 150;

  if (currentLevel >= maxLevel) {
    const baseCost = tech.scienceCost || 1000;
    const multiplier = getDifficultyMultiplier(tech, currentLevel);
    const required = Math.ceil(baseCost * multiplier);
    const currentProgress = state.researchProgress[id] || 0;

    if (currentProgress >= required) {
      console.warn(`Технология ${id} уже полностью исследована`);
      return;
    }
  }

  if (!canResearch(id)) return;

  if (!state.currentlyResearching.has(id) && state.currentlyResearching.size >= 4) {
    console.warn("Максимум 4 технологии можно изучать одновременно.");
    return;
  }

  if (state.currentlyResearching.has(id)) {
    state.currentlyResearching.delete(id);
  } else {
    state.currentlyResearching.add(id);
  }

  if (state.currentPopupId === id) {
    showPopupContent(id);
  }

  renderTree();
  restoreSelectedCard();
  updateHeaderResearch();
}

// === НОВАЯ ФУНКЦИЯ: центрирование на технологию ===
function focusOnTechCard(techId) {
  const tech = state.data.technologies[techId];
  if (!tech) return;

  const targetSection = tech.section;

  if (state.currentSection !== targetSection) {
    switchSection(targetSection);
  } else {
    renderTree();
  }

  setTimeout(() => {
    const cardElement = document.querySelector(`.tech-card[data-id="${techId}"]`);
    if (cardElement) {
      openTechPopup(techId, cardElement);
    } else {
      state.currentPopupId = techId;
      showPopupContent(techId);
      positionPopupRelativeToCardFallback();
    }
  }, 50);
}

/* ===================== ХЕДЕР ИССЛЕДОВАНИЙ ===================== */
let headerItems = new Map(); // id => DOM element

function calculateResearchProgress(id) {
    const tech = state.data.technologies[id];
    if (!tech) return 0;
    const currentLevel = tech.level || 0;
    const baseCost = tech.scienceCost || 1000;
    const multiplier = getDifficultyMultiplier(tech, currentLevel);
    const required = Math.ceil(baseCost * multiplier);
    const currentScience = state.researchProgress[id] || 0;
    if (required <= 0) return 100;
    return Math.min(100, Math.floor((currentScience / required) * 100));
}

let headerTooltip = null;
function createHeaderTooltip() {
    if (headerTooltip) return headerTooltip;
    headerTooltip = document.createElement('div');
    headerTooltip.id = 'header-tooltip';
    headerTooltip.className = 'header-tooltip';
    document.body.appendChild(headerTooltip);
    return headerTooltip;
}

// Основная функция — вызывается каждый тик
export function updateHeaderResearch() {
    const container = getOrCreateHeaderContainer();
    const currentIds = Array.from(state.currentlyResearching).slice(0, 4);
    const previousIds = Array.from(headerItems.keys());

    // Если список изучаемых технологий изменился — полностью перестраиваем
    const needRebuild = currentIds.length !== previousIds.length || currentIds.some(id => !headerItems.has(id));

    if (needRebuild) {
        rebuildHeaderItems(container, currentIds);
    } else {
        // Просто обновляем проценты с плавной анимацией ширины
        updateHeaderProgressOnly(currentIds);
    }
}

function getOrCreateHeaderContainer() {
    let container = document.getElementById('header-research');
    if (!container) {
        container = document.createElement('div');
        container.id = 'header-research';
        container.className = 'header-research';
        document.querySelector('header').appendChild(container);
    }
    return container;
}

function rebuildHeaderItems(container, currentIds) {
    hideHeaderTooltip(); // <-- принудительно убрать тултип перед удалением элементов

    container.innerHTML = '';
    headerItems.clear();
    const tooltip = createHeaderTooltip();

    currentIds.forEach(id => {
        const tech = state.data.technologies[id];
        if (!tech) return;

        const div = document.createElement('div');
        div.className = 'header-research-item researching';
        div.dataset.techId = id;

        let displayName = tech.name;
        if (displayName.length > 28) {
            displayName = displayName.substring(0, 25) + '...';
        }

        const progress = calculateResearchProgress(id);

const currentLevel = tech.level || 0;
const maxLevel = tech.maxLevel || 150;
const targetLevel = currentLevel < maxLevel ? currentLevel + 1 : currentLevel;

div.innerHTML = `
    <span class="header-name">${displayName} <span class="header-level">УР. ${targetLevel}</span></span>
    <span class="header-progress">[${progress}%]</span>
`;

        // События
        const showTooltip = (e) => showHeaderTooltip(tech.name, e.currentTarget);
        const hideTooltip = () => hideHeaderTooltip();
        div.addEventListener('mouseenter', showTooltip);
        div.addEventListener('mouseleave', hideTooltip);
        
        div.style.cursor = 'pointer';
        div.onclick = (e) => {
            e.stopImmediatePropagation();
            focusOnTechCard(id);
        };

        container.appendChild(div);
        headerItems.set(id, div);

        // Инициализируем начальную ширину для последующих анимаций
        requestAnimationFrame(() => {
            div.style.width = div.scrollWidth + 'px';
        });
    });
}

function updateHeaderProgressOnly(currentIds) {
    currentIds.forEach(id => {
        const element = headerItems.get(id);
        if (!element) return;

        const progress = calculateResearchProgress(id);
        const progressSpan = element.querySelector('.header-progress');
        
        if (progressSpan) {
            const newText = `[${progress}%]`;
            if (progressSpan.textContent === newText) return;

            // 1. Замеряем текущую ширину до изменений
            const oldWidth = parseFloat(element.style.width) || element.offsetWidth;
            
            // 2. Обновляем текст
            progressSpan.textContent = newText;
            
            // 3. Замеряем, какую ширину хочет контент теперь
            element.style.width = 'auto';
            const targetWidth = element.scrollWidth;

            // 4. Если разница меньше 4 пикселей — не анимируем, чтобы не было "дрожания"
            // Это покроет разницу между шириной цифр "1" и "8"
            if (Math.abs(targetWidth - oldWidth) < 4) {
                element.style.transition = 'none';
                element.style.width = oldWidth + 'px'; // Оставляем старую ширину
                return;
            }

            // 5. Если разница значимая — запускаем плавный переход
            element.style.transition = 'none';
            element.style.width = oldWidth + 'px';

            requestAnimationFrame(() => {
                element.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                element.style.width = targetWidth + 'px';
            });
        }
    });
}


function showHeaderTooltip(fullName, targetElement) {
    const tooltip = document.getElementById('header-tooltip');
    if (!tooltip || !targetElement) return;
    tooltip.textContent = fullName;
    tooltip.style.display = 'block';
    
    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.bottom + 10;
    
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top + tooltipRect.height > window.innerHeight - 15) {
        top = rect.top - tooltipRect.height - 10;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.opacity = '1';
}

function hideHeaderTooltip() {
    const tooltip = document.getElementById('header-tooltip');
    if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => {
            if (tooltip.style.opacity === '0') tooltip.style.display = 'none';
        }, 280);
    }
}


function positionPopupRelativeToCardFallback() {
  state.popup.style.left = '50%';
  state.popup.style.top = '120px';
  state.popup.style.transform = 'translateX(-50%)';
  state.popup.style.display = 'block';
  state.popup.style.opacity = '1';
}

/* ===================== РЕНДЕР ДЕРЕВА ===================== */
function renderTree() {
  state.cardsContainer.innerHTML = '';
  state.svg.innerHTML = '';

  const section = state.data.sections[state.currentSection];
  if (!section) return;

  const techs = Object.entries(state.data.technologies)
    .filter(([, t]) => t.section === state.currentSection);

  const subKeys = Object.keys(section.subsections);
  const positions = {};

  let maxRight = 400;
  let overallMaxY = 0;
  let currentY = 80;

  const levelSpacingX = 186;
  const rowSpacingY   = 180;

  subKeys.forEach((subKey) => {
    const columnTechs = techs.filter(([, t]) => t.subsection === subKey);
    if (columnTechs.length === 0) return;

    const header = document.createElement('div');
    header.className = 'subsection-header';
    header.style.left = '40px';
    header.style.top = `${currentY - 58}px`;
    header.textContent = section.subsections[subKey].name;
    state.cardsContainer.appendChild(header);

    const subsectionTechIds = new Set(columnTechs.map(([id]) => id));

    const layerTechs = {};
    columnTechs.forEach(([id, tech]) => {
      const ord = tech.order ?? 0;
      if (!layerTechs[ord]) layerTechs[ord] = [];
      layerTechs[ord].push([id, tech]);
    });

    const sortedLayers = Object.keys(layerTechs).map(Number).sort((a, b) => a - b);

    const techY = {};
    const localBaseY = currentY;
    const placed = new Set();

    columnTechs.forEach(([id, tech]) => {
      const reqs = tech.requires || [];
      const hasLocalParent = reqs.some(r => subsectionTechIds.has(typeof r === 'string' ? r : r.id));
      if (!hasLocalParent) {
        techY[id] = localBaseY + placed.size * rowSpacingY;
        placed.add(id);
      }
    });

    if (sortedLayers.length > 0) {
      const minOrder = sortedLayers[0];
      let layer0 = layerTechs[minOrder] || [];
      layer0 = layer0.filter(([id]) => !placed.has(id));
      if (layer0.length > 0) {
        layer0.sort((a, b) => a[0].localeCompare(b[0]));
        let yOffset = placed.size * rowSpacingY;
        layer0.forEach(([id]) => {
          techY[id] = localBaseY + yOffset;
          yOffset += rowSpacingY;
          placed.add(id);
        });
      }
    }

    for (let i = 1; i < sortedLayers.length; i++) {
      const layerNum = sortedLayers[i];
      const layer = layerTechs[layerNum] || [];
      const childrenByParent = {};

      layer.forEach(([childId, childTech]) => {
        const reqs = childTech.requires || [];
        let parentId = reqs.length > 0 ? (typeof reqs[0] === 'string' ? reqs[0] : reqs[0].id) : null;
        if (parentId && !subsectionTechIds.has(parentId)) parentId = null;
        const key = parentId || 'root';
        if (!childrenByParent[key]) childrenByParent[key] = [];
        childrenByParent[key].push(childId);
      });

      Object.entries(childrenByParent).forEach(([pId, childIds]) => {
        if (pId === 'root') {
          childIds.sort((a, b) => a.localeCompare(b));
          let yOff = placed.size * rowSpacingY;
          childIds.forEach(cId => {
            if (!techY[cId]) {
              techY[cId] = localBaseY + yOff;
              yOff += rowSpacingY;
              placed.add(cId);
            }
          });
          return;
        }
        if (!techY[pId]) return;
        const parentYVal = techY[pId];
        const parentTech = state.data.technologies[pId] || {};
        const orderIndex = {};
        (parentTech.unlocks || []).forEach((uid, idx) => orderIndex[uid] = idx);
        childIds.sort((a, b) => (orderIndex[b] ?? -1) - (orderIndex[a] ?? -1));

        let childIndex = 0;
        childIds.forEach(cId => {
          if (!techY[cId]) {
            techY[cId] = parentYVal + childIndex * rowSpacingY;
            childIndex++;
            placed.add(cId);
          }
        });
      });
    }

    columnTechs.forEach(([id, tech]) => {
      if (typeof tech.row === 'number') {
        techY[id] = localBaseY + tech.row * rowSpacingY;
      }
    });

    // ==================== СОЗДАНИЕ ПАРЫ ====================
    columnTechs.forEach(([id, tech]) => {
      const ord = tech.order ?? 0;
      const cardX = 40 + ord * levelSpacingX;
      const cardY = techY[id] ?? localBaseY;

      const pair = document.createElement('div');
      pair.className = 'tech-pair';
      pair.style.left = `${cardX}px`;
      pair.style.top  = `${cardY}px`;
      pair.dataset.id = id;

      const card = document.createElement('div');
      card.className = 'tech-card';
      card.dataset.id = id;

      const revealed = isRevealed(id);
      if (!revealed) card.classList.add('locked');

      const display = getTechDisplay(id);
      const iconHTML = revealed 
        ? `<img src="${tech.icon}" alt="${display.name}">`
        : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:52px; color:#555; user-select:none;">?</div>`;

      const levelBadge = getLevelBadgeHTML(tech);

      card.innerHTML = `
        <div class="card-icon-container" style="position:relative; overflow:visible;">
            ${iconHTML}
            ${levelBadge}
        </div>
        <div class="card-footer">
            <div class="card-name">${display.name}</div>
        </div>
      `;

      const target = document.createElement('div');
      target.className = 'tech-target';
      target.dataset.id = id;

      pair.appendChild(card);
      pair.appendChild(target);

      // Hover через JavaScript
      pair.addEventListener('mouseenter', () => {
        target.classList.add('target-hover');
      });
      pair.addEventListener('mouseleave', () => {
        target.classList.remove('target-hover');
      });

      // Клик
      card.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();

        const targetEl = pair.querySelector('.tech-target');
        if (targetEl) {
          targetEl.classList.remove('target-burst');
          void targetEl.offsetWidth;
          targetEl.classList.add('target-burst');
        }

        setTimeout(() => {
          openTechPopup(id, card);
        }, 120);
      });

      state.cardsContainer.appendChild(pair);

      positions[id] = { 
        x: cardX + 128,
        y: cardY + 105
      };

      maxRight = Math.max(maxRight, cardX + 200);
    });

    let subMaxY = localBaseY;
    Object.values(techY).forEach(y => subMaxY = Math.max(subMaxY, y + 156 + 40));
    overallMaxY = Math.max(overallMaxY, subMaxY);

    currentY = subMaxY + 80;
  });

  const EXTRA_HEIGHT = 600;
  state.cardsContainer.style.width  = `${maxRight + 300}px`;
  state.cardsContainer.style.height = `${overallMaxY + EXTRA_HEIGHT}px`;

  requestAnimationFrame(() => {
    state.svg.style.width  = '100%';
    state.svg.style.height = '100%';
    drawArrows(positions);
  });
}

export function positionPopupRelativeToCard(cardElement) {
  const cardRect = cardElement.getBoundingClientRect();
  const popupWidth = state.popup.offsetWidth || 720;

  let left = cardRect.right + 30;
  let top = cardRect.top;

  if (left + popupWidth > window.innerWidth - 20) {
    left = cardRect.left - popupWidth - 30;
  }
  if (top < 80) top = 80;

  state.popup.style.left = `${left}px`;
  state.popup.style.top = `${top}px`;
  state.popup.style.display = 'block';
  state.popup.style.opacity = '1';
}

export function closePopup() {
  // Убираем выделение со всех карточек
  document.querySelectorAll('.tech-card.selected').forEach(card => {
    card.classList.remove('selected');
  });

  if (state.popup) {
    state.popup.style.opacity = '0';

    if (state.popupCloseTimeout) {
      clearTimeout(state.popupCloseTimeout);
    }

    state.popupCloseTimeout = setTimeout(() => {
      if (state.popup) {
        state.popup.style.display = 'none';
        const plate = document.getElementById('popup-exterior-plate');
        if (plate) plate.style.display = 'none';
      }

      // Сбрасываем состояние
      state.popupCloseTimeout = null;
      state.currentPopupId = null;
      state.popupRevealedState = null;

      // Важно: перерисовываем дерево после закрытия попапа
      setTimeout(() => {
        renderTree();
      }, 50);

    }, 220);
  }

  const backdrop = document.getElementById('popup-backdrop');
  if (backdrop) backdrop.classList.remove('active');
}

function restoreSelectedCard() {
  if (!state.currentPopupId) return;

  // Убираем selected со всех
  document.querySelectorAll('.tech-card.selected').forEach(c => c.classList.remove('selected'));

  const card = document.querySelector(`.tech-card[data-id="${state.currentPopupId}"]`);
  if (card) {
    card.classList.add('selected');
    card.classList.add('paused-shimmer');

    setTimeout(() => {
      card.classList.remove('paused-shimmer');
    }, 80);
  }
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===

state.popup.addEventListener('click', (e) => {
  e.stopImmediatePropagation();
});

const handleOutsideClick = (e) => {
  if (e.target.closest('.tech-card')) return;
  if (e.target.closest('#popup')) return;
  closePopup();
};

state.cardsContainer.addEventListener('click', handleOutsideClick);
state.treeView.addEventListener('click', handleOutsideClick);

const backdrop = document.getElementById('popup-backdrop');
if (backdrop) {
  backdrop.addEventListener('click', () => closePopup());
}

// Драг-скролл
let isDragging = false;
let startX = 0, startY = 0, scrollLeftStart = 0, scrollTopStart = 0;

state.treeView.addEventListener('pointerdown', e => {
  if (e.button !== 0 || state.popup.style.display === 'block') return;
  isDragging = true;
  state.treeView.classList.add('dragging');
  startX = e.clientX;
  startY = e.clientY;
  scrollLeftStart = state.treeView.scrollLeft;
  scrollTopStart = state.treeView.scrollTop;
  e.preventDefault();
});

state.treeView.addEventListener('pointermove', e => {
  if (!isDragging) return;
  state.treeView.scrollLeft = scrollLeftStart - (e.clientX - startX);
  state.treeView.scrollTop  = scrollTopStart - (e.clientY - startY);
});

const stopDragging = () => {
  if (!isDragging) return;
  isDragging = false;
  state.treeView.classList.remove('dragging');
};

state.treeView.addEventListener('pointerup', stopDragging);
state.treeView.addEventListener('pointerleave', stopDragging);
document.addEventListener('pointerup', stopDragging);

function setupPopupCloseButton() {
  const closeBtn = document.getElementById('popup-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      closePopup();
    });
  }
}






// Reset button
document.getElementById('reset-btn').onclick = () => {
  import('./data.js').then(({ initResearched }) => {
    initResearched();
    renderTree();
    closePopup();
  });
};



export function updateScienceCounter() {
    const container = document.getElementById('science-counter');
    if (!container) return;

    // Получаем значение (с проверкой на существование)
    const val = state.sciencePerSecond || 0;

    // Форматируем вывод: Иконка + "+" + Значение
    container.innerHTML = `
        <img src="icons/science bonuses.svg" alt="science">
        <span class="science-status-value">
            <span class="science-plus">+</span>${val.toFixed(1)}
        </span><span style="font-size: 12px; opacity: 0.7;">/сек.</span>
    `;
}

updateScienceCounter();



/* Функция инициализирует воспроизведение файла при первом клике пользователя по документу */
function initSciencePower() {
    const audio = new Audio('the power of science.mp3');
    audio.loop = true; // Включаем зацикливание
    
    const startPlayback = () => {
        audio.play().catch(err => console.log("Ошибка воспроизведения:", err));
        // Удаляем слушатель после первого клика, чтобы не плодить копии звука
        document.removeEventListener('click', startPlayback);
    };

    document.addEventListener('click', startPlayback);
}

// Запуск логики ожидания клика
initSciencePower();


