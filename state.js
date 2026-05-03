// state.js — центральное состояние приложения

export const state = {
  data: null,
  currentSection: 'transport',
  researched: new Set(),
  currentPopupId: null,

  currentlyResearching: new Set(),     
  sciencePerSecond: 25,
  researchProgress: {},       
  popupRevealedState: null,    
  popupCloseTimeout: null,     

  // DOM-элементы
  sectionsEl:     document.getElementById('sections'),
  treeView:       document.getElementById('tree-view'),
  cardsContainer: document.getElementById('cards-container'),
  svg:            document.getElementById('connections'),
  popup:          document.getElementById('popup')
};

// Инициализация попапа
if (state.popup) {
  state.popup.style.display = 'none';
  state.popup.style.opacity = '0';
}