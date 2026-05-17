// popup.js — всё, что связано с попапом

import { state } from './state.js';

import { 
  isRevealed, 
  getTechDisplay, 
  getProgressionName, 
  getDifficultyMultiplier, 
  formatRemainingTime,
  toggleResearch,
  canResearch,
  renderRequiresList,
  positionPopupRelativeToCard,
  closePopup,
  focusOnTechCard,   
    
  
} from './script.js';

export function createQuestionContainer() {
    const container = document.createElement('div');
    container.id = 'popup-question';
    container.style.width = '240px';
    container.style.height = '240px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    
    // Текст знака вопроса
    container.textContent = '?';
    
    // Стили текста (сделаем его чуть тусклым, как "заблокированный" объект)
    container.style.fontFamily = "'Play', sans-serif"; // Применяем шрифт
    container.style.fontSize = '120px'; // Немного увеличил для веса
    container.style.fontWeight = '200';
    container.style.color = 'rgba(85, 85, 85, 0.5)'; // Полупрозрачный серый
    
    // Те же опасные линии на фоне
    container.style.background = `
        repeating-linear-gradient(
            -45deg,
            rgba(255, 200, 0, 0.12),
            rgba(255, 200, 0, 0.12) 15px,
            transparent 15px,
            transparent 30px
        ),
        #0f0f1e
    `;
    
    container.style.borderRadius = '8px';
    container.style.clipPath = 'polygon(12px 0, 100% 0, 100% calc(100% - 40px), calc(100% - 40px) 100%, 0 100%, 0 14px)';
    container.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.5)'; // Тень поглубже
    
    const popupIcon = document.getElementById('popup-icon');
    if (popupIcon && popupIcon.parentNode) {
        popupIcon.parentNode.insertBefore(container, popupIcon);
    }
    
    return container;
}



/* ===================== ПОПАП ===================== */
/* ===================== ПОПАП ===================== */
export function openTechPopup(id, cardElement) {
  // Отменяем возможное отложенное скрытие попапа
  if (state.popupCloseTimeout) {
    clearTimeout(state.popupCloseTimeout);
    state.popupCloseTimeout = null;
  }

  // Закрываем текущий попап мгновенно
  if (state.popup) {
    state.popup.style.display = 'none';
    state.popup.style.opacity = '0';
  }

  // Сбрасываем выделение старых карточек
  document.querySelectorAll('.tech-card.selected').forEach(card => {
    card.classList.remove('selected');
  });

  state.currentPopupId = id;
  state.popupRevealedState = isRevealed(id);

  // === Активируем backdrop ===
  let backdrop = document.getElementById('popup-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'popup-backdrop';
    backdrop.className = 'popup-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.classList.add('active');

  // Выделяем карточку
  if (cardElement) {
    cardElement.classList.add('selected');
  } else {
    const fallbackCard = document.querySelector(`.tech-card[data-id="${id}"]`);
    if (fallbackCard) fallbackCard.classList.add('selected');
  }

  // Сначала показываем контент
  showPopupContent(id);

  // Показываем сам попап
  const popup = document.getElementById('popup');
  const plate = document.getElementById('popup-exterior-plate');
   
  if (popup) {
    popup.style.display = 'block';
    if (plate) plate.style.display = 'block';

    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '170px';
    popup.style.transform = 'translateX(-50%)';
    popup.style.zIndex = '9999';

    requestAnimationFrame(() => {
      popup.style.opacity = '1';
    });
  }

  // ===== АВТОСКОРОЛЛ К КАРТОЧКЕ (исправленный для .tech-pair) =====
  if (cardElement) {
    // Находим родительский pair
    const pair = cardElement.closest('.tech-pair');
    if (pair && state.treeView) {
      const targetScrollLeft = Math.max(0, pair.offsetLeft + 10);
      const targetScrollTop  = Math.max(0, pair.offsetTop + 32);

      state.treeView.scrollTo({
        left: targetScrollLeft,
        top: targetScrollTop,
        behavior: 'smooth'
      });
    }
  } else if (state.treeView) {
    state.treeView.scrollTo({
      left: 0,
      top: 0,
      behavior: 'smooth'
    });
  }
}


/* ===================== ХЕЛПЕРЫ ДЛЯ СТАТИСТИКИ ===================== */

function getStatDisplayValue(stat, currentLevel, nextLevel = null) {
  if (!stat?.values) {
    return { displayCurrent: "—", nextDisplay: null, direction: null };
  }

  const values = stat.values;

  // === Надёжное получение текущего значения ===
  let currentVal = values[currentLevel] ?? values[String(currentLevel)];

  if (currentVal === undefined) {
    // Ищем ближайшее меньшее или равное значение (fallback)
    for (let i = currentLevel; i >= 0; i--) {
      const key = String(i);                    // <-- явно в строку
      if (values.hasOwnProperty(key) || values[i] !== undefined) {
        currentVal = values[key] ?? values[i];
        break;
      }
    }
  }

  currentVal = currentVal ?? 0;

  // === Следующий уровень ===
  let nextDisplay = null;
  let direction = null;

  if (nextLevel !== null) {
    const nextVal = values[nextLevel] ?? values[String(nextLevel)];

    if (nextVal !== undefined) {
      nextDisplay = nextVal;
      
      if (typeof currentVal === 'number' && typeof nextVal === 'number') {
        const naturalDirection = nextVal > currentVal ? 'up' : 'down';
        direction = stat.trend === 'up' ? 'up' : 
                    stat.trend === 'down' ? 'down' : naturalDirection;
      }
    }
  }

  // Если есть maxValue (для форматов типа 150 / 200) — обработай аналогично
  // ...

  return { displayCurrent: currentVal, nextDisplay, direction };
}
/* ===================== РЕНДЕР СПЕЦИФИЧЕСКИХ ХАРАКТЕРИСТИК ===================== */
export function renderTechStats(id, showNextColumn = false) {
    const container = document.getElementById('popup-stats-container');
    if (!container) return;

    const tech = state.data.technologies[id];
    if (!tech) {
        container.style.display = 'none';
        return;
    }

    const revealed = isRevealed(id); 
    if (!revealed) {
        // Технология ещё не разблокирована
        container.innerHTML = `
            <div class="stats-header">Характеристики технологии</div>
            <div class="stats-grid" style="grid-template-columns: 1fr; text-align: center; padding: 40px 20px; min-height: 160px;">
                <div style="color: #777; font-size: 1.05rem; font-style: italic;">
                    Характеристики ещё неизвестны
                </div>
            </div>
        `;
        container.style.display = 'block';
        return;
    }

    // Если технология разблокирована — показываем нормальные статы
    if (!Array.isArray(tech.stats) || tech.stats.length === 0) {
        container.style.display = 'none';
        return;
    }

    const currentLevel = tech.level || 0;
    const maxLevel = tech.maxLevel || 150;
    const isAtMax = currentLevel >= maxLevel;
    const isResearching = state.currentlyResearching.has(id);
    const nextLevel = (showNextColumn && !isAtMax) ? currentLevel + 1 : null;

    let html = `
        <div class="stats-header">Характеристики технологии</div>
        <div class="stats-grid ${showNextColumn ? 'show-next' : ''} ${isResearching ? 'researching' : ''}">
    `;

    tech.stats.forEach(stat => {
        const { displayCurrent, nextDisplay, direction } = getStatDisplayValue(stat, currentLevel, nextLevel);
        
        // Формируем HTML для стрелки
        const arrowHTML = direction 
            ? `<span class="stat-arrow ${direction}">${direction === 'up' ? '▲' : '▼'}</span>` 
            : '&nbsp;';

        // Добавляем класс direction (up/down) к stat-next, чтобы текст окрасился так же, как стрелка
        const nextClass = direction ? `stat-next ${direction}` : 'stat-next';

        html += `
            <div class="stat-row">
                <div class="stat-name">${stat.name}</div>
                <div class="stat-current">${displayCurrent}</div>
                <div class="stat-change">${arrowHTML}</div>
                <div class="${nextClass}">${nextDisplay || '&nbsp;'}</div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    container.style.display = 'block';
}


function updateResearchActionButton(id) {
  const actionBtn = document.getElementById('research-action-btn');
  if (!actionBtn) return;

  const tech = state.data.technologies[id];
  if (!tech) return;

  const isResearching = state.currentlyResearching.has(id);
  const currentLevel = tech.level || 0;
  const maxLevel = tech.maxLevel || 150;

  const baseScience = tech.scienceCost || 1000;
  const multiplier = getDifficultyMultiplier(tech, currentLevel);
  const activeCount = state.currentlyResearching.size || 1;
  const requiredScience = Math.ceil(baseScience * multiplier * activeCount);
  const currentScience = state.researchProgress[id] || 0;

  const isAtMaxLevelAndProgress = (currentLevel >= maxLevel) && (currentScience >= requiredScience);

  let actionText = "ИЗУЧИТЬ";
  let statusClass = "paused";

  if (isResearching) {
    actionText = "ОСТАНОВИТЬ";
    statusClass = "researching";
  } 
  else if (isAtMaxLevelAndProgress) {
    actionText = "ПРЕДЕЛ РАЗВИТИЯ";
    statusClass = "max-level";
  } 
  else if (currentLevel >= 1) {
    actionText = "УЛУЧШИТЬ";
    statusClass = "paused";
  }

  actionBtn.textContent = actionText;
  actionBtn.className = `research-action ${statusClass}`;
}

function getProgressionClass(tech) {
  if (!tech || typeof tech.level !== 'number' || !tech.progressionStages) {
    return '';
  }

  const stage = tech.progressionStages.find(s => 
    tech.level >= (s.min || 0) && tech.level <= (s.max || 999)
  );

  if (!stage || !stage.key) return '';

  return stage.key === 'divine' ? 'rainbow' : stage.key;
}

function getRequiredLevelFromParent(childId, parentId) {
  const childTech = state.data.technologies[childId];
  if (!childTech || !childTech.requires) return 1;

  for (const req of childTech.requires) {
    const reqId = typeof req === 'string' ? req : req.id;
    if (reqId === parentId) {
      return typeof req === 'string' ? 1 : (req.minLevel || 1);
    }
  }
  return 1;
}

export function renderUnlocksList(parentId) {
    const tech = state.data.technologies[parentId];
    if (!tech) return;

    const unlocks = tech.unlocks || [];
    const unlocksList = document.getElementById('popup-unlocks-list');
    if (!unlocksList) return;

    unlocksList.innerHTML = '';

    if (unlocks.length > 0) {
        unlocks.forEach(uid => {
            const uDisplay = getTechDisplay(uid);
            const uTech = state.data.technologies[uid];
            if (!uTech) return;

            const requiredLevel = getRequiredLevelFromParent(uid, parentId);
            const row = document.createElement('div');
            row.className = 'popup-list-row';
            row.style.cursor = 'pointer';

            // === КОРРЕКТНАЯ ОБРАБОТКА КЛИКА (работает между разделами) ===
            row.addEventListener('click', (e) => {
                e.stopImmediatePropagation(); // защита от всплытия

                const targetCard = document.querySelector(`.tech-card[data-id="${uid}"]`);

                if (targetCard) {
                    // Та же секция — стандартное поведение
                    openTechPopup(uid, targetCard);
                } else {
                    // Другая секция — переключаем раздел
                    focusOnTechCard(uid);
                }
            });

            if (uDisplay.isRevealed) {
                row.innerHTML = `
                    <img src="${uTech.icon}" class="mini-icon" alt="">
                    <div class="text-content">
                        <span class="popup-tech-name">${uTech.name}</span>
                        <span class="level-info">на уровне: ${requiredLevel}</span>
                    </div>
                `;
            } else {
                row.innerHTML = `
                    <div style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:18px; color:#555; background:#1a1a2e; border:1px solid #3388ff99; border-radius:4px; flex-shrink:0; clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px);">?</div>
                    <div class="text-content">
                        <span class="popup-tech-name">Неизвестная технология</span>
                        <span class="level-info">на уровне: ${requiredLevel}</span>
                    </div>
                `;
            }
            unlocksList.appendChild(row);
        });

        unlocksList.style.display = 'flex';
        const label = unlocksList.previousElementSibling;
        if (label) label.style.display = 'block';
    } else {
        unlocksList.style.display = 'none';
        const label = unlocksList.previousElementSibling;
        if (label) label.style.display = 'none';
    }
}


export function showPopupContent(id) {
  const tech = state.data.technologies[id];
  if (!tech) return;

  const revealed = isRevealed(id);
  const display = getTechDisplay(id);

  const popupIcon = document.getElementById('popup-icon');
  const qContainer = document.getElementById('popup-question') || createQuestionContainer();

  if (revealed) {
    popupIcon.src = tech.icon || '';
    popupIcon.style.display = 'block';
    if (qContainer) qContainer.style.display = 'none';
  } else {
    popupIcon.style.display = 'none';
    qContainer.style.display = 'flex';
  }

  const popupRight = document.querySelector('.popup-right');
  document.getElementById('popup-name').textContent = display.name;

  // === УРОВЕНЬ И РАЗВИТИЕ ===
  let levelHTML = '';
  let progressionClass = '';

  if (revealed && typeof tech.level === 'number') {
    const progressionName = getProgressionName(tech);
    const developmentText = (tech.level === 0) ? "Не исследована" : (progressionName || "Неизвестная стадия");

    progressionClass = getProgressionClass(tech);

    const currentLevel = tech.level;
    const maxLevel = tech.maxLevel || 150;

    levelHTML = `
      <div class="popup-level-info ${progressionClass}">
        <div class="popup-level-row">
          <span class="popup-level-label">Уровень:</span>
          <span class="popup-level-value"> ${currentLevel} / ${maxLevel}</span>
        </div>
        <div class="popup-level-row">
          <span class="popup-level-label">Развитие:</span>
          <span class="popup-progression">${developmentText}</span>
        </div>
      </div>
    `;
  }

  let levelContainer = document.getElementById('popup-level-container');
  if (!levelContainer) {
    levelContainer = document.createElement('div');
    levelContainer.id = 'popup-level-container';
    popupRight.appendChild(levelContainer);   // просто добавляем
  }
  levelContainer.innerHTML = levelHTML;

// === БЛОК СПЕЦИФИЧЕСКИХ ХАРАКТЕРИСТИК (вынесен в правую колонку) ===
let statsContainer = document.getElementById('popup-stats-container');
if (!statsContainer) {
  statsContainer = document.createElement('div');
  statsContainer.id = 'popup-stats-container';
  popupRight.appendChild(statsContainer);
}
renderTechStats(id, false);

  // === БЛОК ИССЛЕДОВАНИЯ ===
  let researchHTML = '';
  if (revealed) {
    const isResearching = state.currentlyResearching.has(id);
    const currentLevel = tech.level || 0;
    const maxLevel = tech.maxLevel || 150;

    const baseScience = tech.scienceCost || 1000;
    const multiplier = getDifficultyMultiplier(tech, currentLevel);
    const activeCount = state.currentlyResearching.size || 1;
    const sciencePerTech = state.sciencePerSecond / activeCount;

    const requiredScience = Math.ceil(baseScience * multiplier * activeCount);
    const currentScience = state.researchProgress[id] || 0;
    const remainingScience = Math.max(0, requiredScience - currentScience);
    const remainingSeconds = remainingScience / sciencePerTech;

    const isAtMaxLevelAndProgress = (currentLevel >= maxLevel) && (currentScience >= requiredScience - 1);

    let actionText = "ИЗУЧИТЬ";
    let statusClass = "paused";

    if (isResearching) {
      actionText = "ОСТАНОВИТЬ";
      statusClass = "researching";
    } 
    else if (isAtMaxLevelAndProgress) {
      actionText = "ПРЕДЕЛ РАЗВИТИЯ";
      statusClass = "max-level";
    } 
    else if (currentLevel >= 1) {
      actionText = "УЛУЧШИТЬ";
      statusClass = "paused";
    }

    researchHTML = `
      <div class="research-container ${!canResearch(id) ? 'locked' : ''}" data-id="${id}">

      <!-- === НОВАЯ ПЛАШКА УЧЁНОГО === -->
        <div class="scientist-plaque">
          <img src="scientist.png" alt="Учёный" class="scientist-icon">
        </div>


        <div class="research-left">
          <div class="research-action ${statusClass}" id="research-action-btn">
            ${actionText}
          </div>
          <div style="font-size:0.85rem; color:#88ccff88;">
            ${isResearching ? "ведутся исследования" : 
              isAtMaxLevelAndProgress ? "достигнут предел развития" : "исследования не ведутся"}
          </div>
          <div class="research-progress-wrapper">
            <div class="research-progress" style="width: ${Math.min(100, (currentScience / requiredScience) * 100)}%"></div>
          </div>
        </div>
        <div class="research-right">
          <div class="research-time">
            <strong>Осталось:</strong> ${isAtMaxLevelAndProgress ? "—" : formatRemainingTime(remainingSeconds)}
          </div>
          <div class="research-science">
            Наука: ${Math.floor(currentScience)} / ${requiredScience}
          </div>
        </div>
      </div>
    `;
  }

  let researchContainer = document.getElementById('popup-research-container');
  if (!researchContainer) {
    researchContainer = document.createElement('div');
    researchContainer.id = 'popup-research-container';
    popupRight.appendChild(researchContainer);
  }
  researchContainer.innerHTML = researchHTML;

  const actionBtn = document.getElementById('research-action-btn');
  if (actionBtn) {
    const newBtn = actionBtn.cloneNode(true);
    actionBtn.parentNode.replaceChild(newBtn, actionBtn);

    const statsCont = document.getElementById('popup-stats-container');

            newBtn.addEventListener('mouseenter', () => {
      renderTechStats(id, true);
      const grid = document.querySelector('#popup-stats-container .stats-grid');
  if (grid) grid.classList.add('show-hover');
    });

    newBtn.addEventListener('mouseleave', () => {
      const isResearching = state.currentlyResearching.has(id);
      renderTechStats(id, isResearching);   // если идёт изучение — оставляем showNextColumn = true
      const grid = document.querySelector('#popup-stats-container .stats-grid');
  if (grid) grid.classList.remove('show-hover');
    });

    

    newBtn.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      e.preventDefault();

      const techData = state.data.technologies[id];
      const currentLevel = techData.level || 0;
      const maxLevel = techData.maxLevel || 150;
      const required = Math.ceil((techData.scienceCost || 1000) * getDifficultyMultiplier(techData, currentLevel) * (state.currentlyResearching.size || 1));
      const currentScience = state.researchProgress[id] || 0;

      if (currentLevel >= maxLevel && currentScience >= required - 1) return;

      toggleResearch(id);
      setTimeout(() => updateResearchActionButton(id), 10);
    });
  }

     document.getElementById('popup-desc').textContent = revealed ? (tech.description || '') : 'Описание недоступно';

  renderRequiresList();     // ← остаётся
  renderUnlocksList(id);    // ← остаётся
}